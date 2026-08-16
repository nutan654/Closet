/**
 * lib/doll/layers.js
 *
 * Single source of truth for the doll's front-to-back layer order (Phase 5,
 * brief section 5: "Create a central layer-order definition rather than
 * hardcoding z-index values across components").
 *
 * SVG has no z-index property — stacking is purely document order, later
 * elements paint on top of earlier ones. So "layer order" here just means
 * "the order Doll.jsx renders these pieces in." Doll.jsx should read this
 * array rather than hardcoding the sequence, so adding a future layer
 * (e.g. "necklace" above outerwear but below hairFront) is a one-line
 * change here instead of a scavenger hunt through Doll.jsx.
 */

export const LAYER = Object.freeze({
  HAIR_BACK: "hairBack",
  BODY: "body",
  TOP: "top", // shirt/tee/top — mutually exclusive with DRESS
  BOTTOM: "bottom", // pants/skirt — painted after TOP, so a tucked-in hem reads correctly under the waistband
  DRESS: "dress", // mutually exclusive with TOP + BOTTOM
  OUTERWEAR: "outerwear", // jacket/blazer — always renders above tops/dresses
  ACCESSORIES: "accessories", // necklaces sitting on top of clothing
  FACE: "face",
  HAIR_FRONT: "hairFront",
  JEWELRY: "jewelry", // earrings/rings drawn last, above hair/face
});

// The actual front-to-back paint order — matches Doll.jsx exactly (this
// is documentation-and-tests of the existing, preserved doll rendering
// order, not a change to it: brief section 4 says not to alter the
// existing doll's visual identity). Doll.jsx's JSX order is the source of
// truth; this array must be kept in sync with it.
export const LAYER_ORDER = [
  LAYER.HAIR_BACK,
  LAYER.BODY,
  LAYER.TOP,
  LAYER.BOTTOM,
  LAYER.DRESS,
  LAYER.OUTERWEAR,
  LAYER.ACCESSORIES,
  LAYER.FACE,
  LAYER.HAIR_FRONT,
  LAYER.JEWELRY,
];

/** Index lookup, useful for tests/assertions ("jacket must paint after shirt"). */
export function layerIndex(layer) {
  return LAYER_ORDER.indexOf(layer);
}

/** True if `above` paints strictly after (on top of) `below`. */
export function isAbove(above, below) {
  const a = layerIndex(above);
  const b = layerIndex(below);
  if (a === -1 || b === -1) return false;
  return a > b;
}

// Maps a wardrobe item's `category` (backend enum — see
// backend/internal/dto/item_dto.go's `oneof=` validator) onto the doll
// layer it occupies. Categories with no doll silhouette (shoes live on
// Body, bags/accessories/jewelry/vanity categories) are intentionally
// absent — GarmentPreview/ItemCard already fall back to an emoji for
// those (see components/GarmentPreview.jsx).
export const CATEGORY_LAYER = Object.freeze({
  tops: LAYER.TOP,
  bottoms: LAYER.BOTTOM,
  dresses: LAYER.DRESS,
  outerwear: LAYER.OUTERWEAR,
});
