/**
 * lib/api/mappers.js
 *
 * Explicit mapping functions between the OLD frontend model
 * (lib/model.js's mkItem()/blankProfile() shape, what every existing
 * component still reads/writes) and the Go backend's DTOs
 * (backend/internal/dto/item_dto.go, auth_dto.go). Centralized here on
 * purpose (Phase 4.3 brief, section 3) so lib/StoreContext.jsx and
 * components never need their own ad-hoc `item.photo || item.imageUrl`
 * checks scattered around.
 *
 * Field-name overlap is large: the backend's ItemRequest/ItemResponse
 * were clearly designed to mirror lib/model.js's mkItem() shape 1:1 for
 * most fields (category, name, brand, price, purchaseDate, expiryDate,
 * consumable, inventoryPercent, status, notes, color, fit, season,
 * occasion, material, size, shade, finish, subtype, cardStyle, worn,
 * favorite, createdAt all match exactly). The mappers below exist for the
 * handful of fields that genuinely differ or need defaulting/stripping,
 * not because most fields need translation.
 */

import { uid } from "../model";

// ---------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------

/**
 * BACKEND ItemResponse -> OLD FRONTEND item shape.
 *
 * The one real mismatch (Phase 4.3 brief, section 9): the old UI reads
 * `item.photo` as a single displayable image src (see components/ItemCard
 * and components/SwipeStack — both do `item.photo ? <img src={item.photo}>
 * : …`, both rendering it inside a small (~w-48 or grid-cell) square
 * card). The backend now returns `photo` (the legacy free-text/base64
 * field) AND separately `imageUrl`/`thumbnailUrl` (Phase 3 uploaded-image
 * fields).
 *
 * Phase 4.4, section 5: "use thumbnailUrl for cards/lists, imageUrl for
 * larger previews." Every current consumer of `item.photo` — ItemCard and
 * SwipeStack, both explicitly off-limits to redesign this phase — is a
 * card, never a full-size/lightbox view, so `photo` resolves to the
 * *thumbnail* first here. `imageUrl` (the full-resolution image) stays
 * available separately on the mapped object for the day a detail/lightbox
 * view exists, without another mapping pass being needed then.
 */
export function toFrontendItem(apiItem) {
  return {
    id: apiItem.id,
    category: apiItem.category,
    name: apiItem.name,
    brand: apiItem.brand,
    price: apiItem.price,
    purchaseDate: apiItem.purchaseDate ?? null,
    expiryDate: apiItem.expiryDate ?? null,
    consumable: apiItem.consumable,
    inventoryPercent: apiItem.inventoryPercent,
    timesUsed: apiItem.timesUsed,
    status: apiItem.status,
    notes: apiItem.notes,
    color: apiItem.color,
    photo: apiItem.thumbnailUrl || apiItem.imageUrl || apiItem.photo || null,
    imageUrl: apiItem.imageUrl ?? null,
    thumbnailUrl: apiItem.thumbnailUrl ?? null,
    imageMimeType: apiItem.imageMimeType ?? null,
    imageFileSize: apiItem.imageFileSize ?? null,
    imageWidth: apiItem.imageWidth ?? null,
    imageHeight: apiItem.imageHeight ?? null,
    worn: apiItem.worn,
    favorite: apiItem.favorite,
    fit: apiItem.fit,
    season: apiItem.season,
    occasion: apiItem.occasion,
    material: apiItem.material,
    size: apiItem.size,
    shade: apiItem.shade,
    finish: apiItem.finish,
    subtype: apiItem.subtype,
    cardStyle: apiItem.cardStyle,
    // Phase 5.1: the backend now persists pattern_* columns (see
    // backend/internal/dto/item_dto.go ItemResponse and migration
    // 0003_item_patterns.up.sql), so a pattern applied in a previous
    // session survives a reload. `?? <default>` rather than `|| <default>`
    // so a real, meaningful `0` (e.g. offsetX at dead center) isn't
    // mistaken for "unset" the way falsy-OR would treat it.
    patternUrl: apiItem.patternUrl ?? null,
    patternScale: apiItem.patternScale ?? 1,
    patternOffsetX: apiItem.patternOffsetX ?? 0,
    patternOffsetY: apiItem.patternOffsetY ?? 0,
    patternRotation: apiItem.patternRotation ?? 0,
    patternTint: apiItem.patternTint ?? false,
    createdAt: apiItem.createdAt,
  };
}

// Fields the backend's ItemRequest/ItemPatchRequest actually accept (see
// backend/internal/dto/item_dto.go). Anything else on a frontend item
// object (id, timesUsed, worn, createdAt, imageUrl, thumbnailUrl — all
// server-assigned/derived) must never be sent back up, hence the
// allowlist-style picking in both functions below rather than a spread.
const ITEM_WRITABLE_FIELDS = [
  "category", "name", "brand", "price", "purchaseDate", "expiryDate",
  "consumable", "inventoryPercent", "status", "notes", "color", "photo",
  "fit", "season", "occasion", "material", "size", "shade", "finish",
  "subtype", "cardStyle",
];

// Phase 5.1: pattern fields are deliberately NOT in ITEM_WRITABLE_FIELDS
// above. They're written through a separate, debounced path (see
// toItemPatternPatchPayload below + lib/StoreContext.jsx's
// setPatternStyle) so a slider drag never piggybacks a stale value off
// some unrelated in-progress edit, and so the "clear pattern" case stays
// one obvious code path instead of being folded into the generic
// allowlist copy every other field uses.
const PATTERN_FIELDS = ["patternUrl", "patternScale", "patternOffsetX", "patternOffsetY", "patternRotation", "patternTint"];

/**
 * OLD FRONTEND pattern-style patch -> BACKEND ItemPatchRequest payload,
 * pattern fields only.
 *
 * Mirrors dto.ItemPatchRequest.ClearPattern (backend/internal/dto/
 * item_dto.go): Go's `*string` can't distinguish "field omitted" from
 * "field sent as null" once JSON-decoded — both become a nil pointer. So
 * when the caller explicitly sets `patternUrl: null` (PatternControls.jsx's
 * "Remove" button goes through setPatternStyle the same as every other
 * pattern edit), this sends `clearPattern: true` alongside it rather than
 * relying on the bare null surviving the round trip on its own.
 */
export function toItemPatternPatchPayload(patternStyle = {}) {
  const fields = {};
  for (const key of PATTERN_FIELDS) {
    if (patternStyle[key] !== undefined) fields[key] = patternStyle[key];
  }
  if (Object.prototype.hasOwnProperty.call(patternStyle, "patternUrl") && patternStyle.patternUrl === null) {
    fields.clearPattern = true;
  }
  return fields;
}

/**
 * OLD FRONTEND partial item -> BACKEND create payload.
 *
 * Returns either a plain object (JSON create path — what every existing
 * "Add Item" flow produces today, since neither app/wardrobe/page.js nor
 * app/vanity/page.js's AddItemSheet has an image field) or, when
 * `partial.imageFile` is a real File (the shape a future file-input would
 * produce — see Phase 4.3 brief, section 8), a FormData instance so
 * lib/api/items.js's createItem() takes the multipart path instead. The
 * File is NEVER read into a data URL / base64 string here — it's
 * appended to FormData as-is so the browser handles the multipart
 * encoding, exactly as the brief requires.
 *
 * `color` is required + must be a hex string server-side
 * (binding:"required,hexcolor") — mkItem() already defaults it to
 * "#FFD9BE", so this only matters if a caller explicitly passes something
 * falsy.
 */
export function toItemCreatePayload(partial) {
  const { imageFile, ...rest } = partial || {};

  const fields = {};
  for (const key of ITEM_WRITABLE_FIELDS) {
    if (rest[key] !== undefined && rest[key] !== null) fields[key] = rest[key];
  }
  if (!fields.color) fields.color = "#FFD9BE"; // matches mkItem()'s default; backend requires a hex color
  if (fields.consumable === undefined) fields.consumable = false;

  const hasImageFile = typeof File !== "undefined" && imageFile instanceof File;
  if (!hasImageFile) return fields;

  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, typeof value === "boolean" ? String(value) : String(value));
  });
  formData.append("image", imageFile);
  return formData;
}

/**
 * OLD FRONTEND patch object -> BACKEND ItemPatchRequest payload.
 * `favorite` is patchable server-side but wasn't in the create allowlist
 * above (ItemRequest has no `favorite` field — new items always start
 * un-favorited, matching mkItem()'s default), so it's added back in here.
 */
export function toItemPatchPayload(patch) {
  const fields = {};
  for (const key of [...ITEM_WRITABLE_FIELDS, "favorite"]) {
    if (patch[key] !== undefined) fields[key] = patch[key];
  }
  return fields;
}

// ---------------------------------------------------------------------
// Outfits
// ---------------------------------------------------------------------

/** BACKEND OutfitResponse -> OLD FRONTEND outfit shape (already a 1:1 field match). */
export function toFrontendOutfit(apiOutfit) {
  return {
    id: apiOutfit.id,
    name: apiOutfit.name,
    emoji: apiOutfit.emoji,
    itemIds: apiOutfit.itemIds || [],
    createdAt: apiOutfit.createdAt,
  };
}

/**
 * OLD FRONTEND addOutfit(outfit) partial -> BACKEND OutfitRequest payload.
 * Old StoreContext.addOutfit() defaulted a caller-omitted name/emoji/
 * itemIds client-side (`{ id: uid("outfit"), name: "New outfit", emoji:
 * "✨", itemIds: [], ...outfit }`) rather than ever failing — OutfitRequest
 * requires `name` server-side, so those same defaults are applied here to
 * preserve that "never fails locally" behavior.
 */
export function toOutfitPayload(outfit = {}) {
  return {
    name: outfit.name || "New outfit",
    emoji: outfit.emoji || "✨",
    itemIds: outfit.itemIds || [],
  };
}

/**
 * OLD FRONTEND updateOutfit(id, patch) partial -> BACKEND
 * OutfitPatchRequest payload. Only sends fields the caller actually
 * provided, matching ItemPatchRequest-style partial-update semantics
 * (backend/internal/dto/item_dto.go's OutfitPatchRequest).
 */
export function toOutfitPatchPayload(patch = {}) {
  const fields = {};
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.emoji !== undefined) fields.emoji = patch.emoji;
  if (patch.itemIds !== undefined) fields.itemIds = patch.itemIds;
  return fields;
}

// ---------------------------------------------------------------------
// User / equipped
// ---------------------------------------------------------------------

/**
 * Pulls the doll's equipped-slot map off the backend's user object.
 * `user.equipped` comes from `dto.UserResponse` (see
 * backend/internal/dto/auth_dto.go and backend/internal/service/
 * auth_service.go's toUserResponse) — returned by login/signup/refresh/me
 * alike, so this works no matter which of those produced the current
 * user.
 */
export function equippedFromUser(user) {
  return (user && user.equipped) || {};
}

// Re-exported so callers building outfit/item defaults elsewhere don't
// need a second import for the one old helper they still need.
export { uid };
