#!/usr/bin/env python3
"""Apply Rescue Meal PostgreSQL migrations with one locked session.

The checked-in SQL files are intentionally left immutable. Their optional
BEGIN/COMMIT wrappers are removed from the in-memory statement so the runner
can commit each migration body and its ledger row atomically.
"""

from __future__ import annotations

import hashlib
import os
import re
import sys
from pathlib import Path

import psycopg


MIGRATIONS = (
    "001_initial_schema.sql",
    "002_inventory_authority.sql",
    "003_product_aliases.sql",
    "004_product_enrichment.sql",
    "005_gs1_date_source.sql",
    "006_multi_day_meal_plans.sql",
    "007_shopping_list.sql",
    "008_meal_preferences.sql",
    "009_inventory_search.sql",
    "010_receipt_review_locations.sql",
    "011_opened_at.sql",
    "012_product_provider_runtime.sql",
    "013_product_name_provider_runtime.sql",
    "014_product_provenance.sql",
    "015_product_provenance_audit.sql",
    "016_product_info_audit.sql",
    "017_date_storage_condition.sql",
    "018_receipt_line_barcode.sql",
    "019_shopping_receive_operations.sql",
    "020_receipt_commit_idempotency.sql",
    "021_account_deletion_fence.sql",
    "022_receipt_review_metadata.sql",
    "023_manual_food_idempotency.sql",
    "024_recipe_catalog_revision.sql",
    "025_storage_locations.sql",
)
LOCK_NAME = "rescue-meal-schema-migrations"
MIGRATION_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS rescue_schema_migrations (
    migration_name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
)
"""
TRANSACTION_WRAPPER = re.compile(r"(?im)^\s*(?:BEGIN|COMMIT)\s*;\s*(?:--[^\n]*)?\n?")


class MigrationError(RuntimeError):
    """Raised when a migration cannot be applied safely."""


def _database_url() -> str:
    value = os.getenv("RESCUE_MEAL_DATABASE_URL", "").strip()
    if not value.startswith(("postgresql://", "postgres://")):
        raise MigrationError("RESCUE_MEAL_DATABASE_URL must be a PostgreSQL DSN")
    return value


def _checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _migration_body(path: Path) -> str:
    sql = path.read_text(encoding="utf-8")
    body = TRANSACTION_WRAPPER.sub("", sql).strip()
    if not body:
        raise MigrationError(f"Migration file is empty: {path.name}")
    return body


def apply_migrations(migration_directory: Path, database_url: str) -> None:
    paths = [migration_directory / name for name in MIGRATIONS]
    missing = [path.name for path in paths if not path.is_file()]
    if missing:
        raise MigrationError(f"Migration file is missing: {', '.join(missing)}")

    with psycopg.connect(database_url) as connection:
        # Session-level lock survives each per-migration transaction and makes
        # two deploy/migration runners serialize before either can inspect or
        # mutate the ledger.
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_lock(hashtextextended(%s, 0))", (LOCK_NAME,))
            cursor.execute(MIGRATION_TABLE_SQL)
        connection.commit()

        print("Migration ledger: rescue_schema_migrations")
        print("Rescue Meal PostgreSQL migrations (ordered, 001→025)")
        print(f"Migration directory: {migration_directory}")

        for path in paths:
            checksum = _checksum(path)
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT checksum FROM rescue_schema_migrations WHERE migration_name = %s",
                        (path.name,),
                    )
                    row = cursor.fetchone()
                    if row is not None:
                        existing_checksum = str(row[0])
                        if existing_checksum != checksum:
                            raise MigrationError(
                                "Migration checksum drift detected: "
                                f"{path.name}\nApplied: {existing_checksum}\nCurrent: {checksum}"
                            )
                        print(f"Already applied {path.name} ({checksum})")
                        continue

                    print(f"Applying {path.name} ({checksum})")
                    cursor.execute(_migration_body(path))
                    cursor.execute(
                        """
                        INSERT INTO rescue_schema_migrations (migration_name, checksum)
                        VALUES (%s, %s)
                        """,
                        (path.name, checksum),
                    )

    print("PostgreSQL migrations applied or already current. Run /ready and a connectivity/read-write smoke test next.")


def main() -> int:
    try:
        apply_migrations(Path(__file__).resolve().parent, _database_url())
    except MigrationError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except psycopg.Error as exc:
        print(f"PostgreSQL migration failed: {exc.__class__.__name__}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
