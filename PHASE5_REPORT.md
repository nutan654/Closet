# Phase 5 — Smart Garment Engine: Final Report

## 0. The polyglot architecture, at a glance

```
Next.js / React  ──────────────►  Go REST API  ──────────────►  Postgres + Image Storage
(doll, garment                    (auth, CRUD,                  (unchanged, still
 rendering, pattern                orchestration,                authoritative)
 controls — all client-side)       validation)
                                        │
                                        │ proxies fabric photos over HTTP
                                        ▼
                              Python / FastAPI pattern-service
                              (Pillow + numpy: seamless tiling,
                               palette extraction — stateless)
```

Three languages, each doing the job it's actually good at:
- **Go** stays the system of record — auth, Postgres, existing image upload pipeline, request validation. Nothing about that changed.
- **Python** owns exactly one thing: turning a fabric photo into a seamlessly-tiling texture + color palette. Pillow's median-cut quantization and numpy's array ops are a better fit for this than reimplementing it in Go or JS, and it's a clean seam to later swap in a real ML/diffusion model without touching anything else.
- **React/SVG** owns the doll and live pattern editing entirely client-side — no round trip for a slider drag.

This mirrors a pattern you'd actually use in production: a typed backend service, and a specialized data/ML-adjacent microservice it delegates to over a plain HTTP contract.

## 1. Existing doll architecture discovered

`components/doll/` was a small, fixed 150×210 SVG chibi doll (`Doll.jsx`), with `Body`, `Face`, `Hair` as static pieces and `Tops`/`Bottoms`/`Outerwear`/`Dress` as single-purpose components — each hardcoding one silhouette per `fit` variant, with z-order implicit in JSX render order. `GarmentPreview.jsx` and `ItemCard.jsx` reused these same components for card thumbnails. The backend's `Item` model already had a free-text `subtype` field (unused by the frontend) — this became the hook for garment silhouettes without any schema change.

## 2. New garment architecture

```
Doll ──► GarmentRenderer ──► garmentShapes.js (shape) + pattern.js (fill math) ──► SVG
  ▲                ▲
  │                └── also used directly by GarmentPreview (same component, same props)
  └── Tops/Bottoms/Outerwear/Dress (thin, backward-compatible wrappers)
```

`GarmentRenderer.jsx` is the single place that turns `(category, subtype, fit, color, pattern)` into SVG. `Tops`/`Bottoms`/`Outerwear`/`Dress` kept their exact original prop signatures (`color`, `fit`) as a superset — nothing calling them needed to change, they just gained optional `subtype`/`pattern*` props.

## 3. Garment categories implemented

Reused the backend's existing category enum as-is (`tops`, `bottoms`, `dresses`, `outerwear`, plus non-doll categories). Added **subtypes** on top, stored in the item's existing `subtype` field:
- tops: T-Shirt, Shirt, Top
- bottoms: Pants, Skirt, Shorts (+ existing Wide leg/Skinny fits)
- outerwear: Jacket, Blazer, Coat
- dresses: Regular, Wrap, Slip, A-line (fit doubles as shape key — dresses are one silhouette family)

## 4. Layering system

`lib/doll/layers.js` is the single source of truth: `HAIR_BACK → BODY → TOP → BOTTOM → DRESS → OUTERWEAR → ACCESSORIES → FACE → HAIR_FRONT → JEWELRY`. `Doll.jsx` renders in this exact sequence (SVG has no z-index — paint order is document order). `isAbove()`/`layerIndex()` make the ordering testable (`lib/doll/__tests__/layers.test.js`).

## 5. Pattern processing approach (Python)

`pattern-service/app/imaging.py` — deterministic, framework-free functions:
1. Decode + EXIF-correct + center-crop to square
2. **Seamless tiling**: numpy "offset and blend" — roll the image by half-width/half-height (moves original edges to center), then feather-blend a mirrored copy across the new center seams. O(w·h), no ML, no GPU.
3. **Palette extraction**: Pillow's adaptive (median-cut) quantization, read back sorted by pixel frequency, formatted as hex.

## 6. Pattern rendering approach (React/SVG)

`lib/doll/pattern.js` computes `<pattern>` element props (tile size from `patternScale`, `patternTransform` from offset/rotation) as pure, unit-tested math — no DOM. `GarmentRenderer` feeds these into an SVG `<pattern>` whose `<image>` is the fabric tile.

## 7. SVG/clipping implementation

No explicit `clipPath` needed: filling an SVG `<path>` with `fill="url(#pattern-id)"` is inherently bounded by that path's own geometry — exactly the "fabric naturally follows the garment shape" requirement.

## 8. Color/tint implementation

Three fill modes, resolved by `resolveFillMode()`: **solid** (`fill={color}`), **pattern** (`fill="url(#...)"`), **pattern-tint** (pattern fill + a second identical path painted with `color` at `mix-blend-mode: multiply`, so the fabric shows through tinted rather than replaced).

## 9. Outfit integration

`AddItemSheet` (in `app/wardrobe/page.js`) gained a subtype chip row and a `PatternControls` block. The doll section gained a "Style [item]'s fabric" toggle that live-edits the *currently equipped* item's pattern via `StoreContext.setPatternStyle` — zero network calls per edit, doll re-renders instantly (brief section 14).

## 10. Backend changes

- **New**: `pattern-service/` (Python microservice), `backend/internal/patternproxy/` (Go HTTP client), `backend/internal/handlers/pattern_handler.go`, `POST /api/v1/patterns/process` route, `PatternServiceConfig`, one new `docker-compose.yml` service.
- **Not changed**: Postgres schema, existing item/outfit endpoints, `internal/upload` validation (reused as-is for pattern uploads too).
- Pattern styling fields (`patternUrl`, `patternScale`, `patternOffsetX/Y`, `patternRotation`, `patternTint`) are **frontend-only** — not in `ItemRequest`/`ItemPatchRequest`, not persisted. See Known Limitations.

## 11. Files created
- `pattern-service/app/{__init__,imaging,main}.py`, `requirements.txt`, `Dockerfile`, `.dockerignore`, `tests/test_imaging.py`
- `backend/internal/patternproxy/client.go` (+ `client_test.go`)
- `backend/internal/handlers/pattern_handler.go` (+ `pattern_handler_test.go`)
- `backend/internal/dto/pattern_dto.go`
- `lib/doll/{layers,pattern,garmentShapes}.js` (+ `__tests__/`)
- `components/doll/GarmentRenderer.jsx` (+ `__tests__/GarmentRenderer.test.jsx`)
- `components/PatternControls.jsx`
- `lib/api/patterns.js`
- `lib/__tests__/setPatternStyle.test.jsx`

## 12. Files modified
- `components/doll/{Doll,Tops,Bottoms,Outerwear,Dress}.jsx` (refactored onto `GarmentRenderer`, backward-compatible)
- `components/GarmentPreview.jsx` (now shares the same rendering primitives)
- `lib/model.js`, `lib/constants.js`, `lib/StoreContext.jsx`, `lib/api/mappers.js` (pattern fields, `setPatternStyle`, `GARMENT_SUBTYPES`)
- `app/wardrobe/page.js` (subtype selection, pattern controls wired into Add-Item flow and the equipped-item doll view)
- `backend/internal/config/config.go`, `backend/internal/routes/routes.go`, `backend/cmd/api/main.go`, `backend/docker-compose.yml`
- `vitest.config.js` (new test globs)

## 13. Tests added
- **Python** (15, run directly with `python3 pattern-service/tests/test_imaging.py` — all passing in this environment): decode/reject invalid, crop, tile-size clamping, seamless-edge continuity, palette extraction + bounds, end-to-end pipeline, malformed input.
- **Go**: `patternproxy` (success/upstream-rejects/service-unreachable), `pattern_handler` (success/non-image 415/missing file/service-down 502).
- **JS/Vitest**: `layers.test.js` (ordering, category mapping), `pattern.test.js` (scale/offset/rotation math, malformed input, fill-mode resolution), `garmentShapes.test.js` (distinct silhouettes per subtype, fallback), `GarmentRenderer.test.jsx` (solid/pattern/tint rendering, defs-id collisions, clearing a pattern, Doll receiving equipped garments correctly), `setPatternStyle.test.jsx` (local-only updates, no API calls, merge semantics, clearing).

## 14. Commands actually executed in this environment
- `python3 pattern-service/tests/test_imaging.py` → **15/15 passed**
- `npm install` → failed (registry returned 403 — this sandbox has no npm registry access), so `npm test`/`npm run build`/`npm run lint` could **not** be run here. The JS/Vitest and Go test files were written and manually reviewed for correctness but not executed by a test runner in this session.
- `go build`/`go test` → Go toolchain is not installed in this sandbox, so the Go files were manually reviewed rather than compiled here.
- **You should run** `npm test`, `npm run lint`, `npm run build`, and `cd backend && go build ./... && go test ./...` in an environment with registry/toolchain access before treating this as verified-green.

## 15. Known limitations
- **Pattern styling does not survive a page reload.** The Postgres schema has no `pattern_url`/`pattern_scale`/`pattern_offset_x`/`pattern_offset_y`/`pattern_rotation`/`pattern_tint` columns yet — adding them is a small, additive migration (nullable columns on `items`) plus wiring them through `ItemRequest`/`ItemPatchRequest`/`ItemResponse` and `lib/api/mappers.js`. Deliberately not done this phase per the brief's "do not add migrations automatically" instruction.
- The seamless-tiling algorithm is a classic offset-and-blend technique, not content-aware inpainting — busy/directional fabric photos will tile more convincingly than ones with large distinct focal objects near the edges.
- Not independently verified in a browser in this session (no live dev server here) — see section 14.

## 16. What should be done next
1. Run the full verification suite (`npm test`, `npm run lint`, `npm run build`, `go test ./...`, `python3 pattern-service/tests/test_imaging.py`) in an environment with network/toolchain access.
2. Visually verify each subtype (T-Shirt/Shirt/Top/Pants/Skirt/Jacket/Dress) with solid + pattern + multiple scales, per section 22.
3. If pattern persistence is wanted: add the nullable Postgres columns + DTO fields (see Known Limitations) — this is the natural Phase 6.
4. The Python service is the natural place to later add real GenAI (text-to-pattern generation via a diffusion API) without touching Go or React — the `/process` contract already isolates that concern.
