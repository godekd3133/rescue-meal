#!/usr/bin/env sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
CLIENT_WRAPPER=$SCRIPT_DIRECTORY/postgres-client.sh
TEMP_DIRECTORY=$(mktemp -d "${TMPDIR:-/tmp}/rescue-meal-postgres-client.XXXXXX")
FAKE_DOCKER=$TEMP_DIRECTORY/docker
FAKE_LOG=$TEMP_DIRECTORY/docker-args.log
ARCHIVE_PATH=$TEMP_DIRECTORY/backup.dump
trap 'rm -rf -- "$TEMP_DIRECTORY"' EXIT HUP INT TERM

printf '%s\n' \
  '#!/usr/bin/env sh' \
  'printf "%s\\n" "$@" > "$RESCUE_MEAL_FAKE_DOCKER_LOG"' \
  > "$FAKE_DOCKER"
chmod 700 "$FAKE_DOCKER"

DSN='postgresql://backup-user:backup-secret@host.docker.internal:5432/rescue_meal'
RESCUE_MEAL_POSTGRES_CLIENT_MODE=docker \
RESCUE_MEAL_POSTGRES_CLIENT_IMAGE=postgres:16-alpine \
RESCUE_MEAL_POSTGRES_CLIENT_REQUIRED_TOOLS='pg_dump pg_restore psql' \
RESCUE_MEAL_FAKE_DOCKER_LOG="$FAKE_LOG" \
RESCUE_MEAL_DATABASE_URL="$DSN" \
PATH="$TEMP_DIRECTORY:$PATH" \
  sh "$CLIENT_WRAPPER" \
  --database-url "$DSN" \
  --path "$ARCHIVE_PATH" \
  pg_dump --format=custom --file "$ARCHIVE_PATH"

grep -Fx -- "postgres:16-alpine" "$FAKE_LOG" >/dev/null
grep -Fx -- "--entrypoint" "$FAKE_LOG" >/dev/null
grep -Fx -- "/bin/sh" "$FAKE_LOG" >/dev/null
grep -Fx -- "--volume" "$FAKE_LOG" >/dev/null
grep -Fx -- "$TEMP_DIRECTORY:$TEMP_DIRECTORY:rw" "$FAKE_LOG" >/dev/null
if grep -F -- "$DSN" "$FAKE_LOG" >/dev/null; then
  echo "PostgreSQL DSN was exposed in docker command arguments." >&2
  exit 1
fi

DOCKER_DSN=$(sh "$CLIENT_WRAPPER" --docker-dsn 'postgresql://user:pass@127.0.0.1:5432/rescue_meal')
test "$DOCKER_DSN" = 'postgresql://user:pass@host.docker.internal:5432/rescue_meal'
SERVICE_DSN=$(sh "$CLIENT_WRAPPER" --docker-dsn 'postgresql://user:pass@db:5432/rescue_meal')
test "$SERVICE_DSN" = 'postgresql://user:pass@db:5432/rescue_meal'

sh -n "$CLIENT_WRAPPER" \
  "$SCRIPT_DIRECTORY/backup.sh" \
  "$SCRIPT_DIRECTORY/restore.sh"

printf '%s\n' 'PostgreSQL client wrapper contract passed.'
