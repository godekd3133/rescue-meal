#!/bin/sh
# Bootstrap Postgres 16 (pgvector) + Grocy containers on the e2-micro VM.
# Run ON the VM (Container-Optimized OS):
#   gcloud compute scp infra/gcp/vm-setup.sh rescue-meal-vm:/tmp/
#   RESCUE_MEAL_DB_PASSWORD=... gcloud compute ssh rescue-meal-vm \
#     --zone us-west1-a --command='RESCUE_MEAL_DB_PASSWORD=... bash /tmp/vm-setup.sh'
#
# Postgres listens on 5432 with SSL required (self-signed cert lives in the
# data dir). pg_hba.conf: hostssl-only — non-SSL TCP is rejected.
# Grocy listens on 9283 (public firewall rule; Grocy enforces its own login).
set -eux

: "${RESCUE_MEAL_DB_PASSWORD:?set RESCUE_MEAL_DB_PASSWORD}"

# Swap headroom — e2-micro has 1GB.
sudo fallocate -l 1G /var/swapfile 2>/dev/null || true
sudo chmod 600 /var/swapfile
sudo mkswap /var/swapfile 2>/dev/null || true
sudo swapon /var/swapfile 2>/dev/null || true

mkdir -p "$HOME/certs"
[ -f "$HOME/certs/server.crt" ] || \
  openssl req -new -x509 -days 3650 -nodes -subj "/CN=pg.rescue-meal" \
    -keyout "$HOME/certs/server.key" -out "$HOME/certs/server.crt"
chmod 600 "$HOME/certs/server.key"

docker pull pgvector/pgvector:pg16
docker rm -f pg 2>/dev/null || true
docker run -d --name pg --restart unless-stopped -p 5432:5432 \
  -e POSTGRES_DB=rescue_meal -e POSTGRES_USER=rescue_meal \
  -e POSTGRES_PASSWORD="$RESCUE_MEAL_DB_PASSWORD" \
  -v pgdata:/var/lib/postgresql/data \
  -v "$HOME/certs:/certs:ro" \
  --entrypoint sh pgvector/pgvector:pg16 -c '
cp /certs/server.crt /certs/server.key /tmp/ &&
chown postgres:postgres /tmp/server.crt /tmp/server.key && chmod 600 /tmp/server.key &&
exec docker-entrypoint.sh postgres
  -c shared_buffers=128MB -c work_mem=4MB -c maintenance_work_mem=64MB -c max_connections=50'

# After first boot: move certs into pgdata (owned by postgres), enable SSL,
# and lock pg_hba to hostssl+scram. Run once the container is initialized.
docker exec -u 0 pg sh -c \
  'cp /certs/server.crt /certs/server.key /var/lib/postgresql/data/ &&
   chown postgres:postgres /var/lib/postgresql/data/server.* &&
   chmod 600 /var/lib/postgresql/data/server.key &&
   printf "local all all trust\nhostssl all all all scram-sha-256\nhost all all all reject\n" \
     > /var/lib/postgresql/data/pg_hba.conf'
docker exec pg psql -U rescue_meal -d rescue_meal -c "ALTER SYSTEM SET ssl=on"
docker exec pg psql -U rescue_meal -d rescue_meal -c "ALTER SYSTEM SET ssl_cert_file='server.crt'"
docker exec pg psql -U rescue_meal -d rescue_meal -c "ALTER SYSTEM SET ssl_key_file='server.key'"
docker restart pg

docker pull linuxserver/grocy:latest
docker rm -f grocy 2>/dev/null || true
docker run -d --name grocy --restart unless-stopped -p 9283:80 \
  -v grocy-data:/config linuxserver/grocy:latest

docker ps --format '{{.Names}} {{.Status}}'
echo "Done. Next: curl http://127.0.0.1:9283/ once so Grocy creates its sqlite db,"
echo "then insert a Grocy API key (see infra/gcp/README.md)."
