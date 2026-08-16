# Closet backend

A production-shaped Go REST API for the Closet app — Clean Architecture,
JWT auth with revocable refresh tokens, and the operational scaffolding
(structured logging, health checks, graceful shutdown, rate limiting) a
real service needs. Built in three phases, each one a coherent story:

- **Phase 1** — took the original single-`main.go` MVP and restructured it
  into layered, dependency-injected, testable Go, with no API behavior
  change.
- **Phase 2** — added real multi-user accounts: signup/login/JWT/bcrypt,
  and every wardrobe item/outfit now belongs to exactly one authenticated
  user, enforced at the service layer.
- **Phase 3** — a production-quality image upload and storage subsystem:
  a `Storage` interface with local-disk (dev) and Google Cloud Storage
  (prod) implementations behind it, real content-sniffed file validation,
  server-side image processing (resize + thumbnail), and ownership-scoped
  storage keys so one user's images are never reachable or deletable by
  another.

## Architecture

```
cmd/api/main.go        entrypoint — loads config, wires DI, starts the server, handles shutdown
internal/
  config/               everything env-driven, nothing hardcoded
  logger/                structured (slog) JSON logging
  database/              connection pool + embedded migrations
  models/                 DB-shaped domain structs (never serialized directly)
  dto/                    request/response shapes — the actual public API contract
  repository/             interfaces + Postgres implementations (Create/Find/List/Update/Delete)
  service/                business logic: validation, ownership checks, token issuance, image upload orchestration
  handlers/               thin — parse request, call service, map result to an HTTP response
  middleware/              request ID, structured logging, panic recovery, CORS, JWT auth, rate limiting
  routes/                  the only file that knows the URL shape; /api/v1 versioning lives here
  validator/               custom validation rules (password strength) + error formatting
  utils/                   bcrypt, JWT, refresh-token hashing
  storage/                 Storage interface + LocalStorage/GCSStorage implementations (Phase 3)
  imageproc/               decode/resize/thumbnail image processing (Phase 3)
  upload/                  file-size and content-sniffed MIME validation (Phase 3)
  apperror/                typed errors (ERR_FILE_TOO_LARGE, etc.) shared across the upload path (Phase 3)
docs/openapi.yaml        hand-authored OpenAPI 3 spec of the core endpoints
```

Request flow for image uploads specifically:

```
Handler (multipart parse)
    ↓
ItemService.Create
    ↓
upload.DetectImageType → imageproc.Process → storage.Storage.Upload
    ↓
ItemRepository.Create (Postgres — metadata only, never binary bytes)
```

If the Postgres insert fails after the files are already stored, `ItemService`
deletes the just-uploaded original and thumbnail rather than leaving them
orphaned. If deleting an item succeeds, its storage objects are deleted
too. See `internal/service/item_service.go` (`storeImage`, `cleanupAsset`,
`deleteImageFiles`) for the exact rollback logic.

Request flow: `routes → middleware → handler → service → repository → Postgres`.
Each layer only depends on the layer directly below it (dependency
injection wired once, in `main.go`) — which is what makes the service
layer unit-testable with in-memory fakes instead of a real database (see
`internal/service/*_test.go`).

## Why these specific choices (the "why" behind each, for interviews)

- **DTOs separate from models** — a `User` model has `PasswordHash`; a
  `UserResponse` DTO physically cannot, because the field doesn't exist on
  that struct. That's a compile-time guarantee against ever leaking a
  password hash, not a "remember not to" convention.
- **Refresh tokens are opaque, hashed, and rotated on every use** — not
  just a longer-lived JWT. A stolen refresh token becomes worthless the
  moment the real client refreshes again, and *reuse of an already-rotated
  token* is a strong signal of theft. Storing only the hash means a
  leaked DB backup doesn't hand out live sessions, the same reasoning as
  password hashing.
- **Login returns the same error for "wrong password" and "no such
  user"** — a login endpoint that distinguishes those two cases lets an
  attacker enumerate registered emails. Small detail, commonly shipped
  wrong.
- **Every DB call gets a `context.WithTimeout`** — a slow query degrades
  into a clean timeout error instead of holding a connection (and the
  goroutine behind it) forever under load.
- **Rate limiting on `/auth/*`** — the endpoints that actually get hit by
  credential-stuffing bots the moment a service is public. In-memory
  per-IP sliding window; the honest trade-off (doesn't work across
  replicas without a shared store) is called out in the code comment
  rather than hidden.
- **Request-ID middleware** — every log line for a single request shares
  one ID, echoed back in the `X-Request-ID` response header. This is what
  makes "grep the logs for one user's failed request" actually possible.
- **Migrations embedded via `go:embed`** at `internal/database/migrations`
  rather than a top-level `migrations/` folder — `go:embed` can't traverse
  `..`, so the migration source of truth has to live inside the embedding
  package. Trade-off noted in code; ships as one self-contained binary
  with no separate migrate step in Docker/Cloud Run.
- **Storage is an interface, not a filesystem call** — `ItemService` and
  the handlers only ever see `storage.Storage` (Upload/Delete/GetURL).
  Local dev writes to disk; production writes to GCS; nothing above the
  storage package changes when that switch happens, because nothing above
  it knows which one it's talking to. That's what makes "deploy to GCP" a
  one-line env var change instead of a code change.
- **MIME type is sniffed from file content, never trusted from the
  client** — `Content-Type: image/jpeg` on the wire is just a string the
  client typed; `http.DetectContentType` looks at the actual magic bytes.
  A `.exe` renamed to `photo.jpg` gets rejected either way.
- **Storage keys are generated server-side from IDs, never from the
  original filename** — `users/{userID}/items/{itemID}/original.jpg`.
  There's no client-supplied path segment left to sanitize, which is a
  stronger guarantee against path traversal / filename collisions than
  sanitizing a client-supplied name would be.

## Run it locally

```bash
cd backend
cp .env.example .env      # then edit JWT_SECRET at minimum
docker compose up --build
```

Or bare Go against your own Postgres:

```bash
go mod tidy
export DATABASE_URL="postgres://user:pass@localhost:5432/closet?sslmode=disable"
export JWT_SECRET="$(openssl rand -base64 48)"
go run ./cmd/api
```

Check it's alive / ready:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/ready
```

## Try the API

```bash
# create an account
curl -X POST http://localhost:8080/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Priya","email":"priya@example.com","password":"Sup3r$ecret1"}'
# -> {"success":true,"data":{"user":{...},"accessToken":"...","refreshToken":"...","expiresIn":900}}

# use the access token for everything else
TOKEN="paste accessToken here"
curl -X POST http://localhost:8080/api/v1/items \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"category":"tops","name":"Oversized White Shirt","brand":"Uniqlo","color":"#FFFBF6","fit":"Oversized"}'

curl http://localhost:8080/api/v1/items -H "Authorization: Bearer $TOKEN"

# add an item WITH a photo (multipart/form-data — see "Image uploads" below)
curl -X POST http://localhost:8080/api/v1/items \
  -H "Authorization: Bearer $TOKEN" \
  -F "category=tops" -F "name=Oversized White Shirt" -F "brand=Uniqlo" \
  -F "color=#FFFBF6" -F "fit=Oversized" \
  -F "image=@/path/to/shirt.jpg;type=image/jpeg"
# -> {"success":true,"data":{"id":"...","imageUrl":"http://localhost:8080/uploads/users/.../original.jpg","thumbnailUrl":"...","imageWidth":1200,"imageHeight":1600,...}}

# refresh when the access token expires (rotates — save the new refreshToken)
curl -X POST http://localhost:8080/api/v1/auth/refresh \
  -H "Content-Type: application/json" -d '{"refreshToken":"paste refreshToken here"}'
```

## Image uploads (Phase 3)

`POST /api/v1/items` accepts an optional `image` file part (multipart
form) alongside the same fields as the JSON create request. Everything
about *where* the bytes end up is decided by one env var:

```bash
STORAGE_PROVIDER=local   # writes to disk (default, for dev)
STORAGE_PROVIDER=gcs     # writes to Google Cloud Storage (prod)
```

**Local storage (default, no setup needed).** Files land under
`STORAGE_LOCAL_DIR` (default `./data/uploads`) and are served back at
`STORAGE_BASE_URL` (default `http://localhost:8080/uploads`, wired up in
`internal/routes/routes.go` via `r.Static`). Nothing else to configure —
this is what `docker compose up` and `go run ./cmd/api` use out of the
box, and it never touches GCP credentials.

**Google Cloud Storage (production).** Set:

```bash
STORAGE_PROVIDER=gcs
STORAGE_BUCKET=your-bucket-name
STORAGE_BASE_URL=https://storage.googleapis.com/your-bucket-name   # or a CDN domain in front of it
GCS_CREDENTIALS_FILE=                                              # leave blank on Cloud Run/GKE — uses Application Default Credentials
```

`internal/storage/gcs.go` is a straight `cloud.google.com/go/storage`
client, selected once in `main.go`. `ItemService`, the handlers, and the
database schema don't change at all between the two providers — that's
the point of `storage.Storage` being an interface (`Upload`/`Delete`/
`GetURL`) rather than either implementation being called directly. See
"Why storage is abstracted" above.

**Environment variables (all optional, sensible defaults shown):**

| Variable | Default | Meaning |
|---|---|---|
| `STORAGE_PROVIDER` | `local` | `local` or `gcs` |
| `STORAGE_BUCKET` | `uploads` | GCS bucket name (required if `gcs`) |
| `STORAGE_BASE_URL` | `http://localhost:8080/uploads` | Public URL prefix files are served from |
| `STORAGE_LOCAL_DIR` | `./data/uploads` | Where `LocalStorage` writes files |
| `STORAGE_MAX_FILE_SIZE_MB` | `10` | Hard cap on upload size |
| `STORAGE_UPLOAD_TIMEOUT` | `30s` | Context timeout for a single storage write |
| `GCS_CREDENTIALS_FILE` | *(blank = ADC)* | Path to a service-account key file, only if not using Application Default Credentials |
| `MAX_IMAGE_WIDTH` / `MAX_IMAGE_HEIGHT` | `2000` / `2000` | Original is resized down (never up) if it exceeds this |
| `THUMBNAIL_WIDTH` / `THUMBNAIL_HEIGHT` | `400` / `400` | Thumbnail bounding box |
| `IMAGE_JPEG_QUALITY` | `85` | Quality used whenever an image is re-encoded as JPEG |

**Upload limits and accepted formats.** Only `image/jpeg`, `image/png`,
and `image/webp` are accepted, detected from the file's actual bytes
(`http.DetectContentType`) — the client's `Content-Type` header and the
filename are both ignored for this decision. Files over
`STORAGE_MAX_FILE_SIZE_MB` are rejected before being fully read. Rejection
reasons come back as one of three stable codes in the error envelope:

| HTTP status | Code | Meaning |
|---|---|---|
| 413 | `ERR_FILE_TOO_LARGE` | Exceeds `STORAGE_MAX_FILE_SIZE_MB` |
| 415 | `ERR_UNSUPPORTED_FILE_TYPE` | Not jpeg/png/webp by content sniffing |
| 400 | `ERR_INVALID_IMAGE` | Passed MIME sniffing but failed to decode (corrupt/truncated) |

**What gets stored.** Two objects per uploaded image, both under a
non-guessable, server-generated key (`users/{userID}/items/{itemID}/...`
— never derived from the original filename):

- `original.<ext>` — the uploaded image untouched, *unless* it exceeds
  `MAX_IMAGE_WIDTH`/`MAX_IMAGE_HEIGHT`, in which case it's downscaled
  (aspect ratio preserved) and re-encoded as JPEG.
- `thumbnail.jpg` — always generated, always JPEG (Go's standard library
  has no WebP encoder, so JPEG is the one format guaranteed to work for
  every accepted input type), scaled to fit within `THUMBNAIL_WIDTH` x
  `THUMBNAIL_HEIGHT` without ever upscaling.

Postgres (`items` table) stores only metadata — `image_url`,
`thumbnail_url`, `image_mime_type`, `image_file_size`, `image_width`,
`image_height`, `image_storage_key`, `thumbnail_storage_key`,
`image_uploaded_at` — never the binary bytes.

## Testing

```bash
make test           # or: go test ./...
make test-verbose   # with -v -cover
```

Current coverage: `AuthService` (signup, login, refresh rotation +
reuse-rejection, logout/revocation), the password-strength validator, the
JWT/bcrypt/refresh-token utility functions, and Phase 3's upload path —
MIME sniffing and size limits (`internal/upload`), dimension validation /
resize / thumbnail generation (`internal/imageproc`), local storage
upload/delete/path-traversal handling (`internal/storage`), and
`ItemService`'s upload orchestration: storing an image, rejecting an
oversized one, rolling back both files when the database insert fails,
rolling back the original when only the thumbnail upload fails, and
refusing to delete another user's item (`internal/service`) — all unit
tests against in-memory fakes, no database or real filesystem/GCS bucket
needed. **Not yet covered**: repository integration tests (would need a
real/dockerized Postgres — a good next step via `testcontainers-go`),
handler-level HTTP tests, and a GCS integration test (would need a real
bucket or the `fake-gcs-server` container). Said plainly here rather than
implied as "done," since claiming full coverage without it is worse than
naming the gap.

## API docs

`docs/openapi.yaml` is a hand-authored spec of the core endpoints. The
handlers under `internal/handlers/` also carry swaggo (`@Summary`,
`@Router`, ...) annotations, so once `swag` is installed
(`go install github.com/swaggo/swag/cmd/swag@latest`), `make swagger`
regenerates a fuller, code-derived spec into `docs/`.

## Response shape

Every endpoint returns the same envelope:

```json
// success
{ "success": true, "message": "...", "data": { ... } }
// error
{ "success": false, "message": "human-readable", "error": "MACHINE_CODE" }
```

## What's next (deliberately out of scope for this pass)

- Repository/handler integration tests against a real Postgres
  (testcontainers-go), and a GCS integration test
- "Log out everywhere" endpoint — `RefreshTokenRepository.RevokeAllForUser`
  already exists, just needs a route + handler wired up
- Redis-backed rate limiting for multi-replica deployment
- Image upload rate limiting specifically (currently only `/auth/*` is
  rate-limited; a busy user hammering `POST /items` with large files has
  no per-user throttle beyond the size cap)
- Signed/expiring GCS URLs for private buckets — `GCSStorage` currently
  assumes a public-read bucket (`https://storage.googleapis.com/<bucket>`
  URLs); private buckets would need `SignedURL` instead
- Re-processing/backfilling images for existing items if
  `MAX_IMAGE_WIDTH`/`THUMBNAIL_WIDTH`/etc. change later — today's
  processing only runs at upload time
- Pattern extraction, AI outfit recommendations, cloud deployment — see
  the frontend repo's roadmap
