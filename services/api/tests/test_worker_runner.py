import json

import pytest

from app.worker_runner import bounded_backoff_delay, run_worker_loop


def test_bounded_backoff_doubles_and_caps_at_five_minutes() -> None:
    assert [bounded_backoff_delay(30, failures) for failures in range(1, 6)] == [30, 60, 120, 240, 300]
    assert bounded_backoff_delay(30, 20) == 300
    assert bounded_backoff_delay(30, 1_000_000) == 300


@pytest.mark.parametrize("interval_seconds", [0, -1, float("inf")])
def test_backoff_rejects_invalid_interval_values(interval_seconds: float) -> None:
    with pytest.raises(ValueError):
        bounded_backoff_delay(interval_seconds, 1)


def test_backoff_uses_the_base_interval_before_the_first_failure() -> None:
    assert bounded_backoff_delay(30, 0) == 30


def test_once_returns_failure_for_http_or_api_tick_errors() -> None:
    output: list[str] = []

    def tick(workspace_id: str):
        return {"workspace_id": workspace_id, "error": "api_tick_error"}, True

    result = run_worker_loop(
        workspace_ids=("workspace-a",),
        worker_id="worker-a",
        interval_seconds=30,
        once=True,
        tick=tick,
        emit=output.append,
    )

    assert result == 1
    assert json.loads(output[0]) == {"workspace_id": "workspace-a", "error": "api_tick_error"}


def test_worker_loop_backs_off_after_failure_and_resets_after_recovery() -> None:
    output: list[str] = []
    sleeps: list[float] = []
    outcomes = iter(((
        {"workspace_id": "workspace-a", "error": "ConnectError"},
        True,
    ), ({"workspace_id": "workspace-a", "error": None}, False)))

    def tick(_workspace_id: str):
        return next(outcomes)

    def stop_after_two_cycles(delay: float) -> None:
        sleeps.append(delay)
        if len(sleeps) == 2:
            raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        run_worker_loop(
            workspace_ids=("workspace-a",),
            worker_id="worker-a",
            interval_seconds=30,
            once=False,
            tick=tick,
            sleep=stop_after_two_cycles,
            emit=output.append,
        )

    assert sleeps == [30, 30]
    assert json.loads(output[1]) == {
        "status": "backoff",
        "worker_id": "worker-a",
        "delay_seconds": 30,
        "consecutive_failures": 1,
    }
    assert json.loads(output[3]) == {
        "status": "recovered",
        "worker_id": "worker-a",
        "previous_failures": 1,
    }
