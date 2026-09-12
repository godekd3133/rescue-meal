#!/usr/bin/env python3
"""Verify TTL-derived auth helper cleanup against a real PostgreSQL database."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import sys

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.auth import PostgresAccountRepository, hash_password


ACCOUNT_ID = "auth-retention-smoke-account"
OLD_RESET_HASH = "a" * 64
USED_RESET_HASH = "b" * 64
FRESH_RESET_HASH = "c" * 64
OLD_REVOKED_HASH = "d" * 64
FRESH_REVOKED_HASH = "e" * 64


def main() -> int:
    database_url = os.getenv("RESCUE_MEAL_DATABASE_URL", "").strip()
    if not database_url.startswith(("postgresql://", "postgres://")):
        print("RESCUE_MEAL_DATABASE_URL must be a PostgreSQL DSN", file=sys.stderr)
        return 1
    now = datetime.now(timezone.utc).replace(microsecond=0)
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rescue_auth_accounts
                    (id, email, password_hash, workspace_id, created_at, role, session_version, status)
                VALUES (%s, %s, %s, %s, %s, 'user', 0, 'active')
                ON CONFLICT (id) DO UPDATE SET status = 'active'
                """,
                (ACCOUNT_ID, "auth-retention-smoke@example.invalid", hash_password("retention-smoke-password"), "auth-retention-smoke-workspace", now),
            )
            cursor.execute(
                "DELETE FROM rescue_auth_password_reset_tokens WHERE token_hash IN (%s, %s, %s)",
                (OLD_RESET_HASH, USED_RESET_HASH, FRESH_RESET_HASH),
            )
            cursor.execute(
                "DELETE FROM rescue_auth_revoked_tokens WHERE token_hash IN (%s, %s)",
                (OLD_REVOKED_HASH, FRESH_REVOKED_HASH),
            )
            cursor.executemany(
                "INSERT INTO rescue_auth_password_reset_tokens (token_hash, account_id, session_version, expires_at, created_at, used_at) VALUES (%s, %s, 0, %s, %s, %s)",
                [
                    (OLD_RESET_HASH, ACCOUNT_ID, now - timedelta(hours=2), now - timedelta(hours=3), None),
                    (USED_RESET_HASH, ACCOUNT_ID, now + timedelta(hours=1), now - timedelta(hours=3), now - timedelta(hours=2)),
                    (FRESH_RESET_HASH, ACCOUNT_ID, now + timedelta(hours=1), now, None),
                ],
            )
            cursor.executemany(
                "INSERT INTO rescue_auth_revoked_tokens (token_hash, revoked_at) VALUES (%s, %s)",
                [
                    (OLD_REVOKED_HASH, now - timedelta(days=30, hours=2)),
                    (FRESH_REVOKED_HASH, now - timedelta(days=30)),
                ],
            )
        connection.commit()

    repository = PostgresAccountRepository(database_url, initialize_schema=False)
    try:
        result = repository.cleanup_expired_security_records(now=now)
    finally:
        repository.close()

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT COUNT(*) FROM rescue_auth_password_reset_tokens WHERE token_hash IN (%s, %s, %s)",
                (OLD_RESET_HASH, USED_RESET_HASH, FRESH_RESET_HASH),
            )
            reset_remaining = int(cursor.fetchone()[0])
            cursor.execute(
                "SELECT COUNT(*) FROM rescue_auth_revoked_tokens WHERE token_hash IN (%s, %s)",
                (OLD_REVOKED_HASH, FRESH_REVOKED_HASH),
            )
            revoked_remaining = int(cursor.fetchone()[0])
            cursor.execute("DELETE FROM rescue_auth_revoked_tokens WHERE token_hash IN (%s, %s)", (OLD_REVOKED_HASH, FRESH_REVOKED_HASH))
            cursor.execute("DELETE FROM rescue_auth_accounts WHERE id = %s", (ACCOUNT_ID,))
        connection.commit()

    expected = {"password_reset_tokens": 2, "revoked_tokens": 1}
    if result != expected or reset_remaining != 1 or revoked_remaining != 1:
        print("PostgreSQL auth retention smoke failed", file=sys.stderr)
        return 1
    print("PostgreSQL auth retention smoke passed: reset_removed=2 revoked_removed=1 fresh_rows=2")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
