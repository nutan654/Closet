export const CATEGORY_DEFS = {
  tops:        { label: "Tops",        room: "wardrobe", emoji: "👚" },
  bottoms:     { label: "Bottoms",     room: "wardrobe", emoji: "👖" },
  dresses:     { label: "Dresses",     room: "wardrobe", emoji: "👗" },
  outerwear:   { label: "Jackets",     room: "wardrobe", emoji: "🧥" },
  shoes:       { label: "Shoes",       room: "wardrobe", emoji: "👟" },
  bags:        { label: "Bags",        room: "wardrobe", emoji: "👜" },
  accessories: { label: "Accessories", room: "wardrobe", emoji: "🧣" },
  skincare:    { label: "Skincare",    room: "vanity",   emoji: "🧴" },
  makeup:      { label: "Makeup",      room: "vanity",   emoji: "💄" },
  haircare:    { label: "Haircare",    room: "vanity",   emoji: "🧴" },
  fragrance:   { label: "Fragrance",   room: "vanity",   emoji: "🌸" },
  jewelry:     { label: "Jewelry",     room: "vanity",   emoji: "💍" },
  supplements: { label: "Supplements", room: "vanity",   emoji: "💊" },
};

export const ROOM_CATEGORIES = {
  wardrobe: Object.keys(CATEGORY_DEFS).filter((k) => CATEGORY_DEFS[k].room === "wardrobe"),
  vanity: Object.keys(CATEGORY_DEFS).filter((k) => CATEGORY_DEFS[k].room === "vanity"),
};

// Fit/length variants per clothing slot — this is the hook the Doll layers
// read from to pick a silhouette. Texture fills come in a later pass;
// for now each fit maps to a distinct SVG path shape.
export const FIT_OPTIONS = {
  tops: ["Regular", "Oversized", "Fitted", "Cropped"],
  bottoms: ["Regular", "Wide leg", "Skinny", "Shorts"],
  dresses: ["Regular", "Wrap", "Slip", "A-line"],
  outerwear: ["Regular", "Oversized", "Cropped"],
};

// Phase 5 — silhouette subtype per clothing category (see
// lib/doll/garmentShapes.js for the actual SVG paths). This is a
// frontend/doll-rendering concept layered on top of the backend's
// existing free-text `subtype` field (backend/internal/dto/item_dto.go —
// already writable/persisted, no schema change needed); it is NOT a new
// database column. The first entry in each list is that category's
// default when an item has no subtype set yet (e.g. items created before
// this phase).
export const GARMENT_SUBTYPES = {
  tops: ["T-Shirt", "Shirt", "Top"],
  bottoms: ["Pants", "Skirt", "Shorts"],
  outerwear: ["Jacket", "Blazer", "Coat"],
};

export const SEASON_OPTIONS = ["All season", "Summer", "Winter", "Monsoon"];
export const OCCASION_OPTIONS = ["Casual", "Office", "Party", "Ethnic", "Workout", "Sleep", "Travel"];
export const JEWELRY_SUBTYPES = ["Ring", "Earrings", "Necklace", "Bracelet", "Watch"];

export const DOLL_SLOTS = ["dresses", "tops", "bottoms", "outerwear", "shoes", "bags", "accessories"];

export const CARD_STYLES = {
  classic: { label: "Classic", border: "#F2E4DC", glow: false },
  holo:    { label: "Holo", border: "linear-gradient(135deg,#FFD3E0,#E4D9F0,#BFD1BE)", glow: true },
  gold:    { label: "Gold foil", border: "linear-gradient(135deg,#FFD9BE,#FFC29B)", glow: true },
  sage:    { label: "Sage rare", border: "linear-gradient(135deg,#BFD1BE,#9DBE9B)", glow: false },
};
