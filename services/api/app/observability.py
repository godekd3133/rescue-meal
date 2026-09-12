"""Small request-observability seam for the API runtime.

The module keeps correlation ID handling independent from FastAPI route logic.
Access logs never include request bodies, query strings, credentials, or
upstream response payloads.
"""

from __future__ import annotations

from contextvars import ContextVar
from datetime import datetime, timezone
from collections.abc import Mapping
import json
import logging
import os
import re
import secrets
from threading import RLock
from time import monotonic


REQUEST_ID_HEADER = "X-Request-ID"
_request_id_context: ContextVar[str] = ContextVar("rescue_meal_request_id", default="-")
_access_logger = logging.getLogger("rescue_meal.access")
_client_error_logger = logging.getLogger("rescue_meal.client_error")


class RequestRuntimeMetrics:
    """Bounded, privacy-safe process metrics for HTTP request handling.

    The request path is converted to a FastAPI route template by the caller.
    Unknown routes use a single ``__unmatched__`` bucket and new templates are
    collapsed into ``__other__`` after ``max_routes`` is reached. This keeps
    user-controlled IDs and query strings out of metric labels while still
    making latency and status regressions diagnosable.
    """

    _DURATION_BUCKETS = (0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0)

    def __init__(self, *, max_routes: int = 96) -> None:
        self._max_routes = max(1, int(max_routes))
        self._lock = RLock()
        self._routes: set[str] = set()
        self._request_counts: dict[tuple[str, str, str], int] = {}
        self._duration_counts: dict[tuple[str, str], dict[float, int]] = {}
        self._duration_totals: dict[tuple[str, str], tuple[int, float]] = {}
        self._in_flight = 0

    def start(self) -> None:
        with self._lock:
            self._in_flight += 1

    def _route_key_locked(self, route: str) -> str:
        if not isinstance(route, str) or not route.startswith("/") or len(route) > 160:
            return "__unmatched__"
        if route in self._routes:
            return route
        if len(self._routes) >= self._max_routes:
            return "__other__"
        self._routes.add(route)
        return route

    def observe(self, *, method: str, route: str, status_code: int, duration_seconds: float) -> None:
        safe_method = method.upper() if re.fullmatch(r"[A-Z]{1,12}", method.upper()) else "OTHER"
        try:
            safe_status = str(int(status_code))
        except (TypeError, ValueError):
            safe_status = "0"
        try:
            safe_duration = max(0.0, float(duration_seconds))
        except (TypeError, ValueError):
            safe_duration = 0.0
        if not safe_duration == safe_duration or safe_duration == float("inf"):
            safe_duration = 0.0

        with self._lock:
            safe_route = self._route_key_locked(route)
            request_key = (safe_method, safe_route, safe_status)
            self._request_counts[request_key] = self._request_counts.get(request_key, 0) + 1

            duration_key = (safe_method, safe_route)
            buckets = self._duration_counts.setdefault(duration_key, {bucket: 0 for bucket in self._DURATION_BUCKETS})
            for bucket in self._DURATION_BUCKETS:
                if safe_duration <= bucket:
                    buckets[bucket] += 1
            count, total = self._duration_totals.get(duration_key, (0, 0.0))
            self._duration_totals[duration_key] = (count + 1, total + safe_duration)
            self._in_flight = max(0, self._in_flight - 1)

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            return {
                "in_flight": self._in_flight,
                "requests": dict(self._request_counts),
                "duration_buckets": {key: dict(value) for key, value in self._duration_counts.items()},
                "duration_totals": dict(self._duration_totals),
            }

    @staticmethod
    def _label(value: object) -> str:
        return str(value).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")

    def prometheus_text(self) -> str:
        """Render bounded request counters and latency histograms."""

        snapshot = self.snapshot()
        requests = snapshot["requests"]
        duration_buckets = snapshot["duration_buckets"]
        duration_totals = snapshot["duration_totals"]
        assert isinstance(requests, dict)
        assert isinstance(duration_buckets, dict)
        assert isinstance(duration_totals, dict)

        lines = [
            "# HELP rescue_meal_http_requests_total HTTP requests handled by route and status.",
            "# TYPE rescue_meal_http_requests_total counter",
        ]
        for (method, route, status_code), count in sorted(requests.items()):
            lines.append(
                "rescue_meal_http_requests_total"
                f'{{method="{self._label(method)}",route="{self._label(route)}",status="{self._label(status_code)}"}} {count}'
            )

        lines.extend(
            [
                "# HELP rescue_meal_http_request_duration_seconds HTTP request duration in seconds.",
                "# TYPE rescue_meal_http_request_duration_seconds histogram",
            ]
        )
        for key in sorted(duration_buckets):
            method, route = key
            buckets = duration_buckets[key]
            total_count, total_seconds = duration_totals.get(key, (0, 0.0))
            label_prefix = f'{{method="{self._label(method)}",route="{self._label(route)}",le='
            for bucket in self._DURATION_BUCKETS:
                lines.append(f"rescue_meal_http_request_duration_seconds_bucket{label_prefix}\"{bucket:g}\"}} {buckets[bucket]}")
            lines.append(f"rescue_meal_http_request_duration_seconds_bucket{label_prefix}\"+Inf\"}} {total_count}")
            labels = f'{{method="{self._label(method)}",route="{self._label(route)}"}}'
            lines.append(f"rescue_meal_http_request_duration_seconds_sum{labels} {total_seconds:.6f}")
            lines.append(f"rescue_meal_http_request_duration_seconds_count{labels} {total_count}")

        in_flight = snapshot["in_flight"]
        lines.extend(
            [
                "# HELP rescue_meal_http_requests_in_flight HTTP requests currently being handled.",
                "# TYPE rescue_meal_http_requests_in_flight gauge",
                f"rescue_meal_http_requests_in_flight {in_flight}",
            ]
        )
        return "\n".join(lines) + "\n"


def route_template_from_scope(scope: Mapping[str, object]) -> str:
    """Return a route template without falling back to a user-controlled path."""

    route = scope.get("route")
    template = getattr(route, "path", None)
    if isinstance(template, str) and template.startswith("/") and len(template) <= 160:
        return template
    return "__unmatched__"


class JsonAccessLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname.lower(),
            "event": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
            "method": getattr(record, "method", None),
            "path": getattr(record, "path", None),
            "status_code": getattr(record, "status_code", None),
            "duration_ms": getattr(record, "duration_ms", None),
        }
        for field in ("surface", "error_kind", "release"):
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def configure_access_logging() -> None:
    enabled = os.getenv("RESCUE_MEAL_ACCESS_LOG", "false").strip().lower() in {"1", "true", "yes", "on"}
    if not enabled:
        return
    if _access_logger.handlers:
        return
    handler = logging.StreamHandler()
    handler.set_name("rescue-meal-json-access")
    handler.setFormatter(JsonAccessLogFormatter())
    _access_logger.addHandler(handler)
    _access_logger.setLevel(logging.INFO)
    _access_logger.propagate = False


def request_id_from_header(value: str | None) -> str:
    if value and re.fullmatch(r"[A-Za-z0-9._:-]{1,96}", value):
        return value
    return f"rm-{secrets.token_hex(12)}"


def get_request_id() -> str:
    return _request_id_context.get()


def set_request_id(value: str):
    return _request_id_context.set(value)


def reset_request_id(token) -> None:
    _request_id_context.reset(token)


def start_timer() -> float:
    return monotonic()


def log_request(*, request_id: str, method: str, scope: Mapping[str, object], status_code: int, started_at: float) -> None:
    """Emit a request event with a route template, never a raw URL path."""

    configure_access_logging()
    route = route_template_from_scope(scope)
    _access_logger.info(
        "http_request",
        extra={
            "request_id": request_id,
            "method": method,
            "path": route,
            "status_code": status_code,
            "duration_ms": round((monotonic() - started_at) * 1000, 2),
        },
    )


def log_client_error(*, request_id: str, surface: str, error_kind: str, release: str) -> bool:
    """Emit a redacted client error event without user-controlled details."""

    enabled = os.getenv("RESCUE_MEAL_CLIENT_ERROR_LOG", "true").strip().lower() not in {"0", "false", "no", "off"}
    if not enabled:
        return False
    if not _client_error_logger.handlers:
        handler = logging.StreamHandler()
        handler.set_name("rescue-meal-client-error-json")
        handler.setFormatter(JsonAccessLogFormatter())
        _client_error_logger.addHandler(handler)
        _client_error_logger.setLevel(logging.WARNING)
        _client_error_logger.propagate = False
    _client_error_logger.warning(
        "client_error",
        extra={
            "request_id": request_id,
            "surface": surface,
            "error_kind": error_kind,
            "release": release,
        },
    )
    return True
