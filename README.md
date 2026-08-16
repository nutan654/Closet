# 🚪 LifeCloset

A virtual wardrobe and dressing-doll app — dress up a chibi SVG doll with your
own real clothes, tint fabric patterns from photos, save outfits, and track
what you actually wear. Full-stack, three languages, one repo.

```
Next.js (React, SVG doll, live pattern editing)
      │
      ▼
Go REST API  ──────────►  PostgreSQL (auth, items, outfits, wear history)
      │                ──►  Image storage (local disk by default)
      │
      ▼
Python / FastAPI pattern-service (Pillow + numpy: seamless tiling, palette extraction)
```

> **Runs for $0.** The default deployment path — Vercel + Render's free tier
> + Neon's free Postgres — needs no credit card anywhere. See
> [Deployment](#deployment) and [`DEPLOYMENT_RENDER.md`](./DEPLOYMENT_RENDER.md).

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Try it without a backend (demo mode)](#try-it-without-a-backend-demo-mode)
- [Environment variables](#environment-variables)
- [Testing](#testing)
- [API overview](#api-overview)
- [Deployment](#deployment)
- [CI/CD](#cicd)
- [Known limitations / roadmap](#known-limitations--roadmap)

---

## What it does

**The door.** You're greeted by a hand-drawn wooden door (`components/DoorGate.jsx`)
— knock three times, it swings open into a real login/signup form backed by
the Go API (JWT auth, bcrypt-hashed passwords in Postgres). No more "type any
name" — this is real per-account state, backed by a real database.

**The doll.** A 150×210 SVG chibi doll (`components/doll/`) renders whatever
you've equipped, layered correctly — hair behind the body, clothes over the
body, outerwear over clothes, face and front hair on top:

```
HAIR_BACK → BODY → TOP → BOTTOM → DRESS → OUTERWEAR → ACCESSORIES → FACE → HAIR_FRONT
```

Every garment category (`tops`/`bottoms`/`dresses`/`outerwear`) has multiple
distinct silhouettes (a T-Shirt does not look like a Shirt does not look like
a Top), and every silhouette responds to a `fit` (Regular/Oversized/Fitted/
Cropped/...) via a scale transform around a per-category anchor point.

**The fabric.** Upload a photo of real fabric and the Python pattern-service
turns it into a seamlessly-tiling texture (numpy offset-and-blend, no ML) plus
a 5-color palette (Pillow median-cut quantization) — then the doll wears it,
clipped exactly to the garment's own silhouette via an SVG `<pattern>` fill,
with an optional color tint blended on top (`mix-blend-mode: multiply`).

**The wardrobe.** A trading-card-styled grid (`ItemCard.jsx` — classic/holo/
gold/sage border treatments) with a Tinder-style swipe stack (Framer Motion
drag: right to wear, left to skip) as an alternate view. A real HSL color
picker, not just preset swatches.

**The vanity.** Same wardrobe UI, but for makeup/hair/accessories, with a
face-only close-up view in a lit mirror frame — equip a lipstick or blush and
the doll's face tints live.

**Bear.** An AI styling companion (`app/companion/page.js`, backed by Google
Gemini) that answers with actual context: how many clothing items vs.
cosmetics you own, today's weather at your location (via Open-Meteo — no key
needed), and which cosmetics are approaching their expiry date. Optional —
the app works fully without a Gemini key, Bear's chat just stays off.

**Everything persists.** Every mutation — adding an item, equipping an
outfit, logging a wear — goes through the real backend and Postgres. Refresh
the browser, log back in, it's all still there.

---

## Architecture

```
app/, components/, lib/          Next.js 14 (App Router), plain JS, Tailwind, Framer Motion
      │  NEXT_PUBLIC_API_URL (client-side, no server rendering of API data)
      ▼
backend/                         Go 1.22 + Gin, mounted at /api/v1
      │
      ├──► PostgreSQL            users, items, outfits, wear history — see
      │                          backend/internal/database/migrations/
      │
      ├──► Storage abstraction   one interface, three interchangeable
      │                          implementations (internal/storage/):
      │                          local disk (default, zero setup), or
      │                          S3-compatible / GCS if you want images to
      │                          survive restarts on a free host — swapped
      │                          by a single STORAGE_PROVIDER env var
      │
      └──► pattern-service/      Python 3.12 + FastAPI + Pillow + numpy,
                                  stateless, one endpoint: POST /process,
                                  optionally gated by an X-API-Key header
```

Three languages, each doing the job it's actually good at: Go stays the
system of record (auth, Postgres, validation, the existing image pipeline);
Python owns exactly one thing (turning a fabric photo into a tiling texture
+ palette) where Pillow/numpy are a genuinely better fit than reimplementing
that in Go or JS; React/SVG owns the doll and live pattern editing entirely
client-side, so dragging a scale/rotation slider needs no round trip.

**Default deployment target (free, no card): Vercel** (frontend) +
**Render's free web services** (API + pattern service) + **Neon** (free
Postgres) — see [`DEPLOYMENT_RENDER.md`](./DEPLOYMENT_RENDER.md). Every
service in this path was picked specifically because it has a real, useful
free tier that doesn't ask for billing details up front.

A second path — **Cloud Run + Cloud SQL + GCS** — is documented in
[`DEPLOYMENT.md`](./DEPLOYMENT.md) for later, if this ever needs to scale
past what a free tier comfortably handles. Nothing in the codebase is
locked to either host: `STORAGE_PROVIDER` and a handful of env vars are the
only things that change between them.

---

## Project structure

```
.
├── app/                   Next.js App Router pages: /, /wardrobe, /vanity,
│                          /collections, /journal, /companion
├── components/
│   ├── doll/              GarmentRenderer, garment silhouettes, layer order,
│   │                      pattern math, Face/Hair/Body — see below
│   ├── DoorGate.jsx       Entry screen: knock animation → login/signup form
│   ├── ItemCard.jsx       Trading-card-styled item display
│   ├── SwipeStack.jsx     Tinder-style swipe-to-wear card stack
│   └── GarmentPreview.jsx Renders the same silhouette as the doll, cropped
│                          for a card thumbnail — literally the same
│                          component the doll uses, so they can't diverge
├── lib/
│   ├── AuthContext.jsx    Login/signup/session state, wraps lib/api/auth.js
│   ├── StoreContext.jsx   Global app state — server-backed, not localStorage
│   ├── api/               One module per backend route group (client.js,
│   │                      auth.js, items.js, outfits.js, user.js)
│   └── doll/
│       ├── garmentShapes.js   category+subtype → SVG path registry
│       ├── layers.js          single source of truth for doll paint order
│       └── pattern.js         pure math: pattern scale/offset/rotation/tint
├── backend/                Go REST API — see backend/README.md for full
│   │                       endpoint reference and its own architecture notes
│   ├── cmd/api/            entrypoint
│   └── internal/           config, database, dto, handlers, middleware,
│                          models, patternproxy, repository, routes,
│                          service, storage, upload, validator, weather
├── pattern-service/        Python/FastAPI microservice (Pillow + numpy)
├── render.yaml              Render Blueprint — free-tier API + pattern service
├── DEPLOYMENT_RENDER.md     $0 deployment walkthrough (Vercel + Render + Neon)
└── DEPLOYMENT.md            Optional GCP walkthrough, for scaling up later
```

---

## Getting started

Three services run independently in local dev.

```bash
# 1. Backend + Postgres + pattern-service (from backend/)
cd backend
docker compose up   # Postgres on :5432, API on :8080, pattern-service on :8000

# 2. Frontend (from repo root, in a separate terminal)
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
npm install
npm run dev
```

Then open http://localhost:3000 — you'll land on the door. Knock, sign up
with an email/password, and you're in.

Running the backend without Docker: `cd backend`, copy `.env.example` to
`.env`, point `DATABASE_URL` at a local Postgres, then `go mod tidy && go run
./cmd/api`. Full detail in `backend/README.md`.

---

## Try it without a backend (demo mode)

Deployed the frontend to Vercel but the backend isn't live yet? Sign in with:

```
Email:    demo@lifecloset.app
Password: demo1234
```

or just tap **"Just want to look around? Try the demo"** under the sign-in
form (`components/DoorGate.jsx`) — no typing required. This works even if
`NEXT_PUBLIC_API_URL` is completely unset.

**How it works**: `lib/AuthContext.jsx` recognizes these exact credentials
and logs in synchronously, no network call. `lib/StoreContext.jsx` then
checks `user.isDemo` on every read/write and, instead of calling the Go
API, mirrors the change into local React state — starting from the same
seed wardrobe (`seedData()`/`mkItem()` in `lib/model.js`) this app used
before the backend existed. Every feature works — add items, dress the
doll, apply fabric patterns, equip outfits — it's just **not saved
anywhere**: refreshing the page or closing the tab resets it back to the
seed wardrobe. Real accounts (anything other than the demo credentials)
always go through the real backend and Postgres, unchanged.

If you're seeing `NEXT_PUBLIC_API_URL is not set` on your own Vercel
deployment and want *real accounts* to work too (not just the demo), that
env var needs to be set in Vercel: **Project → Settings → Environment
Variables** → add `NEXT_PUBLIC_API_URL` pointing at your deployed backend
→ redeploy. See [Environment variables](#environment-variables) below.

---

## Environment variables

**Frontend** (`.env.local`, see `.env.example`):

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Backend base URL **including** `/api/v1`. Public by design (ships in client JS) — never put secrets in a `NEXT_PUBLIC_*` variable. |

**Backend** (`backend/.env`, see `backend/.env.example` for the full list
with defaults):

| Variable | Local dev | Free deployment (Render + Neon) |
|---|---|---|
| `DATABASE_URL` | local Postgres | Neon connection string (`?sslmode=require`) |
| `JWT_SECRET` | any string | auto-generated by `render.yaml` (`generateValue: true`) |
| `STORAGE_PROVIDER` | `local` | `local` (default — see the storage note below) |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | your exact Vercel URL(s), comma-separated — never `*` |
| `PATTERN_SERVICE_URL` | `http://localhost:8000` | `lifecloset-pattern-service`'s public Render URL |
| `PATTERN_SERVICE_USE_ID_TOKEN` | `false` | `false` (no GCP identity to sign with off Cloud Run) |
| `PATTERN_SERVICE_API_KEY` | unset (not needed) | shared secret — Render's free tier has no private-service option, so this replaces network isolation; must match the pattern service's own copy |
| `GEMINI_API_KEY` | optional — leave blank to disable Bear's chat | free key from aistudio.google.com/apikey |
| `COMPANION_MODEL` | `gemini-2.5-flash` | same |
| `LOG_LEVEL` | `debug` | `info` |

**Pattern service** — no *required* env vars; it's stateless and takes no
credentials of its own to run. `PATTERN_SERVICE_API_KEY` is optional and
only matters once the service has a public URL (see above).

**A note on storage:** `STORAGE_PROVIDER=local` writes uploaded images to
disk and is the default everywhere, including production. It's genuinely
fine for a free deployment — the only caveat is that Render's free web
services don't have a persistent disk, so uploads are cleared on restart
or redeploy (not on every request — just when the container itself
restarts). If that ever matters more than $0/month, `internal/storage/s3.go`
already supports any S3-compatible bucket (Cloudflare R2 has a free tier
too) — flip `STORAGE_PROVIDER=s3` and set the `STORAGE_S3_*` vars, nothing
else in the app changes. `internal/storage/gcs.go` is there too, for the
Cloud Run path in `DEPLOYMENT.md`.

---

## Testing

```bash
npm test          # frontend — Vitest
npm run lint       # frontend — ESLint
npm run build      # frontend — production build

cd backend
go mod tidy        # required once, to resolve the full dependency graph
go test ./...      # backend
go vet ./...
go build ./cmd/api

cd pattern-service
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt pytest
python -m pytest tests/
```

Wire these into CI (see [CI/CD](#cicd)) so every PR and push to `main` is
checked automatically.

---

## API overview

Base path: `/api/v1`. Full request/response shapes: `backend/docs/openapi.yaml`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health`, `/ready` | — | liveness / readiness probes |
| `POST` | `/auth/signup` | — | create account |
| `POST` | `/auth/login` | — | get access + refresh tokens |
| `POST` | `/auth/refresh` | — | rotate access token |
| `POST` | `/auth/logout` | ✓ | invalidate refresh token |
| `GET` | `/auth/me` | ✓ | current user |
| `PUT` | `/me/equipped` | ✓ | set the doll's currently-worn items |
| `POST` `GET` | `/items` | ✓ | create / list wardrobe items (multipart for image upload) |
| `PATCH` `DELETE` | `/items/:id` | ✓ | update / remove an item |
| `POST` | `/items/:id/wear` | ✓ | log a wear event |
| `GET` | `/history` | ✓ | wear history |
| `POST` `GET` | `/outfits` | ✓ | create / list saved outfits |
| `GET` `PATCH` `DELETE` | `/outfits/:id` | ✓ | fetch / update / remove an outfit |
| `POST` | `/patterns/process` | ✓ | upload a fabric photo → tiling texture + palette (proxies to pattern-service) |
| `POST` | `/companion/chat` | ✓ | chat with Bear (proxies to the Gemini API, with the caller's own wardrobe as context) |

Every response uses the same envelope
(`{ success, message, data, error }` — `backend/internal/dto/response.go`);
`lib/api/client.js` unwraps it and throws a normalized `ApiError` on the
frontend, so no raw stack traces or DB errors ever reach the UI.

---

## Deployment

**Recommended: free, no card.** Vercel (frontend) + Render free web services
(Go API + Python pattern service) + Neon free Postgres. `render.yaml` at the
repo root is a ready-to-apply Render Blueprint for this path. Full
step-by-step: **[`DEPLOYMENT_RENDER.md`](./DEPLOYMENT_RENDER.md)**.

Short version:

1. Create a free Neon project, copy its connection string.
2. Render dashboard → **New → Blueprint** → point at this repo → **Apply** (creates both services on the `free` plan).
3. Fill in the handful of `sync: false` values Render prompts for (`DATABASE_URL`, the pattern service's public URL + API key, etc).
4. Import the repo into Vercel, set `NEXT_PUBLIC_API_URL`, deploy.
5. Set the API's `ALLOWED_ORIGINS` to the real Vercel URL.

**Optional, for later: Cloud Run + Cloud SQL + GCS.** If this ever needs to
scale past a free tier's cold-starts-and-ephemeral-disk trade-offs, the
codebase already supports it unchanged — same Docker images, same
`storage.Storage` interface (just `gcs` instead of `local`), deployed via
GitHub Actions using Workload Identity Federation (no service-account JSON
keys stored anywhere). Full walkthrough: **[`DEPLOYMENT.md`](./DEPLOYMENT.md)**.

---

## CI/CD

Recommended `.github/workflows/ci.yml`: on every PR and push to `main`, run
the frontend test/lint/build, the backend `go vet`/tests/build, and the
pattern-service tests (the three command blocks under
[Testing](#testing) above, wired into one workflow).

No separate deploy workflow is required for the free path — Render's own
GitHub integration auto-deploys both services on every push to `main`, and
Vercel does the same for the frontend (including PR preview deployments).
A `deploy.yml` is only worth adding if you move to the Cloud Run path in
`DEPLOYMENT.md`, where a push-based deploy step through Workload Identity
Federation replaces Cloud Run's own (paid) continuous-deploy integration.

---

## Known limitations / roadmap

- **`backend/go.sum` needs `go mod tidy`** on first clone — it may ship with
  only direct-dependency entries; running `go mod tidy` once resolves the
  full transitive graph.
- **Collections/Journal pages** are intentionally thin — they
  read from the store but don't yet have their own creation forms.
  **Companion (Bear)** has a real chat backed by the Gemini API
  (`POST /companion/chat`) — set `GEMINI_API_KEY` in `backend/.env` to
  turn it on; it degrades to a friendly "not configured" message if left
  blank, rather than failing to boot.
- **No single-item `GET /items/:id`** on the backend yet — the frontend
  only has list + patch + delete; `lib/api/items.js` has no `getItem()`
  because there's nothing for it to call.
- **Free-tier cold starts.** Render's free web services sleep after ~15
  minutes idle and take 30-60s to wake on the next request — expected
  behavior of the $0 path, not a bug. A free uptime pinger (e.g.
  UptimeRobot hitting `/health`) avoids it if it becomes annoying.
- **Free-tier storage is ephemeral.** `STORAGE_PROVIDER=local` (the
  default) loses uploaded images on container restart when hosted on
  Render's free plan, which has no persistent disk. Swap to
  `STORAGE_PROVIDER=s3` (e.g. Cloudflare R2's free tier) if that ever
  matters more than staying at $0 — see the storage note under
  [Environment variables](#environment-variables).
- **Pattern-service auth**: on the free Render path, the pattern service is
  a public URL (Render's free tier has no private-service option) guarded
  by a shared `X-API-Key` header instead of network isolation — see
  `pattern-service/app/main.py` and `PATTERN_SERVICE_API_KEY` above. On the
  Cloud Run path, `PATTERN_SERVICE_USE_ID_TOKEN=true` uses real
  Google-signed ID tokens instead, since a private Cloud Run service is an
  option there.
- **No license file yet** — add one (`LICENSE`) before making the repo
  public if you want to set explicit reuse terms.

---

Built as a multi-phase project: Next.js scaffold → Go backend → wired
together → smart garment engine (subtypes, layering, pattern
processing) → pattern persistence → production hardening (security
review, free-tier deployment — this pass).
