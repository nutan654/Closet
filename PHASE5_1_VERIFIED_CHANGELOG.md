# Phase 5.1 — Pattern Persistence: Verified Changelog

This file documents what was *actually* changed and *actually* verified in
this pass, as a companion to `PHASE5_REPORT.md` (which correctly flagged
pattern persistence as a known gap — see its "Known Limitations" section,
line 79 and 119).

A separate, informal "Phase 5.1" report circulated earlier claimed this gap
was already closed. It wasn't: the migration, `models.Item` struct, and
create-DTO fields existed, but the repository SQL never read/wrote the
`pattern_*` columns, `ItemPatchRequest` didn't have the fields at all, and
`ItemResponse` never returned them — so nothing could actually round-trip.
This changelog only lists what was verified against the real files in this
repo, in this session.

## Backend (`backend/internal/...`)

- `dto/item_dto.go`
  - Added `PatternURL/Scale/OffsetX/OffsetY/Rotation/Tint` to `ItemPatchRequest` (previously absent — this was the actual blocker; `ItemRequest` had them, `ItemPatchRequest` didn't).
  - Added `ClearPattern *bool` — a plain `*string` can't distinguish "field omitted" from "field sent as `null`" once JSON-decoded, so the frontend's "Remove pattern" action needed an explicit flag to actually clear the column server-side.
  - Added the same 6 fields to `ItemResponse` (previously absent — even a correctly-stored pattern was invisible to every `GET`/list call).
- `repository/item_repository.go`
  - Added `pattern_url, pattern_scale, pattern_offset_x, pattern_offset_y, pattern_rotation, pattern_tint` to the `Create()` INSERT (columns + `$36..$41` placeholders + args).
  - Added the same 6 columns to `itemSelectCols` and `itemScanArgs` (used by both `FindByID` and `List`).
- `service/item_service.go`
  - `Create()` now copies the 6 pattern fields from `dto.ItemRequest` onto `models.Item` (previously silently dropped).
  - `Update()` now calls `setIf(...)` for all 6 pattern fields into the patch's `fields` map, plus explicit nil-out logic for all 6 when `ClearPattern` is true.
  - `toItemResponse()` now maps the 6 fields from `models.Item` onto `dto.ItemResponse`.
- `service/item_service_test.go`
  - Added `TestCreate_CopiesPatternFieldsOntoModel`, `TestUpdate_WritesPatternFieldsToFieldsMap`, `TestUpdate_ClearPatternNilsOutTheWholeGroup`, `TestUpdate_RejectsOtherUsersItemBeforeTouchingPatternFields`.
  - Extended `fakeItemRepository.Update` to capture `lastUpdateFields` so tests can assert on exactly which columns a given patch produces.
  - **Not run in this session** — no Go toolchain was available in the sandbox. Brace/paren balance was checked mechanically; the tests have not been compiled or executed. Run `go test ./...` from `backend/` before trusting this layer.

## Frontend (`lib/...`)

- `lib/api/mappers.js`
  - `toFrontendItem()` now reads real `patternUrl`/`patternScale`/etc. from the API response with `??` defaults, instead of always hardcoding solid-color defaults.
  - Added `toItemPatternPatchPayload()`, which also emits `clearPattern: true` when `patternUrl` is explicitly `null`.
- `lib/StoreContext.jsx`
  - `setPatternStyle()` still updates local state synchronously and instantly (unchanged UX — no drag-frame ever waits on the network).
  - Added a **700ms debounced, coalesced** background `PATCH` per item, so rapid slider ticks collapse into one request instead of one per tick.
  - Added `patternSaveStatus` (`pending` / `saving` / `saved` / `error`) exposed on context, for optional UI use — no existing component was changed to consume it, so this is purely additive.
  - Pending saves are flushed (not dropped) on unmount.
- `lib/__tests__/setPatternStyle.test.jsx`
  - Rewritten. The previous version asserted `updateItem` is *never* called — that assertion described the bug, not the intended behavior, and had to change along with the fix.
  - **Actually run** with `npx vitest run` in this sandbox (Node was available). Result: **7/7 passing**.
  - Running the tests caught a real bug in the first draft: `testing-library`'s `waitFor` polls via `setTimeout`, which deadlocks against `vi.useFakeTimers()`. Fixed by flushing microtasks manually instead of using `waitFor` once fake timers are active.

## Full frontend suite

Run in this sandbox:

```
$ npx vitest run
 Test Files  10 passed (10)
      Tests  116 passed (116)
```

## Explicitly NOT done / NOT verified

- **The Go backend was not compiled or tested.** No `go` binary was available in this sandbox and the network allowlist didn't include Go's module proxy. Every backend edit was reviewed manually (types matched against the existing struct/DTO shapes, SQL placeholder counts recounted by hand, brace/paren balance checked with a script) but that is not a substitute for `go build && go test ./...`. Run that for real before deploying.
- No end-to-end / integration test against a real Postgres instance was run.
- Deployment (Docker build, environment wiring, actual hosting) has not been attempted yet in this session.
