#!/usr/bin/env sh

set -eu

CLIENT_MODE=${RESCUE_MEAL_POSTGRES_CLIENT_MODE:-auto}
CLIENT_IMAGE=${RESCUE_MEAL_POSTGRES_CLIENT_IMAGE:-postgres:16-alpine}
CLIENT_NETWORK=${RESCUE_MEAL_POSTGRES_CLIENT_DOCKER_NETWORK:-}
REQUIRED_TOOLS=${RESCUE_MEAL_POSTGRES_CLIENT_REQUIRED_TOOLS:-pg_dump pg_restore psql}

usage() {
  cat <<'EOF'
Usage:
  sh infra/postgres/postgres-client.sh --resolve-mode
  sh infra/postgres/postgres-client.sh --docker-dsn POSTGRES_DSN
sh infra/postgres/postgres-client.sh [--path PATH] [--database-url DSN] TOOL [TOOL_ARGS...]

Run a PostgreSQL client either from the host or from a disposable, versioned
PostgreSQL client image. TOOL is one of pg_dump, pg_restore, or psql. The
optional --path mounts the path's parent directory into the client container;
it is intended for an archive input or output path.

RESCUE_MEAL_POSTGRES_CLIENT_MODE is auto (default), host, or docker. In auto
mode, host is selected only when every tool named by
RESCUE_MEAL_POSTGRES_CLIENT_REQUIRED_TOOLS is installed; otherwise docker is
selected when Docker is available. The DSN is never printed by this wrapper.
EOF
}

host_toolchain_available() {
  for required_tool in $REQUIRED_TOOLS; do
    if ! command -v "$required_tool" >/dev/null 2>&1; then
      return 1
    fi
  done
  return 0
}

docker_available() {
  command -v docker >/dev/null 2>&1
}

resolve_mode() {
  case "$CLIENT_MODE" in
    host)
      if ! host_toolchain_available; then
        echo "PostgreSQL host client mode requires: ${REQUIRED_TOOLS:-the requested client tool(s)}." >&2
        return 1
      fi
      printf '%s\n' host
      ;;
    docker)
      if ! docker_available; then
        echo "PostgreSQL Docker client mode requires docker in PATH." >&2
        return 1
      fi
      printf '%s\n' docker
      ;;
    auto)
      if host_toolchain_available; then
        printf '%s\n' host
      elif docker_available; then
        printf '%s\n' docker
      else
        echo "No complete PostgreSQL client toolchain is available. Install pg_dump, pg_restore, and psql or configure Docker." >&2
        return 1
      fi
      ;;
    *)
      echo "RESCUE_MEAL_POSTGRES_CLIENT_MODE must be auto, host, or docker." >&2
      return 1
      ;;
  esac
}

docker_dsn() {
  # Docker Desktop cannot use the host container's 127.0.0.1/localhost. Keep
  # service names such as `db` unchanged; only host-loopback DSNs are mapped.
  printf '%s' "$1" | sed -E \
    's#^(postgres(ql)?://)([^/@]+@)?(localhost|127\.0\.0\.1)(:|/|$)#\1\3host.docker.internal\5#'
}

if [ "$#" -eq 0 ]; then
  usage >&2
  exit 2
fi

case "$1" in
  --help|-h)
    usage
    exit 0
    ;;
  --resolve-mode)
    if [ "$#" -ne 1 ]; then
      echo "--resolve-mode does not accept additional arguments." >&2
      exit 2
    fi
    resolve_mode
    exit
    ;;
  --docker-dsn)
    if [ "$#" -ne 2 ]; then
      echo "--docker-dsn requires exactly one PostgreSQL DSN." >&2
      exit 2
    fi
    docker_dsn "$2"
    printf '\n'
    exit
    ;;
esac

MOUNT_PATH=
DATABASE_URL_ARGUMENT=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --path)
      if [ "$#" -lt 2 ]; then
        echo "--path requires a path." >&2
        exit 2
      fi
      if [ -n "$MOUNT_PATH" ]; then
        echo "Only one --path is supported per PostgreSQL client command." >&2
        exit 2
      fi
      MOUNT_PATH=$2
      shift 2
      ;;
    --database-url)
      if [ "$#" -lt 2 ]; then
        echo "--database-url requires a PostgreSQL DSN." >&2
        exit 2
      fi
      if [ -n "$DATABASE_URL_ARGUMENT" ]; then
        echo "Only one --database-url is supported per PostgreSQL client command." >&2
        exit 2
      fi
      DATABASE_URL_ARGUMENT=$2
      shift 2
      ;;
    pg_dump|pg_restore|psql)
      CLIENT_COMMAND=$1
      shift
      break
      ;;
    *)
      echo "Expected a PostgreSQL client command, got: $1" >&2
      exit 2
      ;;
  esac
done
if [ -z "${CLIENT_COMMAND:-}" ]; then
  echo "A PostgreSQL client command is required." >&2
  exit 2
fi
case "$CLIENT_COMMAND" in
  pg_dump|pg_restore|psql)
    ;;
  *)
    echo "Unsupported PostgreSQL client command: $CLIENT_COMMAND" >&2
    exit 2
    ;;
esac

SELECTED_MODE=$(resolve_mode)
case "$SELECTED_MODE" in
  host)
    if [ -n "$MOUNT_PATH" ]; then
      # The host client already sees the native path. This validation still
      # catches an accidental path typo before the underlying command runs.
      MOUNT_DIRECTORY=$(dirname -- "$MOUNT_PATH")
      if [ ! -d "$MOUNT_DIRECTORY" ]; then
        echo "PostgreSQL client path directory does not exist: $MOUNT_DIRECTORY" >&2
        exit 1
      fi
    fi
    if [ -n "$DATABASE_URL_ARGUMENT" ]; then
      exec "$CLIENT_COMMAND" --dbname "$DATABASE_URL_ARGUMENT" "$@"
    fi
    exec "$CLIENT_COMMAND" "$@"
    ;;
  docker)
    if [ -n "$MOUNT_PATH" ]; then
      case "$MOUNT_PATH" in
        /*)
          ;;
        *)
          echo "Docker PostgreSQL client paths must be absolute: $MOUNT_PATH" >&2
          exit 1
          ;;
      esac
      MOUNT_DIRECTORY=$(dirname -- "$MOUNT_PATH")
      if [ ! -d "$MOUNT_DIRECTORY" ]; then
        echo "PostgreSQL client path directory does not exist: $MOUNT_DIRECTORY" >&2
        exit 1
      fi
    fi

    if [ -n "$DATABASE_URL_ARGUMENT" ]; then
      RESCUE_MEAL_DATABASE_URL=$DATABASE_URL_ARGUMENT
      export RESCUE_MEAL_DATABASE_URL
      CLIENT_RUNNER='command=$1; shift; exec "$command" --dbname "$RESCUE_MEAL_DATABASE_URL" "$@"'
    else
      CLIENT_RUNNER='command=$1; shift; exec "$command" "$@"'
    fi

    run_docker_client() {
      if [ -n "$MOUNT_PATH" ] && [ -n "$CLIENT_NETWORK" ]; then
        exec docker run --rm \
          --user "$(id -u):$(id -g)" \
          --add-host host.docker.internal:host-gateway \
          --network "$CLIENT_NETWORK" \
          --env RESCUE_MEAL_DATABASE_URL \
          --volume "$MOUNT_DIRECTORY:$MOUNT_DIRECTORY:rw" \
          --entrypoint /bin/sh \
          "$CLIENT_IMAGE" -c "$CLIENT_RUNNER" sh "$CLIENT_COMMAND" "$@"
      fi
      if [ -n "$MOUNT_PATH" ]; then
        exec docker run --rm \
          --user "$(id -u):$(id -g)" \
          --add-host host.docker.internal:host-gateway \
          --env RESCUE_MEAL_DATABASE_URL \
          --volume "$MOUNT_DIRECTORY:$MOUNT_DIRECTORY:rw" \
          --entrypoint /bin/sh \
          "$CLIENT_IMAGE" -c "$CLIENT_RUNNER" sh "$CLIENT_COMMAND" "$@"
      fi
      if [ -n "$CLIENT_NETWORK" ]; then
        exec docker run --rm \
          --user "$(id -u):$(id -g)" \
          --add-host host.docker.internal:host-gateway \
          --network "$CLIENT_NETWORK" \
          --env RESCUE_MEAL_DATABASE_URL \
          --entrypoint /bin/sh \
          "$CLIENT_IMAGE" -c "$CLIENT_RUNNER" sh "$CLIENT_COMMAND" "$@"
      fi
      exec docker run --rm \
        --user "$(id -u):$(id -g)" \
        --add-host host.docker.internal:host-gateway \
        --env RESCUE_MEAL_DATABASE_URL \
        --entrypoint /bin/sh \
        "$CLIENT_IMAGE" -c "$CLIENT_RUNNER" sh "$CLIENT_COMMAND" "$@"
    }

    run_docker_client "$@"
    ;;
esac
