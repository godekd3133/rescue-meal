from datetime import datetime, timedelta, timezone

import pytest

from app.auth import AccountRecord, AccountRepository, InvalidGuestToken, issue_account_token, issue_guest_token, verify_access_token, verify_guest_token


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


def test_account_token_round_trip_preserves_admin_role() -> None:
    account = AccountRecord(
        id="account-admin",
        email="admin@example.com",
        password_hash="not-used",
        workspace_id="account-workspace",
        created_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
        role="recipe_admin",
    )
    token, expires_at = issue_account_token(account, now=datetime(2026, 9, 1, tzinfo=timezone.utc))

    context = verify_access_token(token, now=datetime(2026, 9, 2, tzinfo=timezone.utc))

    assert expires_at == datetime(2026, 10, 1, tzinfo=timezone.utc)
    assert context.workspace_id == "account-workspace"
    assert context.subject_id == "account-admin"
    assert context.role == "recipe_admin"
    assert context.session_version == 0
    with pytest.raises(InvalidGuestToken):
        verify_access_token(token.replace("recipe_admin", "user"))


def test_account_repository_bootstraps_only_allowlisted_admin_email(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_RECIPE_ADMIN_EMAILS", "admin@example.com")
    repository = AccountRepository()

    admin = repository.register("admin@example.com", "correct-horse-battery", "account-admin")
    user = repository.register("user@example.com", "correct-horse-battery", "account-user")

    assert admin.role == "recipe_admin"
    assert user.role == "user"


def test_password_change_rotates_session_version_and_invalidates_old_context() -> None:
    repository = AccountRepository()
    account = repository.register("password-change@example.com", "correct-horse-battery", "account-password-change")
    old_token, _ = issue_account_token(account, now=datetime(2026, 9, 1, tzinfo=timezone.utc))
    old_context = verify_access_token(old_token, now=datetime(2026, 9, 2, tzinfo=timezone.utc))

    updated = repository.change_password(account.id, "correct-horse-battery", "new-correct-password")

    assert updated is not None
    assert updated.session_version == 1
    assert repository.authenticate(account.email, "correct-horse-battery") is None
    assert repository.authenticate(account.email, "new-correct-password") is not None
    assert repository.is_context_current(old_context) is False
    new_token, _ = issue_account_token(updated, now=datetime(2026, 9, 2, tzinfo=timezone.utc))
    new_context = verify_access_token(new_token, now=datetime(2026, 9, 2, tzinfo=timezone.utc))
    assert new_context.session_version == 1
    assert repository.is_context_current(new_context) is True


def test_account_repository_deletion_removes_credentials_and_reset_tokens(tmp_path) -> None:
    repository = AccountRepository(str(tmp_path / "account-delete.db"))
    account = repository.register("account-delete@example.com", "correct-horse-battery", "account-delete")
    reset_token = repository.create_password_reset_token(account.id)

    assert reset_token is not None
    assert repository.verify_account_password(account.id, "wrong-password") is False
    assert repository.verify_account_password(account.id, "correct-horse-battery") is True
    assert repository.delete_account(account.id, expected_session_version=1) is False
    assert repository.delete_account(account.id, expected_session_version=0) is True
    assert repository.find_by_email(account.email) is None
    assert repository.authenticate(account.email, "correct-horse-battery") is None
    reopened = AccountRepository(str(tmp_path / "account-delete.db"))
    assert reopened.find_by_id(account.id) is None
    assert reopened._password_reset_tokens == {}


def test_account_deletion_fence_survives_restart_and_blocks_normal_auth(tmp_path) -> None:
    database_path = str(tmp_path / "account-deletion-fence.db")
    repository = AccountRepository(database_path)
    account = repository.register("account-deletion-fence@example.com", "correct-horse-battery", "account-deletion-fence")
    context = verify_access_token(issue_account_token(account)[0])

    fenced = repository.begin_account_deletion(account.id, expected_session_version=account.session_version)

    assert fenced is not None
    assert fenced.status == "deleting"
    assert fenced.deletion_started_at is not None
    assert repository.authenticate(account.email, "correct-horse-battery") is None
    assert repository.is_context_current(context) is False
    assert repository.is_account_deletion_in_progress(context) is True
    assert repository.begin_account_deletion(account.id, expected_session_version=account.session_version) == fenced

    reopened = AccountRepository(database_path)
    restored = reopened.find_by_id(account.id)
    assert restored is not None
    assert restored.status == "deleting"
    assert restored.deletion_started_at == fenced.deletion_started_at
    assert reopened.is_account_deletion_in_progress(context) is True


def test_sqlite_password_change_version_survives_repository_restart(tmp_path) -> None:
    repository = AccountRepository(str(tmp_path / "password-change.db"))
    account = repository.register("password-restart@example.com", "correct-horse-battery", "account-password-restart")

    updated = repository.change_password(account.id, "correct-horse-battery", "new-correct-password")
    reopened = AccountRepository(str(tmp_path / "password-change.db"))

    assert updated is not None
    restored = reopened.find_by_id(account.id)
    assert restored is not None
    assert restored.session_version == 1
    assert reopened.authenticate(account.email, "new-correct-password") is not None


def test_password_reset_token_is_hashed_one_time_and_rotates_sessions() -> None:
    repository = AccountRepository()
    account = repository.register("password-reset@example.com", "correct-horse-battery", "account-password-reset")
    old_token, _ = issue_account_token(account, now=datetime(2026, 9, 1, tzinfo=timezone.utc))
    reset_token = repository.create_password_reset_token(account.id, now=datetime(2026, 9, 2, tzinfo=timezone.utc))

    assert reset_token is not None
    assert reset_token.startswith("rt1.")
    assert reset_token not in repository._password_reset_tokens
    updated = repository.consume_password_reset_token(reset_token, "reset-correct-password", now=datetime(2026, 9, 2, 0, 10, tzinfo=timezone.utc))

    assert updated is not None
    assert updated.session_version == 1
    assert repository.authenticate(account.email, "correct-horse-battery") is None
    assert repository.authenticate(account.email, "reset-correct-password") is not None
    assert repository.consume_password_reset_token(reset_token, "another-password", now=datetime(2026, 9, 2, 0, 11, tzinfo=timezone.utc)) is None
    assert repository.is_context_current(verify_access_token(old_token, now=datetime(2026, 9, 2, tzinfo=timezone.utc))) is False


def test_sqlite_password_reset_token_survives_restart_without_storing_raw_token(tmp_path) -> None:
    database_path = str(tmp_path / "password-reset.db")
    first = AccountRepository(database_path)
    account = first.register("password-reset-restart@example.com", "correct-horse-battery", "account-password-reset-restart")
    reset_token = first.create_password_reset_token(account.id, now=datetime(2026, 9, 2, tzinfo=timezone.utc))
    reopened = AccountRepository(database_path)

    assert reset_token is not None
    assert reset_token not in reopened._password_reset_tokens
    updated = reopened.consume_password_reset_token(reset_token, "reset-correct-password", now=datetime(2026, 9, 2, 0, 5, tzinfo=timezone.utc))
    assert updated is not None
    assert updated.session_version == 1
    assert reopened.authenticate(account.email, "reset-correct-password") is not None


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


def test_sqlite_security_cleanup_removes_only_expired_auth_helper_records(tmp_path) -> None:
    database_path = str(tmp_path / "auth-retention.db")
    repository = AccountRepository(database_path)
    now = datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc)
    old_reset_hash = "a" * 64
    used_reset_hash = "b" * 64
    fresh_reset_hash = "c" * 64
    old_revoked_hash = "d" * 64
    fresh_revoked_hash = "e" * 64
    repository._connection.executemany(
        "INSERT INTO password_reset_tokens (token_hash, account_id, session_version, expires_at, created_at, used_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
            (old_reset_hash, "missing-account", 0, (now - timedelta(hours=2)).isoformat(), (now - timedelta(hours=3)).isoformat(), None),
            (used_reset_hash, "missing-account", 0, (now + timedelta(hours=1)).isoformat(), (now - timedelta(hours=3)).isoformat(), (now - timedelta(hours=2)).isoformat()),
            (fresh_reset_hash, "missing-account", 0, (now + timedelta(hours=1)).isoformat(), now.isoformat(), None),
        ],
    )
    repository._connection.executemany(
        "INSERT INTO revoked_tokens (token_hash, revoked_at) VALUES (?, ?)",
        [
            (old_revoked_hash, (now - timedelta(days=30, hours=2)).isoformat()),
            (fresh_revoked_hash, (now - timedelta(days=30)).isoformat()),
        ],
    )
    repository._connection.commit()
    repository._load()

    result = repository.cleanup_expired_security_records(now=now)

    assert result == {"password_reset_tokens": 2, "revoked_tokens": 1}
    assert repository._connection.execute("SELECT token_hash FROM password_reset_tokens").fetchall() == [(fresh_reset_hash,)]
    assert repository._connection.execute("SELECT token_hash FROM revoked_tokens").fetchall() == [(fresh_revoked_hash,)]
