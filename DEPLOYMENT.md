# Deploying LifeCloset to production

Target architecture:

```
Next.js  ──────────────────────────────►  Vercel
Go REST API  ──────────────────────────►  Cloud Run ──► Cloud SQL (Postgres)
                                                     ──► GCS (images)
                                                     ──► Pattern Service (Cloud Run, internal)
GitHub ──► GitHub Actions ──► Test → Build → Deploy (backend + pattern-service)
GitHub ──► Vercel's own Git integration (frontend)
```

Everything below uses **your** GCP project and Vercel account — none of it
can be done from a sandboxed assistant, since it requires billing,
credentials, and account-level access. Budget ~30–45 minutes for the first
end-to-end pass.

The steps are ordered to avoid the CORS chicken-and-egg problem (the API
needs to know the frontend's URL for CORS; the frontend needs the API's
URL): deploy the API first with a placeholder CORS origin, then the
frontend, then go back and tighten CORS.

---

## 0. Prerequisites

- A GCP project with billing enabled ([console.cloud.google.com](https://console.cloud.google.com))
- `gcloud` CLI installed and authenticated (`gcloud init`)
- A GitHub repo containing this project (push it if you haven't:
  `git init && git add -A && git commit -m "initial" && git remote add origin <your-repo> && git push -u origin main`)
- A Vercel account, connected to the same GitHub account

---

## 1. GCP: enable APIs and create core resources

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=us-central1   # pick the region closest to your users

gcloud config set project $PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com
```

### 1a. Cloud SQL (PostgreSQL)

```bash
gcloud sql instances create lifecloset-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=$REGION \
  --no-assign-ip           # no public IP — Cloud Run reaches it over the private Cloud SQL connector

gcloud sql databases create closet --instance=lifecloset-db
gcloud sql users create closet --instance=lifecloset-db --password='CHOOSE_A_STRONG_PASSWORD'
```

`--no-assign-ip` satisfies "do not expose PostgreSQL publicly unnecessarily" —
Cloud Run connects via the Cloud SQL Auth Proxy sidecar that Cloud Run
manages for you when you attach the instance (step 3), not over the public
internet.

The app's own `database.RunMigrations()` (embedded, runs on every backend
boot — see `backend/internal/database/database.go`) applies
`internal/database/migrations/*.sql` automatically. **There is no separate
migration step to run in production** — the first successful deploy is
also the first migration run.

### 1b. GCS bucket for images

```bash
gcloud storage buckets create gs://lifecloset-images-$PROJECT_ID \
  --location=$REGION \
  --uniform-bucket-level-access

# Public read on objects (needed so image URLs work directly in <img> tags)
gcloud storage buckets add-iam-policy-binding gs://lifecloset-images-$PROJECT_ID \
  --member=allUsers --role=roles/storage.objectViewer
```

### 1c. Artifact Registry (Docker images)

```bash
gcloud artifacts repositories create lifecloset \
  --repository-format=docker \
  --location=$REGION
```

### 1d. Service account for Cloud Run (runtime identity)

```bash
gcloud iam service-accounts create lifecloset-run \
  --display-name="LifeCloset Cloud Run runtime"

# Cloud SQL client role (lets Cloud Run's built-in Cloud SQL connector work)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:lifecloset-run@$PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/cloudsql.client

# GCS object admin, scoped to just the one bucket (least privilege)
gcloud storage buckets add-iam-policy-binding gs://lifecloset-images-$PROJECT_ID \
  --member="serviceAccount:lifecloset-run@$PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/storage.objectAdmin
```

This is the identity the Go backend uses via **Application Default
Credentials** — `internal/storage/gcs.go` already calls
`storage.NewClient(ctx)` with no explicit key file, which is exactly the
right shape for this. `GCS_CREDENTIALS_FILE` stays unset in production.

---

## 2. Workload Identity Federation (GitHub Actions → GCP, no JSON keys)

```bash
gcloud iam workload-identity-pools create github-pool \
  --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global --workload-identity-pool=github-pool \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='YOUR_GITHUB_ORG/YOUR_REPO'"

# Service account CI deploys as (separate from the runtime SA above —
# this one only needs to push images and deploy, not touch Cloud SQL/GCS)
gcloud iam service-accounts create lifecloset-deployer \
  --display-name="GitHub Actions deployer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:lifecloset-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/run.admin
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:lifecloset-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/artifactregistry.writer
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:lifecloset-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountUser

gcloud iam service-accounts add-iam-policy-binding \
  lifecloset-deployer@$PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')/locations/global/workloadIdentityPools/github-pool/attribute.repository/YOUR_GITHUB_ORG/YOUR_REPO"
```

Get the provider resource name for the GitHub Actions config:

```bash
gcloud iam workload-identity-pools providers describe github-provider \
  --location=global --workload-identity-pool=github-pool \
  --format="value(name)"
```

In your GitHub repo → **Settings → Secrets and variables → Actions →
Variables**, add:

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | your project ID |
| `GCP_REGION` | e.g. `us-central1` |
| `ARTIFACT_REPO` | `lifecloset` |
| `WIF_PROVIDER` | the `name` output above |
| `WIF_SERVICE_ACCOUNT` | `lifecloset-deployer@<PROJECT_ID>.iam.gserviceaccount.com` |
| `NEXT_PUBLIC_API_URL` | fill in after step 3 (CI build uses it) |

No service-account JSON key is ever created or stored — `.github/workflows/deploy.yml`
authenticates via short-lived OIDC tokens through this pool.

---

## 3. First manual deploy of the backend (establishes the URL + secrets)

The **first** deploy is manual so you can set secrets and env vars once;
after that, `.github/workflows/deploy.yml` redeploys on every push to
`main` using the same service config.

```bash
cd backend

# Generate a real JWT secret — never reuse the .env.example placeholder
export JWT_SECRET=$(openssl rand -base64 48)

gcloud sql instances describe lifecloset-db --format='value(connectionName)'
# → PROJECT_ID:REGION:lifecloset-db — use this as INSTANCE_CONNECTION_NAME below

gcloud run deploy lifecloset-api \
  --source . \
  --region=$REGION \
  --service-account=lifecloset-run@$PROJECT_ID.iam.gserviceaccount.com \
  --add-cloudsql-instances=INSTANCE_CONNECTION_NAME \
  --set-env-vars="DATABASE_URL=postgres://closet:CHOOSE_A_STRONG_PASSWORD@localhost/closet?host=/cloudsql/INSTANCE_CONNECTION_NAME&sslmode=disable" \
  --set-env-vars="STORAGE_PROVIDER=gcs,STORAGE_BUCKET=lifecloset-images-$PROJECT_ID,STORAGE_BASE_URL=https://storage.googleapis.com/lifecloset-images-$PROJECT_ID" \
  --set-env-vars="LOG_LEVEL=info,ALLOWED_ORIGINS=https://placeholder.vercel.app" \
  --set-secrets="JWT_SECRET=lifecloset-jwt-secret:latest" \
  --allow-unauthenticated
```

Notes on the flags above:

- **`DATABASE_URL` over the Unix socket, not a public IP** — Cloud Run's
  Cloud SQL integration mounts the instance at `/cloudsql/<connection
  name>`; `sslmode=disable` is correct *here specifically* because the
  connection never leaves Google's internal network — it's not the same
  as exposing Postgres publicly without TLS. This matches
  `internal/config/config.go`'s existing `DATABASE_URL`-only contract; no
  code change was needed.
- **`JWT_SECRET` via `--set-secrets`, not `--set-env-vars`** — first store
  it in Secret Manager: `echo -n "$JWT_SECRET" | gcloud secrets create
  lifecloset-jwt-secret --data-file=-`, then grant the runtime SA access:
  `gcloud secrets add-iam-policy-binding lifecloset-jwt-secret
  --member="serviceAccount:lifecloset-run@$PROJECT_ID.iam.gserviceaccount.com"
  --role=roles/secretmanager.secretAccessor`. This keeps the real secret
  out of Cloud Run's env-var list (visible in the console/API) entirely.
- **`ALLOWED_ORIGINS` is a placeholder for now** — you'll update this in
  step 5 once the real Vercel URL exists. `internal/middleware/cors.go`
  reads it as a plain string list, comma-separated for more than one
  origin.

Grab the deployed URL:

```bash
gcloud run services describe lifecloset-api --region=$REGION --format='value(status.url)'
```

Verify it's actually up before moving on:

```bash
curl https://YOUR-API-URL/health   # expect {"success":true,...,"status":"ok"}
curl https://YOUR-API-URL/ready    # expect 200 + database:connected
```

---

## 4. Deploy the pattern service

```bash
cd ../pattern-service

gcloud run deploy lifecloset-pattern-service \
  --source . \
  --region=$REGION \
  --no-allow-unauthenticated   # internal only — the brief's "not unnecessarily exposed publicly"
```

Grant the API's runtime service account permission to invoke it:

```bash
gcloud run services add-iam-policy-binding lifecloset-pattern-service \
  --region=$REGION \
  --member="serviceAccount:lifecloset-run@$PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/run.invoker
```

Point the API at it:

```bash
gcloud run services update lifecloset-api --region=$REGION \
  --set-env-vars="PATTERN_SERVICE_URL=$(gcloud run services describe lifecloset-pattern-service --region=$REGION --format='value(status.url)'),PATTERN_SERVICE_USE_ID_TOKEN=true"
```

`PATTERN_SERVICE_USE_ID_TOKEN=true` makes `internal/patternproxy` sign
every outbound request with a Google ID token scoped to
`PATTERN_SERVICE_URL`, using the same Application Default Credentials
(`lifecloset-run`'s identity) already relied on for GCS — no extra
credential setup. This matches the `--no-allow-unauthenticated` deploy
above; if you ever deploy the pattern service with
`--allow-unauthenticated` instead, leave this unset (defaults to `false`).

---

## 5. Deploy the frontend to Vercel

1. [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo.
2. Framework preset: Vercel auto-detects Next.js.
3. **Root Directory**: leave as the repo root (the Next.js app lives at
   the top level, not in a subfolder — `backend/` and `pattern-service/`
   are separate deploy targets Vercel never touches).
4. Add environment variable:
   - `NEXT_PUBLIC_API_URL` = `https://YOUR-API-URL/api/v1` (from step 3 — include the `/api/v1` suffix, matching `lib/api/client.js`'s expectation)
5. Deploy. Note the resulting `https://your-project.vercel.app` URL (or your custom domain, once attached).

---

## 6. Close the loop: lock down CORS

```bash
gcloud run services update lifecloset-api --region=$REGION \
  --set-env-vars="ALLOWED_ORIGINS=https://your-project.vercel.app"
```

If you later attach a custom domain in Vercel, add it here too
(comma-separated — `splitCSV` in `internal/config/config.go` already
supports multiple origins).

---

## 7. Wire up GitHub Actions for ongoing deploys

With the repo variables from step 2 in place, every push to `main` now:

1. Runs `ci.yml` (frontend tests/lint/build, backend tests/build, pattern-service tests)
2. Runs `deploy.yml`, which re-runs those same checks, then builds+pushes
   Docker images and updates both Cloud Run services with the new image

The Vercel deploy isn't in GitHub Actions at all — Vercel's own GitHub
App deploys on every push once step 5 is set up, including preview
deployments for every PR automatically.

**Pull requests** get `ci.yml` only (tests/lint/build) — nothing deploys
until merged to `main`.

---

## 8. Post-deploy checklist

Run through this by hand once, and after any Cloud Run config change:

- [ ] `GET /health` → `{"status":"ok"}`
- [ ] `GET /ready` → `database: connected`
- [ ] Sign up a real account on the live frontend
- [ ] Log in, create a wardrobe item with an image, confirm it appears in GCS (`gcloud storage ls gs://lifecloset-images-$PROJECT_ID`)
- [ ] Save an outfit, refresh the page, log back in, confirm it's still there
- [ ] Try a request with an expired/invalid token → expect 401, not a 500 or a stack trace
- [ ] Try to access another (test) user's item by ID → expect 403/404, never their data
- [ ] Upload an oversized image → expect a clean `ERR_FILE_TOO_LARGE`, not a crash
- [ ] Confirm the browser's Network tab shows no `Access-Control-Allow-Origin: *` on the API (should be the exact Vercel origin)

---

## Rollback

Cloud Run keeps every revision. To roll back instantly without a redeploy:

```bash
gcloud run services update-traffic lifecloset-api --region=$REGION \
  --to-revisions=PREVIOUS_REVISION_NAME=100
```

Vercel: **Deployments** tab → pick a previous deployment → **Promote to Production**.
