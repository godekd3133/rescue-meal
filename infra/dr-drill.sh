#!/usr/bin/env sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIRECTORY/.." && pwd -P)
COMPOSE_FILE=$REPOSITORY_ROOT/infra/docker-compose.yml
PROJECT_NAME=${RESCUE_MEAL_DR_DRILL_PROJECT:-rescue-meal-dr-drill-$$}
POSTGRES_PORT=${RESCUE_MEAL_DR_DRILL_POSTGRES_PORT:-55460}
API_PORT=${RESCUE_MEAL_DR_DRILL_API_PORT:-18070}
OCR_WORKER_PORT=${RESCUE_MEAL_DR_DRILL_OCR_PORT:-18071}
RESTORED_API_PORT=${RESCUE_MEAL_DR_DRILL_RESTORED_API_PORT:-18072}

# These values are disposable drill credentials. They are exported to the
# Compose process but are never printed by this script or written to evidence.
POSTGRES_PASSWORD=${RESCUE_MEAL_DR_DRILL_POSTGRES_PASSWORD:-rescue-meal-dr-drill-password}
AUTH_SECRET=${RESCUE_MEAL_DR_DRILL_AUTH_SECRET:-rescue-meal-dr-drill-auth-secret-0123456789}

TEMP_DIRECTORY=$(mktemp -d "${TMPDIR:-/tmp}/rescue-meal-dr-drill.XXXXXX")
RESOURCES_CREATED=0
RESTORED_API_CONTAINER="${PROJECT_NAME}-restored-api"

cleanup() {
  trap - EXIT HUP INT TERM
  docker rm -f "$RESTORED_API_CONTAINER" >/dev/null 2>&1 || true
  if [ "$RESOURCES_CREATED" -eq 1 ]; then
    docker compose \
      --project-name "$PROJECT_NAME" \
      --file "$COMPOSE_FILE" \
      down --volumes --remove-orphans --rmi local >/dev/null 2>&1 || true
  fi
  rm -rf -- "$TEMP_DIRECTORY"
}
trap cleanup EXIT HUP INT TERM

usage() {
  cat <<'EOF'
Usage: sh infra/dr-drill.sh

Run an end-to-end disaster-recovery drill against a disposable
production-shaped Compose stack: write inventory through the API, create a
pg_dump custom-format backup with infra/postgres/backup.sh, restore it into a
freshly provisioned empty database with infra/postgres/restore.sh, boot a
second API container against the restored database, and verify readiness plus
the original guest token can read back the same inventory. Removes only the
exact temporary project resources.

Optional environment overrides:
  RESCUE_MEAL_DR_DRILL_PROJECT
  RESCUE_MEAL_DR_DRILL_POSTGRES_PORT
  RESCUE_MEAL_DR_DRILL_API_PORT
  RESCUE_MEAL_DR_DRILL_OCR_PORT
  RESCUE_MEAL_DR_DRILL_RESTORED_API_PORT
EOF
}

if [ "$#" -gt 0 ]; then
  case "$1" in
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
fi

for required_command in docker curl jq; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "dr drill requires $required_command in PATH." >&2
    exit 1
  fi
done

compose() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    --file "$COMPOSE_FILE" \
    "$@"
}

if [ -n "$(compose ps -aq 2>/dev/null)" ] \
  || [ -n "$(docker volume ls --quiet --filter "label=com.docker.compose.project=$PROJECT_NAME")" ] \
  || [ -n "$(docker network ls --quiet --filter "label=com.docker.compose.project=$PROJECT_NAME")" ]; then
  echo "Refusing to reuse an existing Compose project: $PROJECT_NAME" >&2
  exit 1
fi

export POSTGRES_DB=rescue_meal
export POSTGRES_USER=rescue_meal
export POSTGRES_PASSWORD
export POSTGRES_PORT
export API_PORT
export OCR_WORKER_PORT
export RESCUE_MEAL_ENVIRONMENT=local
export RESCUE_MEAL_AUTH_REQUIRED=true
export RESCUE_MEAL_AUTH_SECRET=$AUTH_SECRET
export RESCUE_MEAL_INVENTORY_MODE=normalized
export RESCUE_MEAL_CORS_ORIGINS="http://127.0.0.1:${API_PORT}"

compose build api migrate ocr-worker
RESOURCES_CREATED=1
compose up -d db migrate ocr-worker api

wait_for_url() {
  URL=$1
  ATTEMPT=0
  while [ "$ATTEMPT" -lt 60 ]; do
    if curl --fail --silent --show-error "$URL" > /dev/null 2>&1; then
      return 0
    fi
    ATTEMPT=$((ATTEMPT + 1))
    sleep 2
  done
  echo "Timed out waiting for $URL." >&2
  compose ps >&2 || true
  return 1
}

base="http://127.0.0.1:${API_PORT}"
wait_for_url "$base/ready"
wait_for_url "http://127.0.0.1:${OCR_WORKER_PORT}/ready"

# Seed verifiable inventory through the real API write path.
guest_payload=$(curl --fail --silent --show-error --request POST "$base/api/auth/guest")
guest_token=$(printf '%s' "$guest_payload" | jq -r '.access_token // empty')
test -n "$guest_token"
auth_header="Authorization: Bearer $guest_token"

for food_name in "DR Drill Food A" "DR Drill Food B"; do
  curl --fail --silent --show-error \
    --request POST \
    --header "$auth_header" \
    --header 'Content-Type: application/json' \
    --data "{\"canonical_name\":\"$food_name\",\"quantity\":1,\"unit\":\"개\",\"storage_type\":\"refrigerated\",\"category\":\"dr-drill\",\"note\":\"disposable drill seed\"}" \
    "$base/api/foods" > /dev/null
done

source_count=$(curl --fail --silent --show-error --header "$auth_header" "$base/api/dashboard" | jq -r '.food_count')
test "$source_count" -ge 2

# Phase 1: back up the live database through the checked-in script.
BACKUP_PATH=$TEMP_DIRECTORY/dr-drill-backup.dump
RESCUE_MEAL_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}" \
  sh "$SCRIPT_DIRECTORY/postgres/backup.sh" --output "$BACKUP_PATH"
test -s "$BACKUP_PATH"

# Phase 2: provision an empty database and restore into it. restore.sh refuses
# non-empty targets, so a dedicated database is created first.
compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qc 'CREATE DATABASE rescue_meal_restored;' > /dev/null
RESCUE_MEAL_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/rescue_meal_restored" \
  sh "$SCRIPT_DIRECTORY/postgres/restore.sh" --input "$BACKUP_PATH" --confirm-restore

# Phase 3: prove recoverability at the application layer. A second API process
# on the same Compose network points at the restored database and must serve
# the same workspace data under the original guest token.
API_IMAGE="${PROJECT_NAME}-api:latest"
docker rm -f "$RESTORED_API_CONTAINER" >/dev/null 2>&1 || true
docker run -d \
  --name "$RESTORED_API_CONTAINER" \
  --network "${PROJECT_NAME}_default" \
  --publish "127.0.0.1:${RESTORED_API_PORT}:8000" \
  --env RESCUE_MEAL_ENVIRONMENT=local \
  --env "RESCUE_MEAL_DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/rescue_meal_restored" \
  --env RESCUE_MEAL_INVENTORY_MODE=normalized \
  --env RESCUE_MEAL_AUTH_REQUIRED=true \
  --env "RESCUE_MEAL_AUTH_SECRET=$AUTH_SECRET" \
  --env RESCUE_MEAL_OCR_URL=http://ocr-worker:8002 \
  "$API_IMAGE" > /dev/null

restored_base="http://127.0.0.1:${RESTORED_API_PORT}"
wait_for_url "$restored_base/ready"

restored_ready=$(curl --fail --silent --show-error "$restored_base/ready")
printf '%s' "$restored_ready" | jq -e '
  .status == "ready" and
  .database == "ok" and
  .storage == "postgresql-normalized-inventory"
' > /dev/null

restored_count=$(curl --fail --silent --show-error --header "$auth_header" "$restored_base/api/dashboard" | jq -r '.food_count')
test "$restored_count" = "$source_count"

printf '%s\n' \
  'Rescue Meal disaster-recovery drill passed.' \
  "project: $PROJECT_NAME" \
  "backup_bytes: $(wc -c < "$BACKUP_PATH" | tr -d ' ')" \
  "restored_ready: ready" \
  "food_count: $source_count -> $restored_count"
