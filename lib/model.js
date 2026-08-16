export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const d1 = new Date(a), d2 = new Date(b);
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

export function mkItem(partial = {}) {
  const now = todayISO();
  return {
    id: uid("item"),
    category: "tops",
    name: "Untitled item",
    brand: "",
    price: 0,
    purchaseDate: now,
    expiryDate: null,
    consumable: false,
    inventoryPercent: 100,
    timesUsed: 0,
    status: "clean",
    notes: "",
    color: "#FFD9BE",
    photo: null,
    worn: 0,
    favorite: false,
    // clothing-specific
    fit: "Regular",
    season: "",
    occasion: "",
    material: "",
    size: "",
    // beauty-specific
    shade: "",
    finish: "",
    subtype: "",
    cardStyle: "classic",
    // --- Pattern styling (fabric texture on tops/bottoms/dresses/
    // outerwear). Phase 5.1 update: these fields ARE now persisted —
    // lib/StoreContext.jsx's setPatternStyle() sends a debounced PATCH to
    // the Go backend (backend/internal/dto/item_dto.go's
    // ItemPatchRequest, migration 0003_item_patterns.up.sql) after every
    // local edit, so a reload no longer loses fabric styling. (An earlier
    // Phase 5 version of this comment said these fields were
    // frontend-only/session-only — that's what "pattern-persistence-
    // fixed" fixed; see PHASE5_1_VERIFIED_CHANGELOG.md.)
    patternUrl: null,
    patternScale: 1,
    patternOffsetX: 0,
    patternOffsetY: 0,
    patternRotation: 0,
    patternTint: false,
    createdAt: now,
    ...partial,
  };
}

// A brand new name starts here — nothing carried over from anyone else.
export function blankProfile() {
  return {
    items: [],
    outfits: [],
    routines: [],
    journal: [],
    settings: { equipped: {} },
  };
}

export function seedData() {
  const items = [
    mkItem({ category: "tops", name: "Oversized White Shirt", brand: "Uniqlo", color: "#FFFBF6", fit: "Oversized", worn: 22 }),
    mkItem({ category: "bottoms", name: "Straight Blue Jeans", brand: "Levi's", color: "#8FA8C9", fit: "Regular", worn: 30 }),
    mkItem({ category: "shoes", name: "White Sneakers", brand: "Nike", color: "#F4F1EA", worn: 18 }),
    mkItem({ category: "dresses", name: "Sage Wrap Dress", brand: "H&M", color: "#BFD1BE", fit: "Wrap", worn: 4, cardStyle: "holo" }),
    mkItem({ category: "skincare", name: "Snail Mucin Essence", brand: "COSRX", color: "#D9C7B8", consumable: true, inventoryPercent: 55, timesUsed: 40 }),
    mkItem({ category: "makeup", name: "Rare Beauty Blush", brand: "Rare Beauty", color: "#FFD3E0", consumable: true, inventoryPercent: 70, timesUsed: 12, shade: "Happy", finish: "Dewy", cardStyle: "gold" }),
    mkItem({ category: "makeup", name: "Soft Matte Lip Tint", brand: "Rom&nd", color: "#C9707A", consumable: true, inventoryPercent: 62, timesUsed: 20, shade: "Rose", finish: "Matte" }),
    mkItem({ category: "jewelry", name: "Silver Hoop Earrings", brand: "Tarinika", color: "#E4D9F0", subtype: "Earrings", worn: 9 }),
  ];

  return {
    items,
    outfits: [],
    routines: [],
    journal: [],
    settings: { equipped: {}, displayName: "you" },
  };
}
