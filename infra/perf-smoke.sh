#!/usr/bin/env sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIRECTORY/.." && pwd -P)
COMPOSE_FILE=$REPOSITORY_ROOT/infra/docker-compose.yml
PERF_SCRIPT=$REPOSITORY_ROOT/services/api/scripts/perf_smoke.py
PROJECT_NAME=${RESCUE_MEAL_PERF_SMOKE_PROJECT:-rescue-meal-perf-smoke-$$}
POSTGRES_PORT=${RESCUE_MEAL_PERF_SMOKE_POSTGRES_PORT:-55450}
API_PORT=${RESCUE_MEAL_PERF_SMOKE_API_PORT:-18060}
OCR_WORKER_PORT=${RESCUE_MEAL_PERF_SMOKE_OCR_PORT:-18061}

# These values are disposable smoke credentials. They are exported to the
# Compose process but are never printed by this script or written to evidence.
POSTGRES_PASSWORD=${RESCUE_MEAL_PERF_SMOKE_POSTGRES_PASSWORD:-rescue-meal-perf-smoke-password}
AUTH_SECRET=${RESCUE_MEAL_PERF_SMOKE_AUTH_SECRET:-rescue-meal-perf-smoke-auth-secret-0123456789}

TEMP_DIRECTORY=$(mktemp -d "${TMPDIR:-/tmp}/rescue-meal-perf-smoke.XXXXXX")
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
Usage: sh infra/perf-smoke.sh

Build and run the production-shaped disposable Compose stack, then measure a
bounded latency/throughput baseline on the dashboard read path and the
normalized inventory write path, including concurrent same-key idempotency
replay. Removes only the exact temporary project resources.

Optional environment overrides:
  RESCUE_MEAL_PERF_SMOKE_PROJECT
  RESCUE_MEAL_PERF_SMOKE_POSTGRES_PORT
  RESCUE_MEAL_PERF_SMOKE_API_PORT
  RESCUE_MEAL_PERF_SMOKE_OCR_PORT
  RESCUE_MEAL_PERF_SMOKE_MAX_P95_MS   (default 15000, fail-closed ceiling)
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

for required_command in docker curl jq python3; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "perf smoke requires $required_command in PATH." >&2
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

base="http://127.0.0.1:${API_PORT}"
guest_payload=$(curl --fail --silent --show-error --request POST "$base/api/auth/guest")
guest_token=$(printf '%s' "$guest_payload" | jq -r '.access_token // empty')
test -n "$guest_token"

# Latency is measured through the published host port so the numbers include
# the same Docker forwarding path a local reverse proxy would take.
python3 "$PERF_SCRIPT" \
  --base "$base" \
  --token "$guest_token" \
  --run-id "$PROJECT_NAME" \
  --max-p95-ms "${RESCUE_MEAL_PERF_SMOKE_MAX_P95_MS:-15000}" \
  | tee "$TEMP_DIRECTORY/perf-report.json"

printf '%s\n' \
  'Rescue Meal perf smoke passed.' \
  "project: $PROJECT_NAME"
