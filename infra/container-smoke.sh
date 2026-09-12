#!/usr/bin/env sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIRECTORY/.." && pwd -P)
COMPOSE_FILE=$REPOSITORY_ROOT/infra/docker-compose.yml
PROJECT_NAME=${RESCUE_MEAL_CONTAINER_SMOKE_PROJECT:-rescue-meal-container-smoke-$$}
POSTGRES_PORT=${RESCUE_MEAL_CONTAINER_SMOKE_POSTGRES_PORT:-55440}
API_PORT=${RESCUE_MEAL_CONTAINER_SMOKE_API_PORT:-18040}
OCR_WORKER_PORT=${RESCUE_MEAL_CONTAINER_SMOKE_OCR_PORT:-18041}

# These values are disposable smoke credentials. They are exported to the
# Compose process but are never printed by this script or written to evidence.
POSTGRES_PASSWORD=${RESCUE_MEAL_CONTAINER_SMOKE_POSTGRES_PASSWORD:-rescue-meal-container-smoke-password}
AUTH_SECRET=${RESCUE_MEAL_CONTAINER_SMOKE_AUTH_SECRET:-rescue-meal-container-smoke-auth-secret-0123456789}

TEMP_DIRECTORY=$(mktemp -d "${TMPDIR:-/tmp}/rescue-meal-container-smoke.XXXXXX")
RESOURCES_CREATED=0

cleanup() {
  trap - EXIT HUP INT TERM
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
Usage: sh infra/container-smoke.sh

Build and run the production-shaped disposable Compose stack, verify
PostgreSQL migrations, API/OCR readiness, guest authentication, normalized
inventory write, and same-key idempotent replay, then remove only the exact
temporary project resources.

Optional environment overrides:
  RESCUE_MEAL_CONTAINER_SMOKE_PROJECT
  RESCUE_MEAL_CONTAINER_SMOKE_POSTGRES_PORT
  RESCUE_MEAL_CONTAINER_SMOKE_API_PORT
  RESCUE_MEAL_CONTAINER_SMOKE_OCR_PORT
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
    echo "container smoke requires $required_command in PATH." >&2
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

wait_for_url "http://127.0.0.1:${API_PORT}/ready"
wait_for_url "http://127.0.0.1:${OCR_WORKER_PORT}/ready"

api_health=$(curl --fail --silent --show-error "http://127.0.0.1:${API_PORT}/health")
printf '%s' "$api_health" | jq -e '
  .status == "ok" and
  .service == "rescue-meal-api" and
  .storage == "postgresql-normalized-inventory"
' > /dev/null

api_ready=$(curl --fail --silent --show-error "http://127.0.0.1:${API_PORT}/ready")
printf '%s' "$api_ready" | jq -e '
  .status == "ready" and
  .database == "ok" and
  .storage == "postgresql-normalized-inventory" and
  .auth_required == true and
  .auth_configured == true
' > /dev/null

ocr_ready=$(curl --fail --silent --show-error "http://127.0.0.1:${OCR_WORKER_PORT}/ready")
printf '%s' "$ocr_ready" | jq -e '
  .status == "ready" and
  .service == "rescue-meal-ocr-worker" and
  .worker_state == "ready" and
  .available == true
' > /dev/null

expected_migrations=$(find "$SCRIPT_DIRECTORY/postgres" -maxdepth 1 -name '[0-9][0-9][0-9]_*.sql' | wc -l | tr -d ' ')
migration_rows=$(compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc 'SELECT count(*) FROM rescue_schema_migrations;')
# The ledger must cover every checked-in migration file. Deriving the count
# keeps the smoke aligned when a new additive migration lands.
test "$migration_rows" = "$expected_migrations"

base="http://127.0.0.1:${API_PORT}"
guest_payload=$(curl --fail --silent --show-error --request POST "$base/api/auth/guest")
guest_token=$(printf '%s' "$guest_payload" | jq -r '.access_token // empty')
test -n "$guest_token"
auth_header="Authorization: Bearer $guest_token"

me_payload=$(curl --fail --silent --show-error --header "$auth_header" "$base/api/auth/me")
printf '%s' "$me_payload" | jq -e '.mode == "guest" and (.workspace_id | type == "string" and length > 0)' > /dev/null

before_payload=$(curl --fail --silent --show-error --header "$auth_header" "$base/api/dashboard")
before_count=$(printf '%s' "$before_payload" | jq -r '.food_count')
test "$before_count" -ge 0

idempotency_key=container-smoke-food-20260910
food_payload=$(curl --fail --silent --show-error \
  --request POST \
  --header "$auth_header" \
  --header 'Content-Type: application/json' \
  --header "Idempotency-Key: $idempotency_key" \
  --data '{"canonical_name":"Container Smoke Food","quantity":1,"unit":"개","storage_type":"refrigerated","category":"테스트","note":"disposable container smoke"}' \
  "$base/api/foods")
printf '%s' "$food_payload" | jq -e '.canonical_name == "Container Smoke Food"' > /dev/null

after_payload=$(curl --fail --silent --show-error --header "$auth_header" "$base/api/dashboard")
after_count=$(printf '%s' "$after_payload" | jq -r '.food_count')
test "$after_count" -eq $((before_count + 1))

replay_headers=$TEMP_DIRECTORY/replay.headers
replay_body=$TEMP_DIRECTORY/replay.json
replay_status=$(curl --fail --silent --show-error \
  --dump-header "$replay_headers" \
  --output "$replay_body" \
  --write-out '%{http_code}' \
  --request POST \
  --header "$auth_header" \
  --header 'Content-Type: application/json' \
  --header "Idempotency-Key: $idempotency_key" \
  --data '{"canonical_name":"Container Smoke Food","quantity":1,"unit":"개","storage_type":"refrigerated","category":"테스트","note":"disposable container smoke"}' \
  "$base/api/foods")
test "$replay_status" = 201
grep -Eiq '^x-idempotency-replayed:[[:space:]]*true' "$replay_headers"

printf '%s\n' \
  'Rescue Meal container smoke passed.' \
  "project: $PROJECT_NAME" \
  "migration_rows: $migration_rows" \
  "api_health: ready" \
  "ocr_health: ready" \
  "guest_dashboard_foods: $before_count -> $after_count" \
  "idempotency_replay: 201 + X-Idempotency-Replayed=true"
