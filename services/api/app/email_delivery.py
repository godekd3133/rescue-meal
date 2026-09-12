"""Bounded HTTP delivery for account recovery emails.

The API owns reset-token creation and the generic user-facing response.  This
module owns the narrow provider boundary: configuration parsing, URL safety,
idempotency, and a small retry budget for failures that are safe to retry.
The provider must treat ``Idempotency-Key`` as the message identity so a
timeout followed by a retry cannot create two reset messages.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
import hashlib
import math
import os
import time
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx


DEFAULT_EMAIL_TIMEOUT_SECONDS = 8.0
MIN_EMAIL_TIMEOUT_SECONDS = 1.0
MAX_EMAIL_TIMEOUT_SECONDS = 30.0
DEFAULT_EMAIL_MAX_ATTEMPTS = 2
MIN_EMAIL_MAX_ATTEMPTS = 1
MAX_EMAIL_MAX_ATTEMPTS = 3
DEFAULT_EMAIL_RETRY_BACKOFF_SECONDS = 0.15
MIN_EMAIL_RETRY_BACKOFF_SECONDS = 0.0
MAX_EMAIL_RETRY_BACKOFF_SECONDS = 2.0
MAX_EMAIL_TOTAL_SECONDS = 45.0

# A 4xx response normally describes a permanent provider contract or address
# error.  408/425 and upstream 5xx responses are the bounded transient set.
_RETRYABLE_STATUS_CODES = frozenset({408, 425, 500, 502, 503, 504})


@dataclass(frozen=True)
class PasswordResetDeliverySettings:
    provider_url: str
    reset_base_url: str
    provider_token: str | None
    timeout_seconds: float = DEFAULT_EMAIL_TIMEOUT_SECONDS
    max_attempts: int = DEFAULT_EMAIL_MAX_ATTEMPTS
    retry_backoff_seconds: float = DEFAULT_EMAIL_RETRY_BACKOFF_SECONDS

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "PasswordResetDeliverySettings | None":
        values = env if env is not None else os.environ
        provider_url = values.get("RESCUE_MEAL_EMAIL_PROVIDER_URL", "").strip()
        reset_base_url = values.get("RESCUE_MEAL_PASSWORD_RESET_BASE_URL", "").strip()
        if not provider_url or not reset_base_url:
            return None
        if not _valid_runtime_url(provider_url) or not _valid_runtime_url(reset_base_url):
            return None
        return cls(
            provider_url=provider_url,
            reset_base_url=reset_base_url,
            provider_token=values.get("RESCUE_MEAL_EMAIL_PROVIDER_TOKEN", "").strip() or None,
            timeout_seconds=_bounded_float(
                values.get("RESCUE_MEAL_EMAIL_TIMEOUT_SECONDS"),
                default=DEFAULT_EMAIL_TIMEOUT_SECONDS,
                minimum=MIN_EMAIL_TIMEOUT_SECONDS,
                maximum=MAX_EMAIL_TIMEOUT_SECONDS,
            ),
            max_attempts=_bounded_int(
                values.get("RESCUE_MEAL_EMAIL_MAX_ATTEMPTS"),
                default=DEFAULT_EMAIL_MAX_ATTEMPTS,
                minimum=MIN_EMAIL_MAX_ATTEMPTS,
                maximum=MAX_EMAIL_MAX_ATTEMPTS,
            ),
            retry_backoff_seconds=_bounded_float(
                values.get("RESCUE_MEAL_EMAIL_RETRY_BACKOFF_SECONDS"),
                default=DEFAULT_EMAIL_RETRY_BACKOFF_SECONDS,
                minimum=MIN_EMAIL_RETRY_BACKOFF_SECONDS,
                maximum=MAX_EMAIL_RETRY_BACKOFF_SECONDS,
            ),
        )


def _bounded_int(value: str | None, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value) if value is not None and value.strip() else default
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _bounded_float(value: str | None, *, default: float, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value) if value is not None and value.strip() else default
    except (TypeError, ValueError):
        parsed = default
    if not math.isfinite(parsed):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _valid_runtime_url(value: str) -> bool:
    parsed = urlparse(value)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        return False
    if parsed.username or parsed.password or parsed.fragment:
        return False
    try:
        parsed.port
    except ValueError:
        return False
    if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        return False
    return True


def build_password_reset_url(reset_base_url: str, token: str) -> str:
    """Append the opaque reset token without changing existing query params."""

    separator = ""
    if "?" not in reset_base_url:
        separator = "?"
    elif not reset_base_url.endswith(("?", "&")):
        separator = "&"
    return f"{reset_base_url}{separator}{urlencode({'reset_token': token})}"


def password_reset_idempotency_key(token: str) -> str:
    """Return a provider-safe message key without exposing the reset token."""

    return f"rescue-meal-password-reset-{hashlib.sha256(token.encode('utf-8')).hexdigest()}"


def submit_password_reset_email(
    *,
    recipient: str,
    token: str,
    expires_at: datetime,
    settings: PasswordResetDeliverySettings,
    post: Callable[..., Any] | None = None,
    sleep: Callable[[float], None] = time.sleep,
    monotonic: Callable[[], float] = time.monotonic,
) -> bool:
    """Submit one reset email with bounded, idempotent transient retries.

    The injected ``post`` and ``sleep`` callables keep the provider boundary
    deterministic in unit tests without making network calls.
    """

    request = post or httpx.post
    # Keep the worst configured combination (30s × 3 attempts plus backoff)
    # from tying up an API worker indefinitely.  The per-attempt timeout still
    # remains visible to the provider, while the total budget is hard capped.
    retry_delays = settings.retry_backoff_seconds * max(0, (2 ** (settings.max_attempts - 1)) - 1)
    total_budget_seconds = min(
        MAX_EMAIL_TOTAL_SECONDS,
        settings.timeout_seconds * settings.max_attempts + retry_delays,
    )
    deadline = monotonic() + total_budget_seconds
    headers = {
        "Accept": "application/json",
        "Idempotency-Key": password_reset_idempotency_key(token),
    }
    if settings.provider_token:
        headers["Authorization"] = f"Bearer {settings.provider_token}"
    payload = {
        "to": recipient,
        "template": "rescue-meal-password-reset",
        "reset_url": build_password_reset_url(settings.reset_base_url, token),
        "expires_at": expires_at.isoformat(),
    }

    for attempt in range(settings.max_attempts):
        remaining_seconds = deadline - monotonic()
        if remaining_seconds <= 0:
            return False
        should_retry = False
        try:
            response = request(
                settings.provider_url,
                json=payload,
                headers=headers,
                timeout=min(settings.timeout_seconds, remaining_seconds),
            )
        except httpx.HTTPError:
            should_retry = True
        else:
            if response.is_success:
                return True
            if getattr(response, "status_code", None) not in _RETRYABLE_STATUS_CODES:
                return False
            should_retry = True
        if not should_retry or attempt + 1 >= settings.max_attempts:
            return False
        if settings.retry_backoff_seconds > 0:
            sleep_seconds = min(settings.retry_backoff_seconds * (2**attempt), max(0.0, deadline - monotonic()))
            if sleep_seconds > 0:
                sleep(sleep_seconds)
    return False
