from datetime import datetime, timezone

import httpx

from app.email_delivery import (
    PasswordResetDeliverySettings,
    build_password_reset_url,
    password_reset_idempotency_key,
    submit_password_reset_email,
)


def _settings(**overrides) -> PasswordResetDeliverySettings:
    values = {
        "provider_url": "https://mail.example.com/send",
        "reset_base_url": "https://meal.example.com/account?source=email",
        "provider_token": "provider-secret",
    }
    values.update(overrides)
    return PasswordResetDeliverySettings(**values)


def test_delivery_settings_require_complete_safe_urls_and_bound_runtime_values():
    assert PasswordResetDeliverySettings.from_env({}) is None
    assert PasswordResetDeliverySettings.from_env(
        {
            "RESCUE_MEAL_EMAIL_PROVIDER_URL": "http://mail.example.com/send",
            "RESCUE_MEAL_PASSWORD_RESET_BASE_URL": "https://meal.example.com/account",
        }
    ) is None

    settings = PasswordResetDeliverySettings.from_env(
        {
            "RESCUE_MEAL_EMAIL_PROVIDER_URL": "https://mail.example.com/send",
            "RESCUE_MEAL_PASSWORD_RESET_BASE_URL": "https://meal.example.com/account",
            "RESCUE_MEAL_EMAIL_TIMEOUT_SECONDS": "999",
            "RESCUE_MEAL_EMAIL_MAX_ATTEMPTS": "999",
            "RESCUE_MEAL_EMAIL_RETRY_BACKOFF_SECONDS": "-1",
        }
    )
    assert settings is not None
    assert settings.timeout_seconds == 30
    assert settings.max_attempts == 3
    assert settings.retry_backoff_seconds == 0


def test_reset_url_preserves_existing_query_without_fragment_or_token_leak_in_key():
    token = "rt1.account-1.0.123.nonce.signature"
    assert build_password_reset_url("https://meal.example.com/account", token).startswith(
        "https://meal.example.com/account?reset_token="
    )
    assert "source=email&reset_token=" in build_password_reset_url(
        "https://meal.example.com/account?source=email", token
    )
    assert token not in password_reset_idempotency_key(token)


def test_delivery_retries_transient_status_with_same_idempotency_key():
    calls = []
    responses = [httpx.Response(503), httpx.Response(202)]
    sleeps = []

    def fake_post(url, *, json, headers, timeout):
        calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        return responses.pop(0)

    delivered = submit_password_reset_email(
        recipient="person@example.com",
        token="rt1.account-1.0.123.nonce.signature",
        expires_at=datetime(2026, 9, 5, 12, 30, tzinfo=timezone.utc),
        settings=_settings(max_attempts=2, retry_backoff_seconds=0.15),
        post=fake_post,
        sleep=sleeps.append,
    )

    assert delivered is True
    assert len(calls) == 2
    assert calls[0]["headers"]["Idempotency-Key"] == calls[1]["headers"]["Idempotency-Key"]
    assert sleeps == [0.15]
    assert calls[0]["json"]["to"] == "person@example.com"
    assert calls[0]["json"]["template"] == "rescue-meal-password-reset"


def test_delivery_does_not_retry_permanent_provider_response_or_expose_token_in_key():
    calls = []
    sleeps = []

    def fake_post(url, *, json, headers, timeout):
        calls.append(headers)
        return httpx.Response(400)

    token = "rt1.account-1.0.123.nonce.signature"
    delivered = submit_password_reset_email(
        recipient="person@example.com",
        token=token,
        expires_at=datetime(2026, 9, 5, 12, 30, tzinfo=timezone.utc),
        settings=_settings(max_attempts=3, retry_backoff_seconds=0.15),
        post=fake_post,
        sleep=sleeps.append,
    )

    assert delivered is False
    assert len(calls) == 1
    assert sleeps == []
    assert token not in calls[0]["Idempotency-Key"]


def test_delivery_enforces_total_budget_even_with_maximum_attempt_settings():
    clock = [0.0]
    calls = []

    def fake_post(url, *, json, headers, timeout):
        calls.append(timeout)
        clock[0] = 50.0
        return httpx.Response(503)

    delivered = submit_password_reset_email(
        recipient="person@example.com",
        token="rt1.account-1.0.123.nonce.signature",
        expires_at=datetime(2026, 9, 5, 12, 30, tzinfo=timezone.utc),
        settings=_settings(timeout_seconds=30, max_attempts=3, retry_backoff_seconds=2),
        post=fake_post,
        sleep=lambda _: None,
        monotonic=lambda: clock[0],
    )

    assert delivered is False
    assert calls == [30]
