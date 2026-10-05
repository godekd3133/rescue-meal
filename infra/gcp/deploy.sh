#!/usr/bin/env sh
# Rescue Meal GCP deployment — ~$0/month footprint.
#
# Architecture:
#   e2-micro VM (always-free tier, us-west1) runs Postgres 16 + Grocy containers
#   Cloud Run (us-west1) runs API + OCR, scale-to-zero, direct VPC egress to the
#   VM's internal IP — Postgres is never exposed publicly.
#   Cloud Scheduler -> Cloud Run jobs drive the three optional workers.
#
# Prerequisites:
#   gcloud auth login && gcloud auth application-default login
#
# Required env:
#   GCP_PROJECT_ID           target project
# Optional env:
#   GCP_REGION               default us-west1 (always-free e2-micro region)
#   GCP_ZONE                 default ${REGION}-a
#   GCP_VM_NAME              default rescue-meal-vm
#   GCP_AR_REPO              default rescue-meal (images kept in asia-northeast3)
#   GCP_AR_LOCATION          default asia-northeast3
#
# Steps are idempotent; re-running skips existing resources.
set -eu

REGION=${GCP_REGION:-us-west1}
ZONE=${GCP_ZONE:-${REGION}-a}
VM_NAME=${GCP_VM_NAME:-rescue-meal-vm}
AR_LOCATION=${GCP_AR_LOCATION:-asia-northeast3}
AR_REPO=${GCP_AR_REPO:-rescue-meal}
AR_HOST="${AR_LOCATION}-docker.pkg.dev"
DB_NAME=rescue_meal
DB_USER=rescue_meal

usage() {
  cat <<'EOF'
Usage: sh infra/gcp/deploy.sh <step|all>

Steps:
  enable-apis   Enable compute/run/artifactregistry/secretmanager/cloudbuild/scheduler
  secrets       Create Secret Manager secrets (db/auth/ocr/observability/vapid/worker tokens)
  db            Create e2-micro VM + Postgres (SSL, scram-sha-256, hostssl-only) + Grocy
  migrate       Temporarily allow caller IP on tcp/5432, run migrations, close again
  images        Build API + OCR images in Cloud Build, push to Artifact Registry
  ocr           Deploy OCR worker Cloud Run service (4GiB, scale-to-zero)
  api           Deploy API Cloud Run service (VPC egress -> VM internal IP)
  workers       Deploy notification/grocy/product-enrichment jobs + schedulers
  smoke         /health, /ready and guest-auth smoke against the API URL
  all           All of the above in order
EOF
}

require_project() {
  : "${GCP_PROJECT_ID:?set GCP_PROJECT_ID}"
}

project_number() {
  gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)'
}

compute_sa() {
  echo "$(project_number)-compute@developer.gserviceaccount.com"
}

vm_ip() {
  gcloud compute instances describe "$VM_NAME" --project "$GCP_PROJECT_ID" --zone "$ZONE" \
    --format='value(networkInterfaces[0].networkIP)'
}

secret_create() {
  name=$1
  gcloud secrets describe "$name" --project "$GCP_PROJECT_ID" >/dev/null 2>&1 \
    || openssl rand -hex 24 | gcloud secrets create "$name" --project "$GCP_PROJECT_ID" \
      --data-file=- --replication-policy=automatic
  gcloud secrets add-iam-policy-binding "$name" --project "$GCP_PROJECT_ID" \
    --member="serviceAccount:$(compute_sa)" --role="roles/secretmanager.secretAccessor" --quiet >/dev/null
}

enable_apis() {
  gcloud services enable --project "$GCP_PROJECT_ID" \
    compute.googleapis.com run.googleapis.com \
    artifactregistry.googleapis.com secretmanager.googleapis.com \
    cloudbuild.googleapis.com cloudscheduler.googleapis.com
}

secrets() {
  secret_create rescue-meal-db-password
  secret_create rescue-meal-auth-secret
  secret_create rescue-meal-ocr-token
  secret_create rescue-meal-observability-token
  secret_create rescue-meal-notification-token
  secret_create rescue-meal-grocy-worker-token
  secret_create rescue-meal-product-worker-token
  secret_create rescue-meal-grocy-api-key
  # VAPID private key is generated outside gcloud (PEM); see README.
  gcloud secrets describe rescue-meal-vapid-private-key --project "$GCP_PROJECT_ID" >/dev/null 2>&1 \
    || echo "NOTE: create rescue-meal-vapid-private-key from a generated VAPID PEM" >&2
}

db() {
  gcloud compute instances describe "$VM_NAME" --project "$GCP_PROJECT_ID" --zone "$ZONE" >/dev/null 2>&1 \
    || gcloud compute instances create "$VM_NAME" --project "$GCP_PROJECT_ID" --zone "$ZONE" \
      --machine-type=e2-micro --image-family=cos-stable --image-project=cos-cloud \
      --boot-disk-size=30GB --boot-disk-type=pd-standard --boot-disk-auto-delete \
      --tags=rescue-meal-vm --scopes=cloud-platform
  # Grocy web UI needs public access for the app owner; Postgres stays VPC-internal.
  gcloud compute firewall-rules describe rescue-meal-grocy --project "$GCP_PROJECT_ID" >/dev/null 2>&1 \
    || gcloud compute firewall-rules create rescue-meal-grocy --project "$GCP_PROJECT_ID" \
      --direction=INGRESS --action=ALLOW --rules=tcp:9283 \
      --source-ranges=0.0.0.0/0 --target-tags=rescue-meal-vm
  echo "VM ${VM_NAME} (${ZONE}) internal IP: $(vm_ip)"
  echo "First-time container setup lives in infra/gcp/vm-setup.sh — run:"
  echo "  gcloud compute scp infra/gcp/vm-setup.sh ${VM_NAME}:/tmp/ && \\"
  echo "  gcloud compute ssh ${VM_NAME} --zone ${ZONE} --command='bash /tmp/vm-setup.sh'"
}

migrate() {
  MY_IP=$(curl -fsS https://ifconfig.me)
  EXT_IP=$(gcloud compute instances describe "$VM_NAME" --project "$GCP_PROJECT_ID" --zone "$ZONE" \
    --format='value(networkInterfaces[0].accessConfigs[0].natIP)')
  DB_PASS=$(gcloud secrets versions access latest --secret=rescue-meal-db-password --project "$GCP_PROJECT_ID")
  gcloud compute firewall-rules create rescue-meal-pg-migrate --project "$GCP_PROJECT_ID" \
    --direction=INGRESS --action=ALLOW --rules=tcp:5432 \
    --source-ranges="${MY_IP}/32" --target-tags=rescue-meal-vm --quiet >/dev/null 2>&1 || true
  trap 'gcloud compute firewall-rules delete rescue-meal-pg-migrate --project "$GCP_PROJECT_ID" --quiet >/dev/null 2>&1 || true' EXIT
  sleep 5
  RESCUE_MEAL_DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${EXT_IP}:5432/${DB_NAME}?sslmode=require" \
    sh infra/postgres/migrate.sh --apply
  gcloud compute firewall-rules delete rescue-meal-pg-migrate --project "$GCP_PROJECT_ID" --quiet >/dev/null 2>&1 || true
  trap - EXIT
}

images() {
  gcloud artifacts repositories describe "$AR_REPO" --location "$AR_LOCATION" --project "$GCP_PROJECT_ID" >/dev/null 2>&1 \
    || gcloud artifacts repositories create "$AR_REPO" --project "$GCP_PROJECT_ID" \
      --location "$AR_LOCATION" --repository-format docker
  gcloud builds submit --project "$GCP_PROJECT_ID" --region "$AR_LOCATION" \
    --config infra/gcp/cloudbuild-images.yaml \
    --substitutions "_AR_HOST=$AR_HOST,_AR_REPO=$AR_REPO"
}

ocr() {
  gcloud run deploy rescue-meal-ocr --project "$GCP_PROJECT_ID" --region "$REGION" \
    --image "$AR_HOST/$GCP_PROJECT_ID/$AR_REPO/ocr-worker:latest" \
    --allow-unauthenticated --port 8002 \
    --memory 4Gi --cpu 2 --concurrency 1 --max-instances 2 --min-instances 0 \
    --timeout 300 \
    --set-env-vars "PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True,RESCUE_MEAL_OCR_MAX_CONCURRENCY=1" \
    --set-secrets "RESCUE_MEAL_OCR_TOKEN=rescue-meal-ocr-token:latest"
}

api() {
  OCR_URL=$(gcloud run services describe rescue-meal-ocr --project "$GCP_PROJECT_ID" --region "$REGION" --format='value(status.url)')
  API_URL="https://rescue-meal-api-$(project_number).${REGION}.run.app"
  gcloud run deploy rescue-meal-api --project "$GCP_PROJECT_ID" --region "$REGION" \
    --image "$AR_HOST/$GCP_PROJECT_ID/$AR_REPO/api:latest" \
    --allow-unauthenticated --port 8000 \
    --memory 1Gi --cpu 1 --concurrency 40 --max-instances 3 --min-instances 0 \
    --timeout 120 \
    --network default --subnet default --vpc-egress all-traffic \
    --set-env-vars "RESCUE_MEAL_ENVIRONMENT=production,RESCUE_MEAL_INVENTORY_MODE=normalized,RESCUE_MEAL_DATABASE_URL=postgresql://${DB_USER}@$(vm_ip):5432/${DB_NAME}?sslmode=require,RESCUE_MEAL_OCR_URL=${OCR_URL},RESCUE_MEAL_AUTH_REQUIRED=true,RESCUE_MEAL_AUTH_RATE_LIMIT_ENABLED=true,RESCUE_MEAL_POSTGRES_PROCESS_COUNT=1,RESCUE_MEAL_POSTGRES_MAX_CONNECTIONS=50,RESCUE_MEAL_POSTGRES_RESERVED_CONNECTIONS=10,RESCUE_MEAL_CORS_ORIGINS=${RESCUE_MEAL_CORS_ORIGINS:-https://localhost},RESCUE_MEAL_PASSWORD_RESET_BASE_URL=${API_URL},RESCUE_MEAL_EMAIL_PROVIDER_URL=${API_URL},RESCUE_MEAL_INFERENCE_PROVIDER=rules,RESCUE_MEAL_VAPID_SUBJECT=${RESCUE_MEAL_VAPID_SUBJECT:-mailto:admin@example.com},GROCY_BASE_URL=http://$(vm_ip):9283" \
    --set-secrets "RESCUE_MEAL_AUTH_SECRET=rescue-meal-auth-secret:latest,RESCUE_MEAL_OCR_TOKEN=rescue-meal-ocr-token:latest,PGPASSWORD=rescue-meal-db-password:latest,RESCUE_MEAL_OBSERVABILITY_TOKEN=rescue-meal-observability-token:latest,RESCUE_MEAL_VAPID_PRIVATE_KEY=rescue-meal-vapid-private-key:latest,RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN=rescue-meal-notification-token:latest,GROCY_API_KEY=rescue-meal-grocy-api-key:latest,RESCUE_MEAL_GROCY_WORKER_TOKEN=rescue-meal-grocy-worker-token:latest,RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKER_TOKEN=rescue-meal-product-worker-token:latest"
}

worker_job() {
  name=$1; script=$2; workspace_env=$3; token_secret=$4
  API_URL=$(gcloud run services describe rescue-meal-api --project "$GCP_PROJECT_ID" --region "$REGION" --format='value(status.url)')
  gcloud run jobs describe "$name" --project "$GCP_PROJECT_ID" --region "$REGION" >/dev/null 2>&1 \
    || gcloud run jobs create "$name" --project "$GCP_PROJECT_ID" --region "$REGION" \
      --image "$AR_HOST/$GCP_PROJECT_ID/$AR_REPO/api:latest" \
      --command "/app/.venv/bin/python" --args "${script},--once" \
      --memory 512Mi --cpu 1 --task-timeout 300 --max-retries 1 \
      --set-env-vars "RESCUE_MEAL_API_BASE_URL=${API_URL},${workspace_env}=demo" \
      --set-secrets "${token_secret}"
  gcloud run jobs add-iam-policy-binding "$name" --project "$GCP_PROJECT_ID" --region "$REGION" \
    --member="serviceAccount:$(compute_sa)" --role="roles/run.invoker" --quiet >/dev/null
}

worker_cron() {
  name=$1; sched=$2; cron=$3
  gcloud scheduler jobs describe "$sched" --project "$GCP_PROJECT_ID" --location "$REGION" >/dev/null 2>&1 \
    || gcloud scheduler jobs create http "$sched" --project "$GCP_PROJECT_ID" --location "$REGION" \
      --schedule="$cron" --time-zone="Etc/UTC" \
      --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${GCP_PROJECT_ID}/jobs/${name}:run" \
      --http-method=POST --oauth-service-account-email="$(compute_sa)"
}

workers() {
  worker_job rescue-meal-notification-worker scripts/run_notification_worker.py \
    RESCUE_MEAL_NOTIFICATION_WORKSPACE_IDS \
    "RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN=rescue-meal-notification-token:latest"
  worker_cron rescue-meal-notification-worker rescue-meal-notify-tick "*/5 * * * *"

  worker_job rescue-meal-grocy-worker scripts/run_grocy_worker.py \
    RESCUE_MEAL_GROCY_WORKSPACE_IDS \
    "RESCUE_MEAL_GROCY_WORKER_TOKEN=rescue-meal-grocy-worker-token:latest"
  worker_cron rescue-meal-grocy-worker rescue-meal-grocy-tick "*/10 * * * *"

  # Requires MFDS_API_KEY + real OFF user-agent; ticks are no-ops until enabled.
  worker_job rescue-meal-product-enrichment-worker scripts/run_product_enrichment_worker.py \
    RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKSPACE_IDS \
    "RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKER_TOKEN=rescue-meal-product-worker-token:latest"
  worker_cron rescue-meal-product-enrichment-worker rescue-meal-product-enrichment-tick "*/10 * * * *"
}

smoke() {
  API_URL=$(gcloud run services describe rescue-meal-api --project "$GCP_PROJECT_ID" --region "$REGION" --format='value(status.url)')
  echo "API: $API_URL"
  curl -fsS "$API_URL/health" && echo
  curl -fsS "$API_URL/ready" && echo
}

cmd=${1:-}
case "$cmd" in
  enable-apis) require_project; enable_apis ;;
  secrets)     require_project; secrets ;;
  db)          require_project; db ;;
  migrate)     require_project; migrate ;;
  images)      require_project; images ;;
  ocr)         require_project; ocr ;;
  api)         require_project; api ;;
  workers)     require_project; workers ;;
  smoke)       require_project; smoke ;;
  all)         require_project; enable_apis; secrets; db; migrate; images; ocr; api; workers; smoke ;;
  -h|--help|help|'') usage ;;
  *) echo "Unknown step: $cmd" >&2; usage >&2; exit 2 ;;
esac
