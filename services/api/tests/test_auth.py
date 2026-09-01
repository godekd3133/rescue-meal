from datetime import datetime, timedelta, timezone

import pytest

from app.auth import AccountRepository, InvalidGuestToken, issue_guest_token, verify_guest_token


def test_guest_token_round_trip_and_expiry() -> None:
    now = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)
    token, expires_at = issue_guest_token("guest-example", now=now)

    assert expires_at == now + timedelta(days=30)
    assert verify_guest_token(token, now=now + timedelta(days=1)) == "guest-example"
    with pytest.raises(InvalidGuestToken):
        verify_guest_token(token, now=expires_at)


def test_guest_token_tampering_is_rejected() -> None:
    token, _ = issue_guest_token("guest-example", now=datetime(2026, 9, 1, tzinfo=timezone.utc))

    with pytest.raises(InvalidGuestToken):
        verify_guest_token(token.replace("guest-example", "guest-other"))
    with pytest.raises(InvalidGuestToken):
        verify_guest_token("rm1.bad/workspace.9999999999.not-base64")


def test_auth_required_never_falls_back_to_the_development_secret(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_AUTH_REQUIRED", "true")
    monkeypatch.delenv("RESCUE_MEAL_AUTH_SECRET", raising=False)

    with pytest.raises(RuntimeError, match="RESCUE_MEAL_AUTH_SECRET"):
        issue_guest_token("guest-example")


def test_token_revocation_survives_account_repository_restart(tmp_path) -> None:
    database_path = str(tmp_path / "auth.db")
    repository = AccountRepository(database_path)
    token, _ = issue_guest_token("guest-revoked")
    repository.revoke_token(token)

    reopened = AccountRepository(database_path)
    assert reopened.is_token_revoked(token) is True
