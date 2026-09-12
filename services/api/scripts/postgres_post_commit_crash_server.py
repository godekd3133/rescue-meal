"""Run a smoke-only API server that dies after a handler commits its response.

This module is intentionally separate from ``app.main``. The middleware runs
after the FastAPI route returns its response object, which means the receive
handler's PostgreSQL transaction has already committed, but before Uvicorn is
allowed to send the response to the client. It is only used by the disposable
crash-recovery smoke and is never part of the production command.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import signal
import sys

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.main import app  # noqa: E402


class CrashAfterReceiveCommitMiddleware(BaseHTTPMiddleware):
    """Kill this disposable process after one explicitly marked receive."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if (
            request.method == "POST"
            and request.url.path.endswith("/receive")
            and request.headers.get("X-Rescue-Meal-Smoke-Crash") == "after-commit"
        ):
            os.kill(os.getpid(), signal.SIGKILL)
        return response


app.add_middleware(CrashAfterReceiveCommitMiddleware)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Disposable Rescue Meal post-commit crash smoke server")
    parser.add_argument("--port", type=int, default=18151)
    args = parser.parse_args(argv)
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=args.port, workers=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
