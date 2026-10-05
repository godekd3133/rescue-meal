# GCP deployment (Cloud Run + e2-micro VM)

The production-shaped deployment lives on GCP in project
`rescue-meal-godekd3133` (region `us-west1`, Oregon — chosen for the
always-free e2-micro tier and Cloud Run free tier).

## Live services

| Service | URL / host | Notes |
| --- | --- | --- |
| API | https://rescue-meal-api-1066866003837.us-west1.run.app | Cloud Run, scale-to-zero, 1GiB |
| OCR worker | https://rescue-meal-ocr-1066866003837.us-west1.run.app | Cloud Run, 4GiB, concurrency 1 |
| PostgreSQL 16 | `rescue-meal-vm` e2-micro (`us-west1-a`), internal `10.138.0.2:5432` | docker `pgvector/pgvector:pg16`, hostssl+scram only |
| Grocy | http://136.109.78.239:9283 (public) / `http://10.138.0.2:9283` (API) | docker `linuxserver/grocy` on the same VM |

Cloud Run reaches Postgres and Grocy via **direct VPC egress**
(`--network default --vpc-egress all-traffic`) to the VM's internal IP — no
VPC connector (those cost ~$15/month) and no public Postgres port. Only
`tcp:9283` (Grocy UI) is exposed publicly; Postgres's 5432 firewall rule is
opened briefly for migrations then deleted.

Frontend builds use `VITE_DEPLOYMENT_MODE=production` and
`VITE_API_BASE_URL=https://rescue-meal-api-1066866003837.us-west1.run.app`.
Capacitor iOS must use `iosScheme: https` because production CORS only
allows HTTPS origins.

## Secrets

All runtime secrets live in Secret Manager, injected via `--set-secrets`:
`rescue-meal-db-password` (as `PGPASSWORD`), `rescue-meal-auth-secret`,
`rescue-meal-ocr-token`, `rescue-meal-observability-token`,
`rescue-meal-vapid-private-key`, `rescue-meal-notification-token`,
`rescue-meal-grocy-worker-token`, `rescue-meal-product-worker-token`,
`rescue-meal-grocy-api-key`.

The OCR worker requires `Authorization: Bearer <rescue-meal-ocr-token>` on
`POST /ocr`; `/health` and `/ready` remain public for probes.

## Deploy

```bash
export GCP_PROJECT_ID=rescue-meal-godekd3133
sh infra/gcp/deploy.sh images   # Cloud Build → Artifact Registry
sh infra/gcp/deploy.sh ocr      # redeploy OCR service
sh infra/gcp/deploy.sh api      # redeploy API service
sh infra/gcp/deploy.sh workers  # three scheduled Cloud Run jobs
sh infra/gcp/deploy.sh smoke    # /health + /ready
```

`deploy.sh` is idempotent and can run `enable-apis`, `secrets`, `db`,
`migrate`, or `all` for a fresh project. `db` prints the VM bootstrap
instructions — `infra/gcp/vm-setup.sh` runs Postgres (SSL+scram,
hostssl-only pg_hba) and Grocy on the VM. `migrate` opens tcp/5432 to the
caller's IP, applies `infra/postgres/migrate.sh --apply`, then removes the
rule.

## Workers

Cloud Scheduler → Cloud Run jobs, each running the API image with `--once`:

| Job | Schedule | Tick target | Status |
| --- | --- | --- | --- |
| `rescue-meal-notification-worker` | `*/5 * * * *` | Web Push delivery per workspace | live |
| `rescue-meal-grocy-worker` | `*/10 * * * *` | Grocy sync reconciliation | live (`grocy_configured: true`) |
| `rescue-meal-product-enrichment-worker` | `*/10 * * * *` | external product lookups | infra ready — needs `MFDS_API_KEY` |

Each job ticks the workspaces in its `RESCUE_MEAL_*_WORKSPACE_IDS` env
(currently `demo`). To enable a real workspace, copy `workspace_id` from
`GET /api/auth/me` after registering in the app and update the job env:

```bash
gcloud run jobs update rescue-meal-notification-worker \
  --project rescue-meal-godekd3133 --region us-west1 \
  --update-env-vars "RESCUE_MEAL_NOTIFICATION_WORKSPACE_IDS=<workspace-id>"
```

Web Push needs the matching public key in the frontend build:
`VITE_WEB_PUSH_VAPID_PUBLIC_KEY` (public half of the
`rescue-meal-vapid-private-key` secret).

### Grocy

A Grocy 4.7.1 instance runs on the VM (`docker container grocy`,
linuxserver image, sqlite at `/config/data/grocy.db`). The API key was
inserted directly into `api_keys` (`expires` must be a future datetime or
Grocy rejects the key — `IsValidApiKey` requires `expires > now`). To add
or rotate a key:

```bash
gcloud compute ssh rescue-meal-vm --zone us-west1-a
docker exec grocy php -r '$db=new PDO("sqlite:/config/data/grocy.db");
$db->exec("INSERT INTO api_keys (api_key,user_id,expires) VALUES
(\"<new-key>\",1,\"2099-12-31 00:00:00\")");'
```

Grocy admin UI: `http://136.109.78.239:9283` (user `admin`, set its
password on first login).

### Product enrichment

`RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS=true` requires `MFDS_API_KEY`
(식품안전나라 open API key — needs an account at
openapi.foodsafetykorea.go.kr) and a real `RESCUE_MEAL_OPEN_FOOD_FACTS_USER_AGENT`
contact. Until the key exists, the worker job runs but the API returns
skipped ticks. To activate:

```bash
gcloud secrets create mfds-api-key --data-file=-   # paste key
gcloud run services update rescue-meal-api --region us-west1 \
  --update-env-vars "RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS=true,RESCUE_MEAL_OPEN_FOOD_FACTS_USER_AGENT=RescueMeal/1.0 (contact: godekd3133@gmail.com)" \
  --update-secrets "MFDS_API_KEY=mfds-api-key:latest"
```

## Cost notes (~$0–1/month)

- e2-micro + 30GB standard PD + VM in `us-west1` = GCP always-free tier.
  Postgres is the only stateful piece; it's a plain container on the boot
  disk (no Cloud SQL). Take dumps with `infra/postgres/backup.sh` through a
  temporary firewall rule or `gcloud compute ssh`.
- Cloud Run/Cloud Build/Scheduler/Artifact Registry stay in free tiers at
  personal volumes. Cloud Scheduler free quota is 3 jobs/month — exactly
  the three workers.
- OCR model load adds a ~1–2 min cold start after scale-to-zero.
- Watch: the always-free e2-micro quota is one VM per billing account; if
  another project already uses it, this VM bills ~$7/month.

## iOS / TestFlight

The Capacitor wrapper lives in `work/ios-wrapper/` (gitignored):

- `capacitor.config.ts`: `appId com.godekd3133.rescuemeal`,
  `webDir ../../apps/web/dist/client`, `server.iosScheme https`,
  `ios.minVersion 15.0`.
- Podfile pins `platform :ios, '15.0'` and forces every pod target to 15.0
  (Xcode 27 rejects <15.0; Capacitor 7 podspecs still say 14.0).
- pbxproj: `DEVELOPMENT_TEAM A23ZPKGMW9`, `CURRENT_PROJECT_VERSION 7`,
  `IPHONEOS_DEPLOYMENT_TARGET 15.0`.

Build the web bundle first (`VITE_APP_SHELL=native`, production mode, real
`VITE_API_BASE_URL`), then:

```bash
cd work/ios-wrapper && npm_config_cache=/tmp/npm-cache npx cap sync ios
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/RescueMeal.xcarchive \
  -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath build/RescueMeal.xcarchive \
  -exportPath build/export -exportOptionsPlist export-options.plist \
  -allowProvisioningUpdates   # destination=upload pushes to App Store Connect
```

`1.0 (6)` (Seoul API) and `1.0 (7)` (us-west1 API) were uploaded to
TestFlight on 2026-09-30. Always build via `App.xcworkspace` (the Pods) —
`App.xcodeproj` alone cannot resolve the `Capacitor` module.

## Hardening follow-ups

- Password reset email delivery is configured with placeholder HTTPS URLs
  to satisfy production preflight; a real provider is not wired up.
- Postgres backups are manual (`infra/postgres/backup.sh` via ssh) —
  consider a nightly `pg_dump` cron on the VM to a GCS bucket.
- OCR cold starts re-download PaddleX models; bake the model cache into
  the image if cold-start latency becomes painful.
- Seoul→Oregon latency is ~150 ms per API request; if that feels slow,
  Neon free Postgres (Singapore) + Seoul-region Cloud Run is the paid-tier
  alternative that stays near $0 — restore a dump, flip
  `RESCUE_MEAL_DATABASE_URL`, redeploy.
