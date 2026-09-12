from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import time
from urllib.parse import quote

import httpx


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.notification_delivery import NotificationWorkerSettings
from app.worker_runner import request_http_tick, run_worker_loop


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Rescue Meal Web Push notification worker")
    parser.add_argument(
        "--once",
        action="store_true",
        help="run one workspace tick and exit; useful for health checks and scheduled jobs",
    )
    return parser


def _disabled_result(settings: NotificationWorkerSettings) -> list[dict[str, object]]:
    return [
        {
            "workspace_id": workspace_id,
            "worker_id": settings.worker_id,
            "status": "disabled",
            "reason": "RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN이 없어 API tick을 호출하지 않았습니다.",
        }
        for workspace_id in settings.workspace_ids
    ]


def run(*, once: bool = False, sleep=time.sleep, emit=None) -> int:
    settings = NotificationWorkerSettings.from_env()
    api_base_url = os.getenv("RESCUE_MEAL_API_BASE_URL", "http://127.0.0.1:8000").strip().rstrip("/")
    worker_token = os.getenv("RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN", "").strip()
    if not worker_token:
        output = emit or (lambda value: print(value, flush=True))
        output(json.dumps(_disabled_result(settings), ensure_ascii=False))
        return 0

    with httpx.Client(base_url=api_base_url, timeout=10.0) as client:
        def tick(workspace_id: str) -> tuple[dict[str, object], bool]:
            return request_http_tick(
                client,
                path=f"/api/internal/notifications/workspaces/{quote(workspace_id, safe='')}/tick",
                headers={"X-Rescue-Meal-Notification-Worker-Token": worker_token},
                payload={
                    "worker_id": settings.worker_id,
                    "lease_seconds": settings.lease_seconds,
                    "stale_after_seconds": settings.stale_after_seconds,
                    "process_limit": settings.process_limit,
                },
                workspace_id=workspace_id,
                worker_id=settings.worker_id,
            )

        return run_worker_loop(
            workspace_ids=settings.workspace_ids,
            worker_id=settings.worker_id,
            interval_seconds=settings.interval_seconds,
            once=once,
            tick=tick,
            sleep=sleep,
            emit=emit,
        )


if __name__ == "__main__":
    arguments = build_parser().parse_args()
    raise SystemExit(run(once=arguments.once))
