#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APPLY=0

usage() {
  cat <<'EOF'
Usage: sh infra/postgres/migrate.sh [--dry-run|--apply]

Default mode prints the ordered migration plan and SHA-256 checksums without
opening a database connection. --apply requires RESCUE_MEAL_DATABASE_URL to be
set to a PostgreSQL DSN and runs the locked psycopg migration runner through
uv. Applied migrations are recorded in rescue_schema_migrations; a changed
checksum stops the run before the changed migration is executed.
EOF
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
    return
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return
  fi
  echo "SHA-256 command is required (shasum or sha256sum)." >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      APPLY=0
      ;;
    --apply)
      APPLY=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$APPLY" -eq 1 ]; then
  DATABASE_URL=${RESCUE_MEAL_DATABASE_URL:-}
  case "$DATABASE_URL" in
    postgresql://*|postgres://*)
      ;;
    *)
      echo "--apply requires RESCUE_MEAL_DATABASE_URL to be a PostgreSQL DSN." >&2
      exit 1
      ;;
  esac
  if ! command -v uv >/dev/null 2>&1; then
    echo "--apply requires uv to run the locked psycopg migration runner." >&2
    exit 1
  fi
  exec uv run --project "$SCRIPT_DIR/../../services/api" --no-dev python "$SCRIPT_DIR/migrate.py"
fi

printf '%s\n' "Rescue Meal PostgreSQL migrations (ordered, 001→026)"
printf '%s\n' "Migration directory: $SCRIPT_DIR"

for migration in \
  001_initial_schema.sql \
  002_inventory_authority.sql \
  003_product_aliases.sql \
  004_product_enrichment.sql \
  005_gs1_date_source.sql \
  006_multi_day_meal_plans.sql \
  007_shopping_list.sql \
  008_meal_preferences.sql \
  009_inventory_search.sql \
  010_receipt_review_locations.sql \
  011_opened_at.sql \
  012_product_provider_runtime.sql \
  013_product_name_provider_runtime.sql \
  014_product_provenance.sql \
  015_product_provenance_audit.sql \
  016_product_info_audit.sql \
  017_date_storage_condition.sql \
  018_receipt_line_barcode.sql \
  019_shopping_receive_operations.sql \
  020_receipt_commit_idempotency.sql \
  021_account_deletion_fence.sql \
  022_receipt_review_metadata.sql \
  023_manual_food_idempotency.sql \
  024_recipe_catalog_revision.sql \
  025_storage_locations.sql \
  026_export_audit.sql
do
  path="$SCRIPT_DIR/$migration"
  if [ ! -f "$path" ]; then
    echo "Migration file is missing: $migration" >&2
    exit 1
  fi
  checksum=$(sha256_file "$path")
  printf '%s\n' "Plan $migration ($checksum)"
done

if [ "$APPLY" -eq 1 ]; then
  printf '%s\n' "PostgreSQL migrations applied or already current. Run /ready and a connectivity/read-write smoke test next."
else
  printf '%s\n' "Dry-run only. No database connection was opened. Use --apply explicitly after backup and DSN review."
fi
