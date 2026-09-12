#!/usr/bin/env python3
"""Run the safe, TTL-derived authentication helper cleanup.

Schedule this script from the deployment maintenance plane. It never prints
token values, account email addresses, workspace IDs, or the database DSN.
"""

from __future__ import annotations

import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.auth import AccountRepository, PostgresAccountRepository


def main() -> int:
    database_url = os.getenv("RESCUE_MEAL_DATABASE_URL", "").strip()
    sqlite_path = os.getenv("RESCUE_MEAL_AUTH_SQLITE_PATH", "").strip()
    repository = None
    try:
        if database_url.startswith(("postgresql://", "postgres://")):
            repository = PostgresAccountRepository(database_url, initialize_schema=False)
        elif sqlite_path:
            repository = AccountRepository(sqlite_path)
        else:
            print("RESCUE_MEAL_DATABASE_URL or RESCUE_MEAL_AUTH_SQLITE_PATH is required", file=sys.stderr)
            return 1
        result = repository.cleanup_expired_security_records()
        print(
            "Auth security cleanup complete: "
            f"password_reset_tokens={result['password_reset_tokens']} "
            f"revoked_tokens={result['revoked_tokens']}"
        )
        return 0
    except Exception as exc:
        print(f"Auth security cleanup failed: {exc.__class__.__name__}", file=sys.stderr)
        return 1
    finally:
        if repository is not None:
            repository.close()


if __name__ == "__main__":
    raise SystemExit(main())
