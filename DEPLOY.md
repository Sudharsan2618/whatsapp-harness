# Deploying to Google Cloud

## Does Cloud Run work for this app?

Yes — with the right settings. This is not a stateless web app: it holds a **persistent
WhatsApp (Baileys) WebSocket per linked number**, kept in memory in one process
(`ManagerRegistry`). That imposes three requirements on Cloud Run:

| Need | Why | Flag |
|------|-----|------|
| Stay running when idle | The WhatsApp socket must live between HTTP requests | `--min-instances=1` |
| Exactly one instance | Two instances = two sockets for the same number (ban risk, split brain) | `--max-instances=1` |
| CPU always on | Cloud Run throttles CPU to zero between requests by default, which would freeze the socket | `--no-cpu-throttling` |

Auth state is stored in Postgres (not on disk), so a restart reconnects every linked
number automatically — Cloud Run instances being ephemeral is fine.

**This runs Cloud Run as a single always-on container** (similar to a small VM, billed
instance-based). That is correct for one worker serving up to a few dozen numbers. To
scale to hundreds of numbers across many workers later, move to GKE or multiple VMs and
use the per-number lease model already in the code (`claimNumbers`) so each worker owns a
distinct slice. A single Compute Engine `e2-small` VM running the same Docker image is an
equally valid, cheaper alternative if you prefer.

Postgres (Render) and Redis (Upstash) are external managed services reached over the
internet — no Cloud SQL or VPC connector needed.

## Prerequisites

- `gcloud` CLI installed and `gcloud auth login` done.
- A GCP project with billing enabled.
- Your Render Postgres and Upstash Redis URLs, and the model/Firecrawl API keys.

## One-time setup

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## Store secrets in Secret Manager (recommended)

Never bake secrets into the image. Create them once:

```bash
gcloud services enable secretmanager.googleapis.com
printf '%s' 'YOUR_DATABASE_URL'     | gcloud secrets create DATABASE_URL --data-file=-
printf '%s' 'YOUR_REDIS_URL'        | gcloud secrets create REDIS_URL --data-file=-
printf '%s' 'YOUR_OPENROUTER_KEY'   | gcloud secrets create OPENROUTER_API_KEY --data-file=-
printf '%s' 'YOUR_FIRECRAWL_KEY'    | gcloud secrets create FIRECRAWL_API_KEY --data-file=-
# add ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY the same way if used
```

## Deploy

Builds the Dockerfile with Cloud Build and deploys, from the repo root:

```bash
gcloud run deploy whatsapp-harness \
  --source . \
  --region asia-south1 \
  --platform managed \
  --min-instances 1 \
  --max-instances 1 \
  --no-cpu-throttling \
  --memory 1Gi \
  --cpu 1 \
  --timeout 3600 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_SSL=true,WORKER_ID=cloudrun-1,LOG_LEVEL=info \
  --set-secrets DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,OPENROUTER_API_KEY=OPENROUTER_API_KEY:latest,FIRECRAWL_API_KEY=FIRECRAWL_API_KEY:latest
```

Notes:
- `asia-south1` (Mumbai) is the closest region for India; change if you prefer.
- `--allow-unauthenticated` exposes the dashboard publicly. The dashboard has **no auth
  yet** — restrict it (Cloud Run IAM, IAP, or add app login) before using real data.
- The database schema must already exist (run `sql/*.sql` against the DB once). This
  container does not migrate on boot.

## After deploy

Open the service URL Cloud Run prints; the dashboard loads there. Onboard a tenant and
link a number exactly as you do locally.

## Compute Engine VM alternative

```bash
# On an e2-small with Docker installed:
docker build -t whatsapp-harness .
docker run -d --restart unless-stopped -p 80:8080 \
  -e PORT=8080 -e DATABASE_SSL=true -e WORKER_ID=vm-1 \
  -e DATABASE_URL=... -e REDIS_URL=... -e OPENROUTER_API_KEY=... -e FIRECRAWL_API_KEY=... \
  whatsapp-harness
```
