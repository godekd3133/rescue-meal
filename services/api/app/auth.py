from __future__ import annotations

from contextvars import ContextVar
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import base64
import binascii
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from dataclasses import dataclass, replace
from threading import RLock
from typing import Literal

from .postgres_connection import ReconnectablePostgresConnection


DEFAULT_WORKSPACE_ID = "demo"
GUEST_TOKEN_TTL = timedelta(days=30)
ACCOUNT_TOKEN_TTL = timedelta(days=30)
PASSWORD_RESET_TTL = timedelta(minutes=30)
AUTH_RESET_RETENTION_GRACE = timedelta(hours=1)
AUTH_REVOKED_RETENTION_GRACE = timedelta(hours=1)
_workspace_context: ContextVar[str] = ContextVar("rescue_meal_workspace", default=DEFAULT_WORKSPACE_ID)


@contextmanager
def _postgres_read_cursor(connection):
    """Run an independent PostgreSQL read and release its implicit snapshot."""

    try:
        with connection.cursor() as cursor:
            yield cursor
    finally:
        connection.rollback()


class InvalidGuestToken(ValueError):
    """Raised when a guest workspace token cannot be trusted."""


class DuplicateAccount(ValueError):
    """Raised when an account email is already registered."""


@dataclass(frozen=True)
class AccountRecord:
    id: str
    email: str
    password_hash: str
    workspace_id: str
    created_at: datetime
    role: Literal["user", "recipe_admin"] = "user"
    session_version: int = 0
    status: Literal["active", "deleting"] = "active"
    deletion_started_at: datetime | None = None


@dataclass(frozen=True)
class AuthContext:
    workspace_id: str
    subject_id: str | None
    role: Literal["guest", "user", "recipe_admin"]
    session_version: int = 0


@dataclass(frozen=True)
class PasswordResetTokenRecord:
    token_hash: str
    account_id: str
    session_version: int
    expires_at: datetime
    created_at: datetime
    used_at: datetime | None = None


_auth_context: ContextVar[AuthContext] = ContextVar(
    "rescue_meal_auth_context",
    default=AuthContext(workspace_id=DEFAULT_WORKSPACE_ID, subject_id=None, role="guest"),
)


def current_workspace_id() -> str:
    return _workspace_context.get()


def set_workspace_id(workspace_id: str):
    return _workspace_context.set(workspace_id)


def reset_workspace(token) -> None:
    _workspace_context.reset(token)


def current_auth_context() -> AuthContext:
    return _auth_context.get()


def set_auth_context(context: AuthContext):
    return _auth_context.set(context)


def reset_auth_context(token) -> None:
    _auth_context.reset(token)


def auth_required() -> bool:
    return os.getenv("RESCUE_MEAL_AUTH_REQUIRED", "false").strip().lower() in {"1", "true", "yes", "on"}


def auth_secret() -> str:
    configured = os.getenv("RESCUE_MEAL_AUTH_SECRET", "").strip()
    if configured:
        return configured
    if auth_required():
        raise RuntimeError("RESCUE_MEAL_AUTH_SECRET must be set when authentication is required")
    return "development-only-rescue-meal-secret"


def account_role_for_email(email: str) -> Literal["user", "recipe_admin"]:
    configured = {
        item.strip().lower()
        for item in os.getenv("RESCUE_MEAL_RECIPE_ADMIN_EMAILS", "").split(",")
        if item.strip()
    }
    return "recipe_admin" if email.strip().lower() in configured else "user"


def create_guest_workspace_id() -> str:
    return f"guest-{secrets.token_urlsafe(16)}"


def create_account_workspace_id() -> str:
    return f"account-{secrets.token_urlsafe(16)}"


def issue_guest_token(workspace_id: str, *, now: datetime | None = None) -> tuple[str, datetime]:
    issued_at = now or datetime.now(timezone.utc)
    expires_at = issued_at + GUEST_TOKEN_TTL
    expires_epoch = int(expires_at.timestamp())
    payload = f"rm1.{workspace_id}.{expires_epoch}"
    signature = hmac.new(auth_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{payload}.{encoded_signature}", expires_at


def issue_account_token(account: AccountRecord, *, now: datetime | None = None) -> tuple[str, datetime]:
    issued_at = now or datetime.now(timezone.utc)
    expires_at = issued_at + ACCOUNT_TOKEN_TTL
    expires_epoch = int(expires_at.timestamp())
    payload = f"ra1.{account.id}.{account.workspace_id}.{account.role}.{account.session_version}.{expires_epoch}"
    signature = hmac.new(auth_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{payload}.{encoded_signature}", expires_at


def verify_guest_token(token: str, *, now: datetime | None = None) -> str:
    parts = token.split(".")
    if len(parts) != 4 or parts[0] != "rm1" or not parts[1] or not parts[2] or not parts[3]:
        raise InvalidGuestToken("malformed token")
    _, workspace_id, expires_epoch_text, encoded_signature = parts
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", workspace_id):
        raise InvalidGuestToken("invalid workspace id")
    try:
        expires_epoch = int(expires_epoch_text)
    except ValueError as exc:
        raise InvalidGuestToken("invalid expiry") from exc
    current = now or datetime.now(timezone.utc)
    if current.timestamp() >= expires_epoch:
        raise InvalidGuestToken("expired token")
    payload = f"rm1.{workspace_id}.{expires_epoch}"
    expected = hmac.new(auth_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    try:
        actual = base64.urlsafe_b64decode(encoded_signature + "=" * (-len(encoded_signature) % 4))
    except (ValueError, binascii.Error) as exc:
        raise InvalidGuestToken("invalid signature encoding") from exc
    if not hmac.compare_digest(actual, expected):
        raise InvalidGuestToken("invalid signature")
    return workspace_id


def verify_access_token(token: str, *, now: datetime | None = None) -> AuthContext:
    if token.startswith("rm1."):
        workspace_id = verify_guest_token(token, now=now)
        return AuthContext(workspace_id=workspace_id, subject_id=None, role="guest")

    parts = token.split(".")
    if len(parts) not in {6, 7} or parts[0] != "ra1":
        raise InvalidGuestToken("malformed access token")
    if len(parts) == 6:
        _, subject_id, workspace_id, role, expires_epoch_text, encoded_signature = parts
        session_version = 0
        payload = f"ra1.{subject_id}.{workspace_id}.{role}.{expires_epoch_text}"
    else:
        _, subject_id, workspace_id, role, session_version_text, expires_epoch_text, encoded_signature = parts
        try:
            session_version = int(session_version_text)
        except ValueError as exc:
            raise InvalidGuestToken("invalid session version") from exc
        if session_version < 0:
            raise InvalidGuestToken("invalid session version")
        payload = f"ra1.{subject_id}.{workspace_id}.{role}.{session_version}.{expires_epoch_text}"
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", subject_id):
        raise InvalidGuestToken("invalid account id")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", workspace_id):
        raise InvalidGuestToken("invalid workspace id")
    if role not in {"user", "recipe_admin"}:
        raise InvalidGuestToken("invalid account role")
    try:
        expires_epoch = int(expires_epoch_text)
    except ValueError as exc:
        raise InvalidGuestToken("invalid expiry") from exc
    current = now or datetime.now(timezone.utc)
    if current.timestamp() >= expires_epoch:
        raise InvalidGuestToken("expired token")
    expected = hmac.new(auth_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    try:
        actual = base64.urlsafe_b64decode(encoded_signature + "=" * (-len(encoded_signature) % 4))
    except (ValueError, binascii.Error) as exc:
        raise InvalidGuestToken("invalid signature encoding") from exc
    if not hmac.compare_digest(actual, expected):
        raise InvalidGuestToken("invalid signature")
    return AuthContext(workspace_id=workspace_id, subject_id=subject_id, role=role, session_version=session_version)


def normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not re.fullmatch(r"[^@\s]{1,120}@[^@\s]{1,120}\.[^@\s]{2,63}", normalized):
        raise ValueError("invalid email")
    return normalized


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return "scrypt$v1$" + base64.urlsafe_b64encode(salt).decode("ascii").rstrip("=") + "$" + base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, version, encoded_salt, encoded_digest = encoded.split("$", 3)
        if algorithm != "scrypt" or version != "v1":
            return False
        salt = base64.urlsafe_b64decode(encoded_salt + "=" * (-len(encoded_salt) % 4))
        expected = base64.urlsafe_b64decode(encoded_digest + "=" * (-len(encoded_digest) % 4))
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    except (ValueError, TypeError, binascii.Error):
        return False
    return hmac.compare_digest(actual, expected)


class AccountRepository:
    """Small account registry for local SQLite and deterministic tests."""

    def __init__(self, database_path: str | None = None) -> None:
        self.database_path = database_path
        self._lock = RLock()
        self._accounts: dict[str, AccountRecord] = {}
        self._revoked_tokens: set[str] = set()
        self._password_reset_tokens: dict[str, PasswordResetTokenRecord] = {}
        self._connection: sqlite3.Connection | None = None
        if database_path:
            self._connection = sqlite3.connect(database_path, check_same_thread=False)
            self._connection.execute(
                """
                CREATE TABLE IF NOT EXISTS accounts (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    workspace_id TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'user',
                    session_version INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'active',
                    deletion_started_at TEXT
                )
                """
            )
            columns = {row[1] for row in self._connection.execute("PRAGMA table_info(accounts)")}
            if "role" not in columns:
                self._connection.execute("ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
            if "session_version" not in columns:
                self._connection.execute("ALTER TABLE accounts ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0")
            if "status" not in columns:
                self._connection.execute("ALTER TABLE accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
            if "deletion_started_at" not in columns:
                self._connection.execute("ALTER TABLE accounts ADD COLUMN deletion_started_at TEXT")
            self._connection.execute(
                "CREATE TABLE IF NOT EXISTS revoked_tokens (token_hash TEXT PRIMARY KEY, revoked_at TEXT NOT NULL)"
            )
            self._connection.execute(
                """
                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    token_hash TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL,
                    session_version INTEGER NOT NULL,
                    expires_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    used_at TEXT
                )
                """
            )
            self._connection.execute(
                """
                CREATE TABLE IF NOT EXISTS rate_limit_events (
                    bucket_key TEXT NOT NULL,
                    occurred_at REAL NOT NULL
                )
                """
            )
            self._connection.execute(
                "CREATE INDEX IF NOT EXISTS rate_limit_events_bucket_time_idx ON rate_limit_events (bucket_key, occurred_at)"
            )
            self._connection.commit()
            self._load()

    @property
    def persistent(self) -> bool:
        return self._connection is not None

    @property
    def rate_limit_connection(self):
        return self._connection

    @property
    def rate_limit_dialect(self) -> str | None:
        return "sqlite" if self._connection is not None else None

    @property
    def rate_limit_lock(self):
        return self._lock

    def _load(self) -> None:
        if self._connection is None:
            return
        self._accounts.clear()
        for row in self._connection.execute("SELECT id, email, password_hash, workspace_id, created_at, role, session_version, status, deletion_started_at FROM accounts"):
            record = self._record_from_row(row)
            self._accounts[record.email] = record
        self._revoked_tokens = {row[0] for row in self._connection.execute("SELECT token_hash FROM revoked_tokens")}
        self._password_reset_tokens = {
            row[0]: PasswordResetTokenRecord(
                token_hash=row[0],
                account_id=row[1],
                session_version=int(row[2]),
                expires_at=datetime.fromisoformat(row[3]),
                created_at=datetime.fromisoformat(row[4]),
                used_at=datetime.fromisoformat(row[5]) if row[5] else None,
            )
            for row in self._connection.execute("SELECT token_hash, account_id, session_version, expires_at, created_at, used_at FROM password_reset_tokens")
        }

    def find_by_email(self, email: str) -> AccountRecord | None:
        normalized = normalize_email(email)
        with self._lock:
            if self._connection is None:
                return self._accounts.get(normalized)
            row = self._connection.execute(
                "SELECT id, email, password_hash, workspace_id, created_at, role, session_version, status, deletion_started_at FROM accounts WHERE email = ?",
                (normalized,),
            ).fetchone()
            if row is None:
                self._accounts.pop(normalized, None)
                return None
            record = self._record_from_row(row)
            self._accounts[record.email] = record
            return record

    def find_by_workspace(self, workspace_id: str) -> AccountRecord | None:
        with self._lock:
            if self._connection is None:
                return next((record for record in self._accounts.values() if record.workspace_id == workspace_id), None)
            row = self._connection.execute(
                "SELECT id, email, password_hash, workspace_id, created_at, role, session_version, status, deletion_started_at FROM accounts WHERE workspace_id = ?",
                (workspace_id,),
            ).fetchone()
            if row is None:
                return None
            record = self._record_from_row(row)
            self._accounts[record.email] = record
            return record

    def find_by_id(self, account_id: str) -> AccountRecord | None:
        with self._lock:
            if self._connection is None:
                return next((record for record in self._accounts.values() if record.id == account_id), None)
            row = self._connection.execute(
                "SELECT id, email, password_hash, workspace_id, created_at, role, session_version, status, deletion_started_at FROM accounts WHERE id = ?",
                (account_id,),
            ).fetchone()
            if row is None:
                self._accounts = {email: record for email, record in self._accounts.items() if record.id != account_id}
                return None
            record = self._record_from_row(row)
            self._accounts[record.email] = record
            return record

    def register(self, email: str, password: str, workspace_id: str) -> AccountRecord:
        normalized = normalize_email(email)
        with self._lock:
            if normalized in self._accounts:
                raise DuplicateAccount("email already registered")
            record = AccountRecord(
                id=f"account-{secrets.token_urlsafe(12)}",
                email=normalized,
                password_hash=hash_password(password),
                workspace_id=workspace_id,
                created_at=datetime.now(timezone.utc),
                role=account_role_for_email(normalized),
            )
            if self._connection is not None:
                self._connection.execute(
                    "INSERT INTO accounts (id, email, password_hash, workspace_id, created_at, role, session_version, status, deletion_started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (record.id, record.email, record.password_hash, record.workspace_id, record.created_at.isoformat(), record.role, record.session_version, record.status, record.deletion_started_at),
                )
                self._connection.commit()
            self._accounts[record.email] = record
            return record

    def authenticate(self, email: str, password: str) -> AccountRecord | None:
        record = self.find_by_email(email)
        return record if record is not None and record.status == "active" and verify_password(password, record.password_hash) else None

    def verify_account_password(self, account_id: str, password: str) -> bool:
        with self._lock:
            record = self.find_by_id(account_id)
            return bool(record is not None and verify_password(password, record.password_hash))

    def delete_account(self, account_id: str, *, expected_session_version: int | None = None) -> bool:
        """Delete one account record after its workspace has been purged."""

        with self._lock:
            record = self.find_by_id(account_id)
            if record is None or (expected_session_version is not None and record.session_version != expected_session_version):
                return False
            if self._connection is not None:
                try:
                    self._connection.execute("DELETE FROM password_reset_tokens WHERE account_id = ?", (account_id,))
                    cursor = self._connection.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
                    if cursor.rowcount != 1:
                        self._connection.rollback()
                        return False
                    self._connection.commit()
                except Exception:
                    self._connection.rollback()
                    raise
            self._accounts.pop(record.email, None)
            self._password_reset_tokens = {
                token_hash: token
                for token_hash, token in self._password_reset_tokens.items()
                if token.account_id != account_id
            }
            return True

    def begin_account_deletion(
        self,
        account_id: str,
        *,
        expected_session_version: int,
        now: datetime | None = None,
    ) -> AccountRecord | None:
        """Durably fence an account before its workspace is purged.

        The transition is idempotent for the same session version. Keeping the
        account row in ``deleting`` state lets a later authenticated retry
        resume after a workspace purge or credential-delete failure.
        """

        current_time = now or datetime.now(timezone.utc)
        with self._lock:
            record = self.find_by_id(account_id)
            if record is None or record.session_version != expected_session_version:
                return None
            if record.status == "deleting":
                return record
            updated = replace(record, status="deleting", deletion_started_at=current_time)
            if self._connection is not None:
                try:
                    cursor = self._connection.execute(
                        """
                        UPDATE accounts
                        SET status = 'deleting', deletion_started_at = ?
                        WHERE id = ? AND session_version = ? AND status = 'active'
                        """,
                        (current_time.isoformat(), account_id, expected_session_version),
                    )
                    if cursor.rowcount != 1:
                        self._connection.rollback()
                        current = self.find_by_id(account_id)
                        return (
                            current
                            if current is not None
                            and current.status == "deleting"
                            and current.session_version == expected_session_version
                            else None
                        )
                    self._connection.commit()
                except Exception:
                    self._connection.rollback()
                    raise
            self._accounts[updated.email] = updated
            return updated

    def change_password(self, account_id: str, current_password: str, new_password: str) -> AccountRecord | None:
        with self._lock:
            record = self.find_by_id(account_id)
            if record is None or record.status != "active" or not verify_password(current_password, record.password_hash):
                return None
            updated = replace(
                record,
                password_hash=hash_password(new_password),
                session_version=record.session_version + 1,
            )
            if self._connection is not None:
                self._connection.execute(
                    "UPDATE accounts SET password_hash = ?, session_version = ? WHERE id = ? AND session_version = ?",
                    (updated.password_hash, updated.session_version, record.id, record.session_version),
                )
                self._connection.commit()
            self._accounts[updated.email] = updated
            return updated

    def create_password_reset_token(self, account_id: str, *, now: datetime | None = None) -> str | None:
        current_time = now or datetime.now(timezone.utc)
        with self._lock:
            account = self.find_by_id(account_id)
            if account is None or account.status != "active":
                return None
            expires_at = current_time + PASSWORD_RESET_TTL
            nonce = secrets.token_urlsafe(24)
            payload = f"rt1.{account.id}.{account.session_version}.{int(expires_at.timestamp())}.{nonce}"
            signature = hmac.new(auth_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
            token = f"{payload}.{base64.urlsafe_b64encode(signature).decode('ascii').rstrip('=')}"
            token_hash = self._token_hash(token)
            self._password_reset_tokens = {
                key: replace(record, used_at=current_time) if record.account_id == account.id and record.used_at is None else record
                for key, record in self._password_reset_tokens.items()
            }
            record = PasswordResetTokenRecord(
                token_hash=token_hash,
                account_id=account.id,
                session_version=account.session_version,
                expires_at=expires_at,
                created_at=current_time,
            )
            if self._connection is not None:
                self._connection.execute(
                    "UPDATE password_reset_tokens SET used_at = ? WHERE account_id = ? AND used_at IS NULL",
                    (current_time.isoformat(), account.id),
                )
                self._connection.execute(
                    "INSERT INTO password_reset_tokens (token_hash, account_id, session_version, expires_at, created_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)",
                    (record.token_hash, record.account_id, record.session_version, record.expires_at.isoformat(), record.created_at.isoformat()),
                )
                self._connection.commit()
            self._password_reset_tokens[token_hash] = record
            return token

    def consume_password_reset_token(self, token: str, new_password: str, *, now: datetime | None = None) -> AccountRecord | None:
        current_time = now or datetime.now(timezone.utc)
        parts = token.split(".")
        if len(parts) != 6 or parts[0] != "rt1":
            return None
        _, account_id, session_version_text, expires_epoch_text, nonce, encoded_signature = parts
        try:
            session_version = int(session_version_text)
            expires_epoch = int(expires_epoch_text)
        except ValueError:
            return None
        payload = f"rt1.{account_id}.{session_version}.{expires_epoch}.{nonce}"
        expected = hmac.new(auth_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
        try:
            actual = base64.urlsafe_b64decode(encoded_signature + "=" * (-len(encoded_signature) % 4))
        except (ValueError, binascii.Error):
            return None
        if not hmac.compare_digest(actual, expected) or current_time.timestamp() >= expires_epoch:
            return None
        token_hash = self._token_hash(token)
        with self._lock:
            record = self._password_reset_tokens.get(token_hash)
            account = self.find_by_id(account_id)
            if record is None or record.used_at is not None or account is None:
                return None
            if record.account_id != account_id or record.session_version != session_version or account.session_version != session_version:
                return None
            if account.status != "active":
                return None
            updated = replace(account, password_hash=hash_password(new_password), session_version=account.session_version + 1)
            if self._connection is not None:
                cursor = self._connection.execute(
                    "UPDATE accounts SET password_hash = ?, session_version = ? WHERE id = ? AND session_version = ?",
                    (updated.password_hash, updated.session_version, account.id, account.session_version),
                )
                if cursor.rowcount != 1:
                    self._connection.rollback()
                    return None
                self._connection.execute(
                    "UPDATE password_reset_tokens SET used_at = ? WHERE account_id = ? AND used_at IS NULL",
                    (current_time.isoformat(), account.id),
                )
                self._connection.commit()
            self._accounts[updated.email] = updated
            self._password_reset_tokens = {
                key: replace(item, used_at=current_time) if item.account_id == account.id and item.used_at is None else item
                for key, item in self._password_reset_tokens.items()
            }
            return updated

    def cleanup_expired_security_records(self, *, now: datetime | None = None) -> dict[str, int]:
        """Remove only expired authentication helper records.

        The grace windows are derived from the token TTLs, not from a legal
        business-data retention policy. Workspace audits, inventory, and
        idempotency records are deliberately outside this operation.
        """

        current_time = now or datetime.now(timezone.utc)
        if current_time.tzinfo is None:
            current_time = current_time.replace(tzinfo=timezone.utc)
        reset_cutoff = current_time - PASSWORD_RESET_TTL - AUTH_RESET_RETENTION_GRACE
        revoked_cutoff = current_time - ACCOUNT_TOKEN_TTL - AUTH_REVOKED_RETENTION_GRACE
        with self._lock:
            cached_reset_hashes = {
                token_hash
                for token_hash, record in self._password_reset_tokens.items()
                if record.expires_at <= current_time or (record.used_at is not None and record.used_at <= reset_cutoff)
            }
            if self._connection is None:
                self._password_reset_tokens = {
                    token_hash: record
                    for token_hash, record in self._password_reset_tokens.items()
                    if token_hash not in cached_reset_hashes
                }
                return {"password_reset_tokens": len(cached_reset_hashes), "revoked_tokens": 0}
            try:
                reset_cursor = self._connection.execute(
                    "DELETE FROM password_reset_tokens WHERE expires_at <= ? OR (used_at IS NOT NULL AND used_at <= ?)",
                    (current_time.isoformat(), reset_cutoff.isoformat()),
                )
                revoked_cursor = self._connection.execute(
                    "DELETE FROM revoked_tokens WHERE revoked_at <= ?",
                    (revoked_cutoff.isoformat(),),
                )
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise
            self._password_reset_tokens = {
                token_hash: record
                for token_hash, record in self._password_reset_tokens.items()
                if token_hash not in cached_reset_hashes
            }
            return {
                "password_reset_tokens": max(0, int(reset_cursor.rowcount)),
                "revoked_tokens": max(0, int(revoked_cursor.rowcount)),
            }

    def is_context_current(self, context: AuthContext) -> bool:
        if context.role == "guest":
            return True
        if not context.subject_id:
            return False
        account = self.find_by_id(context.subject_id)
        return bool(
            account
            and account.workspace_id == context.workspace_id
            and account.role == context.role
            and account.session_version == context.session_version
            and account.status == "active"
        )

    def is_account_deletion_in_progress(self, context: AuthContext) -> bool:
        if context.role == "guest" or not context.subject_id:
            return False
        account = self.find_by_id(context.subject_id)
        return bool(
            account
            and account.workspace_id == context.workspace_id
            and account.role == context.role
            and account.session_version == context.session_version
            and account.status == "deleting"
        )

    def is_workspace_deletion_in_progress(self, workspace_id: str) -> bool:
        account = self.find_by_workspace(workspace_id)
        return bool(account and account.status == "deleting")

    @staticmethod
    def _record_from_row(row) -> AccountRecord:
        created_at = row[4]
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)
        role = row[5] if len(row) > 5 and row[5] in {"user", "recipe_admin"} else "user"
        session_version = int(row[6] or 0) if len(row) > 6 else 0
        account_status = row[7] if len(row) > 7 and row[7] in {"active", "deleting"} else "active"
        deletion_started_at = row[8] if len(row) > 8 else None
        if isinstance(deletion_started_at, str):
            deletion_started_at = datetime.fromisoformat(deletion_started_at)
        return AccountRecord(
            id=row[0],
            email=row[1],
            password_hash=row[2],
            workspace_id=row[3],
            created_at=created_at,
            role=role,
            session_version=session_version,
            status=account_status,
            deletion_started_at=deletion_started_at,
        )

    @staticmethod
    def _token_hash(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def revoke_token(self, token: str) -> None:
        token_hash = self._token_hash(token)
        with self._lock:
            self._revoked_tokens.add(token_hash)
            if self._connection is not None:
                self._connection.execute(
                    "INSERT OR IGNORE INTO revoked_tokens (token_hash, revoked_at) VALUES (?, ?)",
                    (token_hash, datetime.now(timezone.utc).isoformat()),
                )
                self._connection.commit()

    def is_token_revoked(self, token: str) -> bool:
        token_hash = self._token_hash(token)
        with self._lock:
            return token_hash in self._revoked_tokens

    def close(self) -> None:
        """Close a durable local account database during process shutdown."""

        with self._lock:
            connection = self._connection
            self._connection = None
            if connection is not None:
                connection.close()


class PostgresAccountRepository(AccountRepository):
    """PostgreSQL account/revocation repository used with the tenant projection."""

    def __init__(self, database_url: str, *, connection=None, initialize_schema: bool = True) -> None:
        super().__init__()
        self._closed = False
        if connection is not None:
            self._pg_connection = connection
        else:
            try:
                import psycopg
            except ImportError as exc:  # pragma: no cover - dependency is installed in normal sync
                raise RuntimeError("PostgreSQL auth mode에는 psycopg가 필요합니다.") from exc
            try:
                self._pg_connection = ReconnectablePostgresConnection(database_url)
            except Exception as exc:  # pragma: no cover - requires external PostgreSQL
                raise RuntimeError(f"PostgreSQL auth 연결에 실패했습니다: {exc.__class__.__name__}") from exc
        if initialize_schema:
            self._initialize_postgres()

    @property
    def persistent(self) -> bool:
        return True

    @property
    def rate_limit_connection(self):
        return self._pg_connection

    @property
    def rate_limit_dialect(self) -> str:
        return "postgres"

    def _initialize_postgres(self) -> None:
        with self._lock:
            try:
                with self._pg_connection.cursor() as cursor:
                    cursor.execute(
                        """
                        CREATE TABLE IF NOT EXISTS rescue_auth_accounts (
                            id text PRIMARY KEY,
                            email text NOT NULL UNIQUE,
                            password_hash text NOT NULL,
                            workspace_id text NOT NULL UNIQUE,
                            created_at timestamptz NOT NULL,
                            role text NOT NULL DEFAULT 'user',
                            session_version integer NOT NULL DEFAULT 0,
                            status text NOT NULL DEFAULT 'active',
                            deletion_started_at timestamptz
                        );
                        ALTER TABLE rescue_auth_accounts ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
                        ALTER TABLE rescue_auth_accounts ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
                        ALTER TABLE rescue_auth_accounts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
                        ALTER TABLE rescue_auth_accounts ADD COLUMN IF NOT EXISTS deletion_started_at timestamptz;
                        CREATE TABLE IF NOT EXISTS rescue_auth_revoked_tokens (
                            token_hash text PRIMARY KEY,
                            revoked_at timestamptz NOT NULL
                        );
                        CREATE TABLE IF NOT EXISTS rescue_auth_password_reset_tokens (
                            token_hash text PRIMARY KEY,
                            account_id text NOT NULL REFERENCES rescue_auth_accounts(id) ON DELETE CASCADE,
                            session_version integer NOT NULL,
                            expires_at timestamptz NOT NULL,
                            created_at timestamptz NOT NULL,
                            used_at timestamptz
                        );
                        CREATE INDEX IF NOT EXISTS rescue_auth_password_reset_account_idx
                            ON rescue_auth_password_reset_tokens (account_id, created_at DESC);
                        CREATE TABLE IF NOT EXISTS rescue_auth_rate_limit_events (
                            bucket_key text NOT NULL,
                            occurred_at double precision NOT NULL
                        );
                        CREATE INDEX IF NOT EXISTS rescue_auth_rate_limit_events_bucket_time_idx
                            ON rescue_auth_rate_limit_events (bucket_key, occurred_at);
                        """
                    )
                self._pg_connection.commit()
            except Exception:
                self._pg_connection.rollback()
                raise

    @staticmethod
    def _record_from_row(row) -> AccountRecord:
        created_at = row[4]
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)
        role = row[5] if len(row) > 5 and row[5] in {"user", "recipe_admin"} else "user"
        session_version = int(row[6] or 0) if len(row) > 6 else 0
        account_status = row[7] if len(row) > 7 and row[7] in {"active", "deleting"} else "active"
        deletion_started_at = row[8] if len(row) > 8 else None
        if isinstance(deletion_started_at, str):
            deletion_started_at = datetime.fromisoformat(deletion_started_at)
        return AccountRecord(
            id=row[0],
            email=row[1],
            password_hash=row[2],
            workspace_id=row[3],
            created_at=created_at,
            role=role,
            session_version=session_version,
            status=account_status,
            deletion_started_at=deletion_started_at,
        )

    def find_by_email(self, email: str) -> AccountRecord | None:
        normalized = normalize_email(email)
        with self._lock:
            with _postgres_read_cursor(self._pg_connection) as cursor:
                cursor.execute("SELECT id, email, password_hash, workspace_id, created_at, role, session_version, status, deletion_started_at FROM rescue_auth_accounts WHERE email = %s", (normalized,))
                row = cursor.fetchone()
            return self._record_from_row(row) if row else None

    def find_by_workspace(self, workspace_id: str) -> AccountRecord | None:
        with self._lock:
            with _postgres_read_cursor(self._pg_connection) as cursor:
                cursor.execute("SELECT id, email, password_hash, workspace_id, created_at, role, session_version, status, deletion_started_at FROM rescue_auth_accounts WHERE workspace_id = %s", (workspace_id,))
                row = cursor.fetchone()
            return self._record_from_row(row) if row else None

    def find_by_id(self, account_id: str) -> AccountRecord | None:
        with self._lock:
            with _postgres_read_cursor(self._pg_connection) as cursor:
                cursor.execute("SELECT id, email, password_hash, workspace_id, created_at, role, session_version, status, deletion_started_at FROM rescue_auth_accounts WHERE id = %s", (account_id,))
                row = cursor.fetchone()
            return self._record_from_row(row) if row else None

    def register(self, email: str, password: str, workspace_id: str) -> AccountRecord:
        normalized = normalize_email(email)
        record = AccountRecord(
            id=f"account-{secrets.token_urlsafe(12)}",
            email=normalized,
            password_hash=hash_password(password),
            workspace_id=workspace_id,
            created_at=datetime.now(timezone.utc),
            role=account_role_for_email(normalized),
        )
        with self._lock:
            try:
                with self._pg_connection.cursor() as cursor:
                    cursor.execute(
                        "INSERT INTO rescue_auth_accounts (id, email, password_hash, workspace_id, created_at, role, session_version, status, deletion_started_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                        (record.id, record.email, record.password_hash, record.workspace_id, record.created_at, record.role, record.session_version, record.status, record.deletion_started_at),
                    )
                self._pg_connection.commit()
            except Exception as exc:
                self._pg_connection.rollback()
                if getattr(exc, "sqlstate", None) == "23505":
                    raise DuplicateAccount("email already registered") from exc
                raise
        return record

    def delete_account(self, account_id: str, *, expected_session_version: int | None = None) -> bool:
        with self._lock:
            account = self.find_by_id(account_id)
            if account is None or (expected_session_version is not None and account.session_version != expected_session_version):
                return False
            try:
                with self._pg_connection.cursor() as cursor:
                    cursor.execute("DELETE FROM rescue_auth_password_reset_tokens WHERE account_id = %s", (account_id,))
                    cursor.execute(
                        "DELETE FROM rescue_auth_accounts WHERE id = %s AND session_version = %s RETURNING id",
                        (account_id, account.session_version),
                    )
                    deleted = cursor.fetchone()
                    if deleted is None:
                        self._pg_connection.rollback()
                        return False
                self._pg_connection.commit()
            except Exception:
                self._pg_connection.rollback()
                raise
            self._accounts.pop(account.email, None)
            self._password_reset_tokens = {
                token_hash: token
                for token_hash, token in self._password_reset_tokens.items()
                if token.account_id != account_id
            }
            return True

    def begin_account_deletion(
        self,
        account_id: str,
        *,
        expected_session_version: int,
        now: datetime | None = None,
    ) -> AccountRecord | None:
        current_time = now or datetime.now(timezone.utc)
        with self._lock:
            try:
                with self._pg_connection.cursor() as cursor:
                    cursor.execute(
                        """
                        UPDATE rescue_auth_accounts
                        SET status = 'deleting', deletion_started_at = COALESCE(deletion_started_at, %s)
                        WHERE id = %s AND session_version = %s AND status IN ('active', 'deleting')
                        RETURNING id, email, password_hash, workspace_id, created_at, role, session_version, status, deletion_started_at
                        """,
                        (current_time, account_id, expected_session_version),
                    )
                    row = cursor.fetchone()
                if row is None:
                    self._pg_connection.rollback()
                    return None
                self._pg_connection.commit()
            except Exception:
                self._pg_connection.rollback()
                raise
            record = self._record_from_row(row)
            self._accounts[record.email] = record
            return record

    def create_password_reset_token(self, account_id: str, *, now: datetime | None = None) -> str | None:
        current_time = now or datetime.now(timezone.utc)
        account = self.find_by_id(account_id)
        if account is None or account.status != "active":
            return None
        expires_at = current_time + PASSWORD_RESET_TTL
        nonce = secrets.token_urlsafe(24)
        payload = f"rt1.{account.id}.{account.session_version}.{int(expires_at.timestamp())}.{nonce}"
        signature = hmac.new(auth_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
        token = f"{payload}.{base64.urlsafe_b64encode(signature).decode('ascii').rstrip('=')}"
        token_hash = self._token_hash(token)
        record = PasswordResetTokenRecord(
            token_hash=token_hash,
            account_id=account.id,
            session_version=account.session_version,
            expires_at=expires_at,
            created_at=current_time,
        )
        with self._lock:
            try:
                with self._pg_connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE rescue_auth_password_reset_tokens SET used_at = %s WHERE account_id = %s AND used_at IS NULL",
                        (current_time, account.id),
                    )
                    cursor.execute(
                        "INSERT INTO rescue_auth_password_reset_tokens (token_hash, account_id, session_version, expires_at, created_at) VALUES (%s, %s, %s, %s, %s)",
                        (record.token_hash, record.account_id, record.session_version, record.expires_at, record.created_at),
                    )
                self._pg_connection.commit()
            except Exception:
                self._pg_connection.rollback()
                raise
        self._password_reset_tokens[token_hash] = record
        return token

    def consume_password_reset_token(self, token: str, new_password: str, *, now: datetime | None = None) -> AccountRecord | None:
        current_time = now or datetime.now(timezone.utc)
        parts = token.split(".")
        if len(parts) != 6 or parts[0] != "rt1":
            return None
        _, account_id, session_version_text, expires_epoch_text, nonce, encoded_signature = parts
        try:
            session_version = int(session_version_text)
            expires_epoch = int(expires_epoch_text)
        except ValueError:
            return None
        payload = f"rt1.{account_id}.{session_version}.{expires_epoch}.{nonce}"
        expected = hmac.new(auth_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
        try:
            actual = base64.urlsafe_b64decode(encoded_signature + "=" * (-len(encoded_signature) % 4))
        except (ValueError, binascii.Error):
            return None
        if not hmac.compare_digest(actual, expected) or current_time.timestamp() >= expires_epoch:
            return None
        token_hash = self._token_hash(token)
        with self._lock:
            account = self.find_by_id(account_id)
            if account is None or account.status != "active" or account.session_version != session_version:
                return None
            try:
                with self._pg_connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT account_id, session_version, expires_at, used_at FROM rescue_auth_password_reset_tokens WHERE token_hash = %s FOR UPDATE",
                        (token_hash,),
                    )
                    row = cursor.fetchone()
                    if row is None or row[0] != account_id or int(row[1]) != session_version or row[3] is not None:
                        self._pg_connection.rollback()
                        return None
                    expires_at = row[2] if not isinstance(row[2], str) else datetime.fromisoformat(row[2])
                    if expires_at <= current_time:
                        self._pg_connection.rollback()
                        return None
                    updated = replace(account, password_hash=hash_password(new_password), session_version=account.session_version + 1)
                    cursor.execute(
                        "UPDATE rescue_auth_accounts SET password_hash = %s, session_version = %s WHERE id = %s AND session_version = %s AND status = 'active' RETURNING id, email, password_hash, workspace_id, created_at, role, session_version, status, deletion_started_at",
                        (updated.password_hash, updated.session_version, account.id, account.session_version),
                    )
                    updated_row = cursor.fetchone()
                    if updated_row is None:
                        self._pg_connection.rollback()
                        return None
                    cursor.execute(
                        "UPDATE rescue_auth_password_reset_tokens SET used_at = %s WHERE account_id = %s AND used_at IS NULL",
                        (current_time, account.id),
                    )
                self._pg_connection.commit()
            except Exception:
                self._pg_connection.rollback()
                raise
            updated_account = self._record_from_row(updated_row)
            self._password_reset_tokens = {
                key: replace(item, used_at=current_time) if item.account_id == account.id and item.used_at is None else item
                for key, item in self._password_reset_tokens.items()
            }
            return updated_account

    def cleanup_expired_security_records(self, *, now: datetime | None = None) -> dict[str, int]:
        """Remove expired auth helper rows without touching workspace data."""

        current_time = now or datetime.now(timezone.utc)
        if current_time.tzinfo is None:
            current_time = current_time.replace(tzinfo=timezone.utc)
        reset_cutoff = current_time - PASSWORD_RESET_TTL - AUTH_RESET_RETENTION_GRACE
        revoked_cutoff = current_time - ACCOUNT_TOKEN_TTL - AUTH_REVOKED_RETENTION_GRACE
        with self._lock:
            try:
                with self._pg_connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM rescue_auth_password_reset_tokens WHERE expires_at <= %s OR (used_at IS NOT NULL AND used_at <= %s)",
                        (current_time, reset_cutoff),
                    )
                    reset_count = max(0, int(cursor.rowcount))
                    cursor.execute(
                        "DELETE FROM rescue_auth_revoked_tokens WHERE revoked_at <= %s",
                        (revoked_cutoff,),
                    )
                    revoked_count = max(0, int(cursor.rowcount))
                self._pg_connection.commit()
            except Exception:
                self._pg_connection.rollback()
                raise
            self._password_reset_tokens = {
                token_hash: record
                for token_hash, record in self._password_reset_tokens.items()
                if record.expires_at > current_time and (record.used_at is None or record.used_at > reset_cutoff)
            }
            return {"password_reset_tokens": reset_count, "revoked_tokens": revoked_count}

    def change_password(self, account_id: str, current_password: str, new_password: str) -> AccountRecord | None:
        with self._lock:
            current = self.find_by_id(account_id)
            if current is None or current.status != "active" or not verify_password(current_password, current.password_hash):
                return None
            updated = replace(
                current,
                password_hash=hash_password(new_password),
                session_version=current.session_version + 1,
            )
            try:
                with self._pg_connection.cursor() as cursor:
                    cursor.execute(
                        """
                        UPDATE rescue_auth_accounts
                        SET password_hash = %s, session_version = %s
                        WHERE id = %s AND session_version = %s AND status = 'active'
                        RETURNING id, email, password_hash, workspace_id, created_at, role, session_version, status, deletion_started_at
                        """,
                        (updated.password_hash, updated.session_version, current.id, current.session_version),
                    )
                    row = cursor.fetchone()
                if row is None:
                    self._pg_connection.rollback()
                    return None
                self._pg_connection.commit()
            except Exception:
                self._pg_connection.rollback()
                raise
            return self._record_from_row(row)

    def revoke_token(self, token: str) -> None:
        token_hash = self._token_hash(token)
        with self._lock:
            try:
                with self._pg_connection.cursor() as cursor:
                    cursor.execute(
                        "INSERT INTO rescue_auth_revoked_tokens (token_hash, revoked_at) VALUES (%s, %s) ON CONFLICT (token_hash) DO NOTHING",
                        (token_hash, datetime.now(timezone.utc)),
                    )
                self._pg_connection.commit()
            except Exception:
                self._pg_connection.rollback()
                raise

    def is_token_revoked(self, token: str) -> bool:
        token_hash = self._token_hash(token)
        with self._lock:
            with _postgres_read_cursor(self._pg_connection) as cursor:
                cursor.execute("SELECT 1 FROM rescue_auth_revoked_tokens WHERE token_hash = %s", (token_hash,))
                return cursor.fetchone() is not None

    def close(self) -> None:
        """Close the PostgreSQL auth connection; safe to call more than once."""

        with self._lock:
            if self._closed:
                return
            self._closed = True
            close = getattr(self._pg_connection, "close", None)
            if callable(close):
                close()
