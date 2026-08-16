# Quick start — submitting today

Condensed version of `README.md` / `DEPLOYMENT.md`. Read those for full
detail; this is just the fastest path to something running.

## Option A — run it locally (fastest, ~5 min)

You need Node 18+, Go 1.22+, and a Postgres database (a free one from
[Neon](https://neon.tech) or [Supabase](https://supabase.com) takes under
2 minutes to spin up — copy its connection string).

```bash
# 1. Backend
cd backend
cp .env.example .env
```
Edit `backend/.env` and set at minimum:
```
DATABASE_URL=postgres://...          # from Neon/Supabase
JWT_SECRET=<run: openssl rand -base64 48>
GEMINI_API_KEY=AI...                 # optional — leave blank to skip Bear's chat
```
```bash
go mod tidy
go run cmd/api/main.go
# → server starting, port 8080
```

```bash
# 2. Frontend (new terminal, from repo root)
npm install
npm run dev
# → http://localhost:3000
```

`.env.local` already ships with `NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1`,
matching the backend's default port — no edit needed unless you changed `PORT`.

**Don't want to deal with the backend at all?** The door screen has a
"Just want to look around? Try the demo" option — full UI, doll, wardrobe,
fabric patterns, all client-side, no backend required. Bear's chat is the
one feature that genuinely needs the backend (it calls Gemini
server-side, on purpose — never from the browser).

## Option B — deploy it (Vercel + a hosted backend)

1. **Frontend → Vercel**: import the repo, set `NEXT_PUBLIC_API_URL` in
   Project → Settings → Environment Variables to wherever the backend ends
   up (step 2), deploy.
2. **Backend → anywhere that runs a Go binary** (Cloud Run, Render,
   Railway, Fly.io all work). Set the same env vars as Option A, plus
   `ALLOWED_ORIGINS=https://your-vercel-url.vercel.app` (never `*`).
3. Redeploy the frontend once the backend URL is known, if you set it
   after the first deploy.

Full production walkthrough (Cloud SQL, GCS, Workload Identity
Federation, CI/CD) is in `DEPLOYMENT.md` — only worth it if you have time
beyond today; Option B above is enough for a working submission link.

## If something's broken at the last minute

| Symptom | Fix |
|---|---|
| `NEXT_PUBLIC_API_URL is not set` | Missing `.env.local` (local) or the Vercel env var (deployed) — see above. |
| Login/signup fails, everything else looks fine | Backend can't reach Postgres — check `DATABASE_URL`. |
| Bear replies with "Bear isn't set up yet" | `GEMINI_API_KEY` is blank in `backend/.env` — expected until you add one, not a bug. |
| Doll shows blank/no clothes | Check the browser console — usually a bad `NEXT_PUBLIC_API_URL` causing every `/items` fetch to fail silently upstream. |
| `go build` fails on a fresh clone | Run `go mod tidy` once first — `go.sum` ships with direct deps only. |

## Sanity checklist before you hit submit

- [ ] `npm run build` succeeds locally (catches most frontend issues before a host does)
- [ ] `cd backend && go build ./cmd/api` succeeds
- [ ] You can sign up, add an item, and see it on the doll
- [ ] `.env` / `.env.local` are **not** committed to git (check `.gitignore`)
