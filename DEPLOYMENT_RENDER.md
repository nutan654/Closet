# Deploying LifeCloset for $0 (no credit card, anywhere)

This is the free path: **Vercel** (frontend) + **Render free tier** (Go
API + Python pattern service) + **Neon free tier** (Postgres). Nothing
in this walkthrough asks for a card. Everything auto-deploys from GitHub
on every push once it's wired up once.

```
Next.js  ──────────────────────────────────►  Vercel (Hobby, free)
Go REST API  ──────────────────────────────►  Render Web Service (free)  ──►  Neon Postgres (free)
Pattern Service (Python)  ──────────────────►  Render Web Service (free), guarded by an API key
```

Two honest trade-offs of going full-free — both fine for a student
project / portfolio piece, worth knowing about upfront:

1. **Cold starts.** Render's free services sleep after ~15 minutes of no
   traffic and take 30-60 seconds to wake up on the next request. The
   first request after a quiet spell will feel slow; everything after
   that is normal speed. If you're demoing this live, open the site a
   minute before you need it.
2. **Uploaded images don't persist across restarts.** Free Render web
   services have no persistent disk, and `STORAGE_PROVIDER=local` (the
   default) writes to that disk. Every redeploy or restart clears
   `/data/uploads`. The app works perfectly for demos and day-to-day use
   between restarts; if you want uploads to survive indefinitely without
   paying, see **Optional upgrades** at the bottom — there's a free
   object-storage option too.

---

## 0. Prerequisites

- A [Render](https://render.com) account (GitHub login is enough)
- A [Neon](https://neon.tech) account (GitHub login is enough) — free Postgres, doesn't expire
- A [Vercel](https://vercel.com) account (GitHub login is enough)
- A free [Gemini API key](https://aistudio.google.com/apikey) if you want Bear's chat working (optional — the app runs fine without it, `/companion/chat` just returns a friendly "not configured" message)
- This repo pushed to your own GitHub account

---

## 1. Create the free database (Neon)

1. [neon.tech](https://neon.tech) → sign up → **Create a project**. Name it `lifecloset`, pick any region close to you.
2. On the project dashboard, find the **Connection string** (Neon shows it immediately after project creation, or under **Connection Details**).
3. Copy the string that looks like:
   ```
   postgres://<user>:<password>@<host>.neon.tech/<dbname>?sslmode=require
   ```
   That's your `DATABASE_URL`. Save it somewhere — you'll paste it into Render in step 3.

That's it. No expiry, no card, and `database.RunMigrations()` in `backend/cmd/api/main.go` runs automatically against it the first time the API boots, same as any other Postgres.

---

## 2. Deploy via the Render Blueprint

This repo includes `render.yaml` at the root, defining the Go API and the Python pattern service — both on the `free` plan.

1. Render dashboard → **New** → **Blueprint** → connect your GitHub repo → Render reads `render.yaml` and shows you the two services it will create.
2. Click **Apply**. Render builds both Docker services. `JWT_SECRET` and `PATTERN_SERVICE_API_KEY` are generated for you automatically (`generateValue: true`) — you never see or type these by hand.
3. The `sync: false` fields show up as blank inputs Render asks you to fill in before the first deploy. Some of these need values from steps below, so it's fine to apply now and fill them in from each service's **Environment** tab afterward:

| Env var | On service | Value |
|---|---|---|
| `DATABASE_URL` | `lifecloset-api` | the Neon connection string from step 1 |
| `ALLOWED_ORIGINS` | `lifecloset-api` | placeholder for now (`https://placeholder.vercel.app`) — fixed in step 5 |
| `STORAGE_BASE_URL` | `lifecloset-api` | `https://lifecloset-api.onrender.com/uploads` (swap in your actual `.onrender.com` subdomain, shown on the service page) |
| `PATTERN_SERVICE_URL` | `lifecloset-api` | see step 3 below |
| `PATTERN_SERVICE_API_KEY` | `lifecloset-api` | copy the value Render generated for `lifecloset-pattern-service`'s `PATTERN_SERVICE_API_KEY` (**Environment** tab on that service) |
| `GEMINI_API_KEY` | `lifecloset-api` | optional — leave blank to ship without Bear for now |

---

## 3. Point the API at the pattern service

Unlike a private service, `lifecloset-pattern-service` gets a normal public `https://lifecloset-pattern-service.onrender.com` URL (that's the free-tier trade-off — see the note at the top of `render.yaml`). Copy it from that service's page and set, on `lifecloset-api`:

```
PATTERN_SERVICE_URL=https://lifecloset-pattern-service.onrender.com
PATTERN_SERVICE_USE_ID_TOKEN=false
PATTERN_SERVICE_API_KEY=<the value from lifecloset-pattern-service's env vars>
```

The key is what stands in for network isolation here: `pattern-service/app/main.py` rejects any `/process` request that doesn't send a matching `X-API-Key` header, and `internal/patternproxy/client.go` sends it automatically once `PATTERN_SERVICE_API_KEY` is set on the Go side. Both values must match exactly.

---

## 4. Verify the API is up

```bash
curl https://lifecloset-api.onrender.com/health   # expect {"success":true,...,"status":"ok"}
curl https://lifecloset-api.onrender.com/ready    # expect 200 + database:connected
```

If this hangs for 30-60 seconds first, that's the free-tier cold start — try again and it'll be instant.

---

## 5. Deploy the frontend to Vercel

1. [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
2. Root directory stays the repo root.
3. Environment variable: `NEXT_PUBLIC_API_URL` = `https://lifecloset-api.onrender.com/api/v1`.
4. Deploy. Note the `https://your-project.vercel.app` URL — Vercel's Hobby tier is free and doesn't require a card either.

---

## 6. Close the loop: lock down CORS

Back on `lifecloset-api`'s **Environment** tab in Render:

```
ALLOWED_ORIGINS=https://your-project.vercel.app
```

Saving triggers an automatic redeploy. Comma-separate if you attach a custom domain later.

---

## 7. Ongoing deploys

Render's GitHub integration auto-deploys both services on every push to `main`. Vercel does the same for the frontend, including PR preview deployments. No CI changes needed beyond what's already in `.github/workflows/`.

---

## 8. Post-deploy checklist

- [ ] `GET /health` → `{"status":"ok"}`
- [ ] `GET /ready` → `database: connected`
- [ ] Sign up a real account on the live frontend
- [ ] Create a wardrobe item with a fabric photo, confirm the pattern preview renders (this round-trips through the pattern service + API key)
- [ ] Save an outfit, refresh, log back in, confirm it's still there
- [ ] Expired/invalid token → expect 401, not a 500
- [ ] Access another user's item by ID → expect 403/404
- [ ] Browser Network tab shows `Access-Control-Allow-Origin` as your exact Vercel origin, not `*`

---

## Rollback

Render dashboard → service → **Events** tab → pick a previous deploy → **Rollback**. Vercel: **Deployments** → promote a previous one. Same for both services either way — nothing plan-specific here.

---

## Optional upgrades (still free, only if you want them later)

These aren't required to run LifeCloset — they just remove the two trade-offs called out at the top, if either one starts to bother you:

- **Uploads that survive restarts:** [Cloudflare R2](https://developers.cloudflare.com/r2/) has a free tier (10GB storage, no card required for the free allotment) and this repo already has an S3-compatible storage driver (`backend/internal/storage/s3.go`) ready to point at it — set `STORAGE_PROVIDER=s3` plus the `STORAGE_S3_*` vars documented in `backend/.env.example`. Nothing else in the app changes.
- **No cold starts:** a free uptime pinger (e.g. [UptimeRobot](https://uptimerobot.com)) hitting `/health` every 10 minutes keeps a Render free service from ever fully sleeping. Not required, just a nice trick.
- **A Postgres with more headroom:** Neon's free tier (0.5 GB storage, autosuspends the *compute* — not the data — after inactivity, wakes in ~1s) is generous enough for a project like this for a very long time; nothing to change unless you outgrow it.
