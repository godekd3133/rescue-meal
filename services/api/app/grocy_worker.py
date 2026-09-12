from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import os
import re
import secrets
import time
from typing import Any, Callable, Iterable

from pydantic import BaseModel, ConfigDict, Field

from .auth import reset_workspace, set_workspace_id


GROCY_OUTBOX_LEASE_KEY = "grocy-outbox"


class GrocyWorkerHeartbeatRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: str = Field(min_length=1, max_length=96)
    worker_id: str = Field(min_length=1, max_length=160)
    last_tick_at: datetime
    last_success_at: datetime | None = None
    lease_acquired: bool
    grocy_configured: bool
    scanned: int = Field(default=0, ge=0)
    reconciliation_marked: int = Field(default=0, ge=0)
    processed: int = Field(default=0, ge=0)
    succeeded: int = Field(default=0, ge=0)
    retried: int = Field(default=0, ge=0)
    dead_lettered: int = Field(default=0, ge=0)
    blocked: int = Field(default=0, ge=0)
    last_error: str | None = Field(default=None, max_length=160)


def _bounded_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def _bounded_float(name: str, default: float, *, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def workspace_ids_from_env() -> tuple[str, ...]:
    configured = os.getenv("RESCUE_MEAL_GROCY_WORKSPACE_IDS", "").strip()
    if not configured:
        configured = os.getenv("RESCUE_MEAL_GROCY_WORKSPACE_ID", "demo").strip()
    workspace_ids = tuple(dict.fromkeys(item.strip() for item in configured.split(",") if item.strip()))
    if not workspace_ids:
        raise ValueError("RESCUE_MEAL_GROCY_WORKSPACE_IDS가 비어 있습니다.")
    invalid = [item for item in workspace_ids if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", item)]
    if invalid:
        raise ValueError("Grocy worker workspace ID 형식이 잘못되었습니다.")
    return workspace_ids


@dataclass(frozen=True)
class GrocyWorkerSettings:
    workspace_ids: tuple[str, ...]
    worker_id: str
    interval_seconds: float = 30.0
    lease_seconds: int = 120
    stale_after_seconds: int = 900
    process_limit: int = 20

    @classmethod
    def from_env(cls) -> "GrocyWorkerSettings":
        return cls(
            workspace_ids=workspace_ids_from_env(),
            worker_id=os.getenv("RESCUE_MEAL_GROCY_WORKER_ID", "").strip() or f"grocy-worker-{secrets.token_urlsafe(8)}",
            interval_seconds=_bounded_float("RESCUE_MEAL_GROCY_WORKER_INTERVAL_SECONDS", 30.0, minimum=5.0, maximum=3600.0),
            lease_seconds=_bounded_int("RESCUE_MEAL_GROCY_WORKER_LEASE_SECONDS", 120, minimum=30, maximum=3600),
            stale_after_seconds=_bounded_int("RESCUE_MEAL_GROCY_STALE_AFTER_SECONDS", 900, minimum=60, maximum=86_400),
            process_limit=_bounded_int("RESCUE_MEAL_GROCY_PROCESS_LIMIT", 20, minimum=1, maximum=100),
        )


@dataclass(frozen=True)
class GrocyWorkerTickResult:
    workspace_id: str
    worker_id: str
    lease_acquired: bool
    grocy_configured: bool
    scanned: int = 0
    reconciliation_marked: int = 0
    processed: int = 0
    succeeded: int = 0
    retried: int = 0
    dead_lettered: int = 0
    blocked: int = 0
    error: str | None = None

    def as_dict(self) -> dict[str, object]:
        return {
            "workspace_id": self.workspace_id,
            "worker_id": self.worker_id,
            "lease_acquired": self.lease_acquired,
            "grocy_configured": self.grocy_configured,
            "scanned": self.scanned,
            "reconciliation_marked": self.reconciliation_marked,
            "processed": self.processed,
            "succeeded": self.succeeded,
            "retried": self.retried,
            "dead_lettered": self.dead_lettered,
            "blocked": self.blocked,
            "error": self.error,
        }


class GrocyWorker:
    """Run one safe outbox/reconciliation tick for each configured workspace.

    The worker deliberately receives the API integration functions as
    callables. This keeps the scheduling/lease boundary testable without
    creating a second HTTP client or duplicating Grocy operation logic.
    """

    def __init__(
        self,
        *,
        store: Any,
        settings: GrocyWorkerSettings,
        grocy_configured: Callable[[], bool],
        scan: Callable[..., Any],
        process: Callable[..., Any],
    ) -> None:
        self.store = store
        self.settings = settings
        self.grocy_configured = grocy_configured
        self.scan = scan
        self.process = process

    def tick_workspace(self, workspace_id: str) -> GrocyWorkerTickResult:
        workspace_lease_acquired = False
        acquire_workspace = getattr(self.store, "acquire_workspace", None)
        if callable(acquire_workspace):
            acquire_workspace(workspace_id, seed=False)
            workspace_lease_acquired = True
        else:
            self.store.provision_workspace(workspace_id, seed=False)
        workspace_token = set_workspace_id(workspace_id)
        lease_acquired = False
        configured = self.grocy_configured()
        result: GrocyWorkerTickResult
        try:
            lease_acquired = self.store.acquire_grocy_worker_lease(
                lease_key=GROCY_OUTBOX_LEASE_KEY,
                worker_id=self.settings.worker_id,
                lease_seconds=self.settings.lease_seconds,
            )
            if not lease_acquired:
                result = GrocyWorkerTickResult(
                    workspace_id=workspace_id,
                    worker_id=self.settings.worker_id,
                    lease_acquired=False,
                    grocy_configured=configured,
                )
            else:
                scan_result = self.scan(
                    stale_after_seconds=self.settings.stale_after_seconds,
                    limit=self.settings.process_limit,
                    worker_id=self.settings.worker_id,
                    lease_key=GROCY_OUTBOX_LEASE_KEY,
                    lease_seconds=self.settings.lease_seconds,
                    lease_held=True,
                )
                process_result = None
                if configured:
                    process_result = self.process(
                        self.settings.process_limit,
                        worker_id=self.settings.worker_id,
                        lease_key=GROCY_OUTBOX_LEASE_KEY,
                        lease_seconds=self.settings.lease_seconds,
                        lease_held=True,
                    )
                result = GrocyWorkerTickResult(
                    workspace_id=workspace_id,
                    worker_id=self.settings.worker_id,
                    lease_acquired=True,
                    grocy_configured=configured,
                    scanned=getattr(scan_result, "scanned", 0),
                    reconciliation_marked=getattr(scan_result, "marked", 0),
                    processed=getattr(process_result, "processed", 0),
                    succeeded=getattr(process_result, "succeeded", 0),
                    retried=getattr(process_result, "retried", 0),
                    dead_lettered=getattr(process_result, "dead_lettered", 0),
                    blocked=getattr(process_result, "blocked", 0),
                )
        except Exception as exc:
            result = GrocyWorkerTickResult(
                workspace_id=workspace_id,
                worker_id=self.settings.worker_id,
                lease_acquired=lease_acquired,
                grocy_configured=configured,
                error=exc.__class__.__name__,
            )
        finally:
            try:
                if lease_acquired:
                    self.store.release_grocy_worker_lease(
                        lease_key=GROCY_OUTBOX_LEASE_KEY,
                        worker_id=self.settings.worker_id,
                    )
                self.store.record_grocy_worker_heartbeat(
                    GrocyWorkerHeartbeatRecord(
                        workspace_id=workspace_id,
                        worker_id=self.settings.worker_id,
                        last_tick_at=datetime.now(timezone.utc),
                        last_success_at=datetime.now(timezone.utc) if result.error is None and result.lease_acquired else None,
                        lease_acquired=result.lease_acquired,
                        grocy_configured=result.grocy_configured,
                        scanned=result.scanned,
                        reconciliation_marked=result.reconciliation_marked,
                        processed=result.processed,
                        succeeded=result.succeeded,
                        retried=result.retried,
                        dead_lettered=result.dead_lettered,
                        blocked=result.blocked,
                        last_error=result.error,
                    )
                )
            finally:
                reset_workspace(workspace_token)
                if workspace_lease_acquired:
                    self.store.release_workspace(workspace_id)
        return result

    def tick(self) -> list[GrocyWorkerTickResult]:
        return [self.tick_workspace(workspace_id) for workspace_id in self.settings.workspace_ids]

    def run(self, *, once: bool = False, sleep: Callable[[float], None] = time.sleep) -> Iterable[list[GrocyWorkerTickResult]]:
        while True:
            results = self.tick()
            yield results
            if once:
                return
            sleep(self.settings.interval_seconds)
