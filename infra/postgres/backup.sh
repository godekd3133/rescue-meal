#!/usr/bin/env sh

set -eu

OUTPUT_PATH=
DATABASE_URL=${RESCUE_MEAL_DATABASE_URL:-}
SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
CLIENT_WRAPPER=$SCRIPT_DIRECTORY/postgres-client.sh

usage() {
  cat <<'EOF'
Usage: RESCUE_MEAL_DATABASE_URL=postgresql://... sh infra/postgres/backup.sh --output PATH

Create a permission-restricted PostgreSQL custom-format backup. The output
path must not already exist. The DSN is read from the environment and is never
printed. Set RESCUE_MEAL_POSTGRES_CLIENT_MODE=docker when the host has no
PostgreSQL client; the wrapper uses a matching PostgreSQL client image.
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
    --output|-o)
      shift
      if [ "$#" -eq 0 ]; then
        echo "--output requires a path." >&2
        exit 2
      fi
      OUTPUT_PATH=$1
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

if [ -z "$OUTPUT_PATH" ]; then
  echo "--output is required." >&2
  exit 2
fi
export RESCUE_MEAL_POSTGRES_CLIENT_REQUIRED_TOOLS="pg_dump pg_restore psql"
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

CLIENT_MAJOR=$(pg_client pg_dump --version | awk '{print $3}' | cut -d. -f1)
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

OUTPUT_DIRECTORY=$(dirname -- "$OUTPUT_PATH")
if [ ! -d "$OUTPUT_DIRECTORY" ]; then
  echo "Backup output directory does not exist: $OUTPUT_DIRECTORY" >&2
  exit 1
fi
if [ -e "$OUTPUT_PATH" ] || [ -L "$OUTPUT_PATH" ]; then
  echo "Refusing to overwrite an existing backup: $OUTPUT_PATH" >&2
  exit 1
fi

umask 077
TEMP_PATH="$OUTPUT_PATH.tmp.$$"
cleanup() {
  rm -f -- "$TEMP_PATH"
}
trap cleanup EXIT HUP INT TERM

pg_client --database-url "$CLIENT_DATABASE_URL" --path "$TEMP_PATH" pg_dump \
  --no-password \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file "$TEMP_PATH"

pg_client --path "$TEMP_PATH" pg_restore --list "$TEMP_PATH" >/dev/null
mv -- "$TEMP_PATH" "$OUTPUT_PATH"
trap - EXIT HUP INT TERM
chmod 600 "$OUTPUT_PATH"

BYTES=$(wc -c < "$OUTPUT_PATH" | tr -d '[:space:]')
CHECKSUM=$(sha256_file "$OUTPUT_PATH")
printf '%s\n' "PostgreSQL backup created." \
  "file: $OUTPUT_PATH" \
  "bytes: $BYTES" \
  "sha256: $CHECKSUM" \
  "client: $CLIENT_MODE" \
  "format: custom" \
  "mode: 600"
