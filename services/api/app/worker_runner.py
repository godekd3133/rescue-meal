"""Shared scheduling contract for API-backed background workers."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any
import json
import math
import time

import httpx


WorkerTick = Callable[[str], tuple[dict[str, object], bool]]
WorkerOutput = Callable[[str], None]

MAX_WORKER_BACKOFF_SECONDS = 300.0


def bounded_backoff_delay(
    interval_seconds: float,
    consecutive_failures: int,
    *,
    max_backoff_seconds: float = MAX_WORKER_BACKOFF_SECONDS,
) -> float:
    """Return a finite exponential delay while preserving the base interval."""

    if not math.isfinite(interval_seconds) or interval_seconds <= 0:
        raise ValueError("interval_seconds must be a positive finite number")
    if not math.isfinite(max_backoff_seconds) or max_backoff_seconds <= 0:
        raise ValueError("max_backoff_seconds must be a positive finite number")
    bounded_failures = max(1, consecutive_failures)
    if interval_seconds >= max_backoff_seconds:
        return max_backoff_seconds
    failure_exponent = bounded_failures - 1
    cap_exponent = math.ceil(math.log2(max_backoff_seconds / interval_seconds))
    if failure_exponent >= cap_exponent:
        return max_backoff_seconds
    return interval_seconds * (2 ** failure_exponent)


def _print_line(value: str) -> None:
    print(value, flush=True)


def _emit_json(emit: WorkerOutput, payload: object) -> None:
    emit(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def request_http_tick(
    client: Any,
    *,
    path: str,
    headers: dict[str, str],
    payload: dict[str, object],
    workspace_id: str,
    worker_id: str,
) -> tuple[dict[str, object], bool]:
    """Make one safe API tick request and expose only bounded error metadata."""

    try:
        response = client.post(path, headers=headers, json=payload)
        response.raise_for_status()
        result = response.json()
        if not isinstance(result, dict):
            return {"workspace_id": workspace_id, "worker_id": worker_id, "error": "invalid_response"}, True
        return result, bool(result.get("error"))
    except (httpx.HTTPError, ValueError) as exc:
        return {"workspace_id": workspace_id, "worker_id": worker_id, "error": exc.__class__.__name__}, True


def run_worker_loop(
    *,
    workspace_ids: Sequence[str],
    worker_id: str,
    interval_seconds: float,
    once: bool,
    tick: WorkerTick,
    sleep: Callable[[float], None] = time.sleep,
    emit: WorkerOutput | None = None,
) -> int:
    """Run workspace ticks and return non-zero for a failed ``--once`` cycle.

    ``tick`` returns ``(payload, failed)``. A failed payload may be an HTTP
    transport error or a successful HTTP response whose API body contains an
    execution error. Persistent failures back off up to five minutes; a clean
    cycle resets the failure streak to the configured base interval.
    """

    if not workspace_ids:
        raise ValueError("workspace_ids must not be empty")
    output = emit or _print_line
    failure_streak = 0
    while True:
        cycle_failed = False
        for workspace_id in workspace_ids:
            payload, failed = tick(workspace_id)
            _emit_json(output, payload)
            cycle_failed = cycle_failed or failed

        if once:
            return 1 if cycle_failed else 0

        previous_failure_streak = failure_streak
        if cycle_failed:
            failure_streak += 1
            delay_seconds = bounded_backoff_delay(interval_seconds, failure_streak)
            _emit_json(
                output,
                {
                    "status": "backoff",
                    "worker_id": worker_id,
                    "delay_seconds": delay_seconds,
                    "consecutive_failures": failure_streak,
                },
            )
        else:
            failure_streak = 0
            delay_seconds = interval_seconds
            if previous_failure_streak:
                _emit_json(
                    output,
                    {
                        "status": "recovered",
                        "worker_id": worker_id,
                        "previous_failures": previous_failure_streak,
                    },
                )
        sleep(delay_seconds)
