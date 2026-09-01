from __future__ import annotations

from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
import base64
import binascii
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from dataclasses import dataclass
from threading import RLock


DEFAULT_WORKSPACE_ID = "demo"
GUEST_TOKEN_TTL = timedelta(days=30)
ACCOUNT_TOKEN_TTL = timedelta(days=30)
_workspace_context: ContextVar[str] = ContextVar("rescue_meal_workspace", default=DEFAULT_WORKSPACE_ID)


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


def current_workspace_id() -> str:
    return _workspace_context.get()


def set_workspace_id(workspace_id: str):
    return _workspace_context.set(workspace_id)


def reset_workspace(token) -> None:
    _workspace_context.reset(token)


def auth_required() -> bool:
    return os.getenv("RESCUE_MEAL_AUTH_REQUIRED", "false").strip().lower() in {"1", "true", "yes", "on"}


def auth_secret() -> str:
    configured = os.getenv("RESCUE_MEAL_AUTH_SECRET", "").strip()
    if configured:
        return configured
    if auth_required():
        raise RuntimeError("RESCUE_MEAL_AUTH_SECRET must be set when authentication is required")
    return "development-only-rescue-meal-secret"


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
                    created_at TEXT NOT NULL
                )
                """
            )
            self._connection.execute(
                "CREATE TABLE IF NOT EXISTS revoked_tokens (token_hash TEXT PRIMARY KEY, revoked_at TEXT NOT NULL)"
            )
            self._connection.commit()
            self._load()

    @property
    def persistent(self) -> bool:
        return self._connection is not None

    def _load(self) -> None:
        if self._connection is None:
            return
        for row in self._connection.execute("SELECT id, email, password_hash, workspace_id, created_at FROM accounts"):
            record = AccountRecord(
                id=row[0],
                email=row[1],
                password_hash=row[2],
                workspace_id=row[3],
                created_at=datetime.fromisoformat(row[4]),
            )
            self._accounts[record.email] = record
        self._revoked_tokens = {row[0] for row in self._connection.execute("SELECT token_hash FROM revoked_tokens")}

    def find_by_email(self, email: str) -> AccountRecord | None:
        normalized = normalize_email(email)
        with self._lock:
            return self._accounts.get(normalized)

    def find_by_workspace(self, workspace_id: str) -> AccountRecord | None:
        with self._lock:
            return next((record for record in self._accounts.values() if record.workspace_id == workspace_id), None)

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
            )
            if self._connection is not None:
                self._connection.execute(
                    "INSERT INTO accounts (id, email, password_hash, workspace_id, created_at) VALUES (?, ?, ?, ?, ?)",
                    (record.id, record.email, record.password_hash, record.workspace_id, record.created_at.isoformat()),
                )
                self._connection.commit()
            self._accounts[record.email] = record
            return record

    def authenticate(self, email: str, password: str) -> AccountRecord | None:
        record = self.find_by_email(email)
        return record if record is not None and verify_password(password, record.password_hash) else None

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


class PostgresAccountRepository(AccountRepository):
    """PostgreSQL account/revocation repository used with the tenant projection."""

    def __init__(self, database_url: str, *, connection=None) -> None:
        super().__init__()
        if connection is not None:
            self._pg_connection = connection
        else:
            try:
                import psycopg
            except ImportError as exc:  # pragma: no cover - dependency is installed in normal sync
                raise RuntimeError("PostgreSQL auth mode에는 psycopg가 필요합니다.") from exc
            try:
                self._pg_connection = psycopg.connect(database_url)
            except Exception as exc:  # pragma: no cover - requires external PostgreSQL
                raise RuntimeError(f"PostgreSQL auth 연결에 실패했습니다: {exc.__class__.__name__}") from exc
        self._initialize_postgres()

    @property
    def persistent(self) -> bool:
        return True

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
                            created_at timestamptz NOT NULL
                        );
                        CREATE TABLE IF NOT EXISTS rescue_auth_revoked_tokens (
                            token_hash text PRIMARY KEY,
                            revoked_at timestamptz NOT NULL
                        );
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
        return AccountRecord(id=row[0], email=row[1], password_hash=row[2], workspace_id=row[3], created_at=created_at)

    def find_by_email(self, email: str) -> AccountRecord | None:
        normalized = normalize_email(email)
        with self._lock:
            with self._pg_connection.cursor() as cursor:
                cursor.execute("SELECT id, email, password_hash, workspace_id, created_at FROM rescue_auth_accounts WHERE email = %s", (normalized,))
                row = cursor.fetchone()
            return self._record_from_row(row) if row else None

    def find_by_workspace(self, workspace_id: str) -> AccountRecord | None:
        with self._lock:
            with self._pg_connection.cursor() as cursor:
                cursor.execute("SELECT id, email, password_hash, workspace_id, created_at FROM rescue_auth_accounts WHERE workspace_id = %s", (workspace_id,))
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
        )
        with self._lock:
            try:
                with self._pg_connection.cursor() as cursor:
                    cursor.execute(
                        "INSERT INTO rescue_auth_accounts (id, email, password_hash, workspace_id, created_at) VALUES (%s, %s, %s, %s, %s)",
                        (record.id, record.email, record.password_hash, record.workspace_id, record.created_at),
                    )
                self._pg_connection.commit()
            except Exception as exc:
                self._pg_connection.rollback()
                if getattr(exc, "sqlstate", None) == "23505":
                    raise DuplicateAccount("email already registered") from exc
                raise
        return record

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
            with self._pg_connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM rescue_auth_revoked_tokens WHERE token_hash = %s", (token_hash,))
                return cursor.fetchone() is not None
