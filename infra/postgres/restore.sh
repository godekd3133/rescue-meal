#!/usr/bin/env sh

set -eu

INPUT_PATH=
DATABASE_URL=${RESCUE_MEAL_DATABASE_URL:-}
CONFIRM_RESTORE=0
CONFIRM_PRODUCTION_RESTORE=0
SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
CLIENT_WRAPPER=$SCRIPT_DIRECTORY/postgres-client.sh

usage() {
  cat <<'EOF'
Usage: RESCUE_MEAL_DATABASE_URL=postgresql://... sh infra/postgres/restore.sh \
  --input PATH --confirm-restore [--confirm-production-restore]

Restore a custom-format PostgreSQL archive into an empty database. The target
must contain no public tables; this script never drops an existing schema.
The DSN is read from the environment and is never printed. Set
RESCUE_MEAL_POSTGRES_CLIENT_MODE=docker when the host has no PostgreSQL
client; the wrapper uses a matching PostgreSQL client image.

Production restores additionally require --confirm-production-restore. Use a
newly provisioned empty database, then run the application readiness and
read/write smoke tests before changing traffic.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --input|-i)
      shift
      if [ "$#" -eq 0 ]; then
        echo "--input requires a path." >&2
        exit 2
      fi
      INPUT_PATH=$1
      ;;
    --confirm-restore)
      CONFIRM_RESTORE=1
      ;;
    --confirm-production-restore)
      CONFIRM_PRODUCTION_RESTORE=1
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

case "$DATABASE_URL" in
  postgresql://*|postgres://*)
    ;;
  *)
    echo "RESCUE_MEAL_DATABASE_URL must be a PostgreSQL DSN." >&2
    exit 1
    ;;
esac

if [ -z "$INPUT_PATH" ]; then
  echo "--input is required." >&2
  exit 2
fi
if [ "$CONFIRM_RESTORE" -ne 1 ]; then
  echo "Refusing restore without explicit --confirm-restore." >&2
  exit 1
fi
if [ "${RESCUE_MEAL_ENVIRONMENT:-}" = "production" ] && [ "$CONFIRM_PRODUCTION_RESTORE" -ne 1 ]; then
  echo "Production restore additionally requires --confirm-production-restore." >&2
  exit 1
fi
if [ ! -f "$INPUT_PATH" ] || [ -L "$INPUT_PATH" ]; then
  echo "Restore input must be a regular, non-symlink file: $INPUT_PATH" >&2
  exit 1
fi
export RESCUE_MEAL_POSTGRES_CLIENT_REQUIRED_TOOLS="pg_restore psql"
CLIENT_MODE=$(sh "$CLIENT_WRAPPER" --resolve-mode)
CLIENT_DATABASE_URL=$DATABASE_URL
if [ "$CLIENT_MODE" = "docker" ]; then
  CLIENT_DATABASE_URL=$(sh "$CLIENT_WRAPPER" --docker-dsn "$DATABASE_URL")
fi

pg_client() {
  if [ "$1" = "--path" ]; then
    PATH_ARGUMENT=$2
    shift 2
    RESCUE_MEAL_POSTGRES_CLIENT_MODE="$CLIENT_MODE" \
      sh "$CLIENT_WRAPPER" --path "$PATH_ARGUMENT" "$@"
    return
  fi
  RESCUE_MEAL_POSTGRES_CLIENT_MODE="$CLIENT_MODE" \
    sh "$CLIENT_WRAPPER" "$@"
}

CLIENT_MAJOR=$(pg_client pg_restore --version | awk '{print $3}' | cut -d. -f1)
SERVER_MAJOR=$(pg_client --database-url "$CLIENT_DATABASE_URL" psql \
  --no-psqlrc \
  --no-password \
  --tuples-only \
  --no-align \
  --command "SHOW server_version;" \
  | tr -d '[:space:]' | cut -d. -f1)
case "$CLIENT_MAJOR:$SERVER_MAJOR" in
  ''|*:|:*)
    echo "Could not verify PostgreSQL client/server major versions." >&2
    exit 1
    ;;
esac
if [ "$CLIENT_MAJOR" != "$SERVER_MAJOR" ]; then
  echo "PostgreSQL client/server major version mismatch (client $CLIENT_MAJOR, server $SERVER_MAJOR). Use a matching client image." >&2
  exit 1
fi

pg_client --path "$INPUT_PATH" pg_restore --list "$INPUT_PATH" >/dev/null

TABLE_COUNT=$(pg_client --database-url "$CLIENT_DATABASE_URL" psql \
  --no-psqlrc \
  --no-password \
  --tuples-only \
  --no-align \
  --command "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';" \
  | tr -d '[:space:]')
case "$TABLE_COUNT" in
  ''|*[!0-9]*)
    echo "Could not verify that the restore target is empty." >&2
    exit 1
    ;;
esac
if [ "$TABLE_COUNT" -ne 0 ]; then
  echo "Refusing restore: target contains $TABLE_COUNT public table(s). Use a newly provisioned empty database." >&2
  exit 1
fi

pg_client --database-url "$CLIENT_DATABASE_URL" --path "$INPUT_PATH" pg_restore \
  --no-password \
  --exit-on-error \
  --single-transaction \
  --no-owner \
  --no-privileges \
  "$INPUT_PATH"

SCHEMA_OK=$(pg_client --database-url "$CLIENT_DATABASE_URL" psql \
  --no-psqlrc \
  --no-password \
  --tuples-only \
  --no-align \
  --command "SELECT CASE WHEN to_regclass('public.rescue_inventory_lots') IS NOT NULL AND to_regclass('public.rescue_auth_accounts') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rescue_inventory_date_assertions' AND column_name = 'storage_condition_text') THEN 'ok' ELSE 'missing' END;" \
  | tr -d '[:space:]')
if [ "$SCHEMA_OK" != "ok" ]; then
  echo "Restore completed but the expected Rescue Meal schema check failed." >&2
  exit 1
fi

printf '%s\n' "PostgreSQL restore completed into an empty target." \
  "archive: $INPUT_PATH" \
  "client: $CLIENT_MODE" \
  "schema: rescue-meal-ready"
