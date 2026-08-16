/**
 * lib/doll/garmentShapes.js
 *
 * Category+subtype -> SVG silhouette registry (Phase 5 brief, section 3:
 * "A T-shirt should NOT visually have the same silhouette as a shirt,
 * top, jacket, dress, skirt"). This is the data GarmentRenderer draws
 * from; it contains no rendering logic itself, just path strings, so it's
 * easy to review/extend without touching React.
 *
 * Coordinate system: the doll's fixed 150x210 SVG viewBox (see
 * components/doll/Doll.jsx) — torso roughly y 68-140, legs y 140-190.
 * Every subtype gets its own base ("Regular" fit) path(s); a `fit`
 * (Oversized/Fitted/Cropped/Wide leg/Skinny) is then applied as a light
 * scale transform around a per-category anchor point rather than a fully
 * hand-drawn path for every subtype x fit combination — per the brief's
 * "a reliable deterministic implementation is better than a complicated
 * unreliable one," distinct silhouette-per-subtype is the important
 * visual signal; fit-driven volume is a secondary, cheaper modifier on
 * top of it.
 *
 * Falls back gracefully: an unknown subtype uses the category's first
 * registered subtype rather than rendering nothing, so a bad/legacy
 * subtype value never blanks the doll.
 */

export const GARMENT_SHAPES = Object.freeze({
  tops: {
    "T-Shirt": {
      // Relaxed body + short cap sleeves + simple round neckline.
      paths: [
        "M56 94 Q75 85 94 94 L96 130 Q75 137 54 130 Z", // body
        "M56 94 L44 100 L48 112 L58 104 Z", // left cap sleeve
        "M94 94 L106 100 L102 112 L92 104 Z", // right cap sleeve
      ],
      neckline: "M64 88 Q75 96 86 88", // decorative-only, drawn in a darker shade of the same fill by GarmentRenderer
    },
    Shirt: {
      // Collar, longer sleeves with cuffs, boxier hem — a "shirt", not a tee.
      paths: [
        "M57 92 Q75 84 93 92 L95 134 Q75 141 55 134 Z", // body
        "M57 92 L40 98 L43 122 L52 126 L58 108 Z", // left sleeve (longer, tapered cuff)
        "M93 92 L110 98 L107 122 L98 126 L92 108 Z", // right sleeve
        "M67 86 L75 94 L83 86 L79 82 L71 82 Z", // pointed collar
      ],
    },
    Top: {
      // Fitted, cropped hem, scoop neckline, no sleeves (camisole-adjacent).
      paths: [
        "M60 94 Q75 87 90 94 L92 120 Q75 126 58 120 Z", // body, short hem
        "M60 94 L56 100 L61 104 Z", // left strap hint
        "M90 94 L94 100 L89 104 Z", // right strap hint
      ],
    },
  },

  bottoms: {
    Pants: {
      // Two separate tapered legs with a visible inseam gap — the thing
      // that reads as "pants" rather than "skirt" at a glance.
      paths: [
        "M54 130 L71 130 L69 186 L58 186 Z", // left leg
        "M79 130 L96 130 L92 186 L81 186 Z", // right leg
      ],
    },
    Skirt: {
      // Single continuous lower garment, no leg split, flares at the hem.
      paths: ["M54 130 Q75 137 96 130 L102 162 Q75 174 48 162 Z"],
    },
    Shorts: {
      // Same leg-split silhouette as Pants but a short hem.
      paths: [
        "M54 130 L71 130 L69 146 L58 146 Z",
        "M79 130 L96 130 L92 146 L81 146 Z",
      ],
    },
    "Wide leg": {
      paths: [
        "M52 130 L72 130 L74 186 L58 186 Z",
        "M78 130 L98 130 L92 186 L76 186 Z",
      ],
    },
    Skinny: {
      paths: [
        "M58 130 L70 130 L67 184 L60 184 Z",
        "M80 130 L92 130 L90 184 L83 184 Z",
      ],
    },
  },

  outerwear: {
    Jacket: {
      // Open over a top: a back/shoulder yoke joins the two sleeve
      // panels at the top edge so the garment reads as one connected
      // piece (worn open down the front, not two floating slabs).
      paths: [
        "M58 93 L92 93 L94 100 L58 100 Z", // shoulder yoke, bridges the two panels
        "M50 95 L40 130 L52 135 L58 100 Z", // left panel + sleeve
        "M100 95 L110 130 L98 135 L92 100 Z", // right panel + sleeve
      ],
    },
    Blazer: {
      // Narrower, more structured than Jacket, with a lapel notch.
      paths: [
        "M58 91 L92 91 L94 99 L58 99 Z", // shoulder yoke
        "M52 94 L44 128 L54 132 L58 99 Z",
        "M98 94 L106 128 L96 132 L92 99 Z",
        "M68 90 L75 100 L70 108 L64 92 Z", // left lapel
        "M82 90 L75 100 L80 108 L86 92 Z", // right lapel
      ],
    },
    Coat: {
      // Same open-panel idea as Jacket, extended well past the hip.
      paths: [
        "M58 92 L92 92 L94 100 L58 100 Z", // shoulder yoke
        "M48 94 L36 148 L50 154 L58 100 Z",
        "M102 94 L114 148 L100 154 L92 100 Z",
      ],
    },
  },

  dresses: {
    Regular: { paths: ["M55 92 Q75 82 95 92 L102 158 Q75 168 48 158 Z"] },
    Wrap: {
      paths: [
        "M55 92 Q75 82 95 92 L100 158 Q75 166 50 158 Z", // body, now closed
        "M73 100 L77 100 L71 154 L68 153 Z", // wrap tie, given real width so it's visible when filled
      ],
    },
    Slip: { paths: ["M58 93 Q75 86 92 93 L96 160 Q75 168 54 160 Z"] },
    "A-line": { paths: ["M55 92 Q75 82 95 92 L110 160 Q75 172 40 160 Z"] },
  },
});

// Fit is applied as a light scale transform around a per-category anchor
// point, layered on top of whichever subtype silhouette was chosen —
// see lib/doll/garmentTransform.js.
export const FIT_SCALE = Object.freeze({
  Regular: 1,
  Oversized: 1.12,
  Fitted: 0.93,
  Cropped: 0.9,
  "Wide leg": 1,
  Skinny: 1,
  "A-line": 1,
  Wrap: 1,
  Slip: 1,
});

export const CATEGORY_ANCHOR = Object.freeze({
  tops: { x: 75, y: 110 },
  bottoms: { x: 75, y: 150 },
  outerwear: { x: 75, y: 115 },
  dresses: { x: 75, y: 120 },
});

/** First registered subtype for a category — used as the fallback default. */
export function defaultSubtype(category) {
  const entries = GARMENT_SHAPES[category];
  if (!entries) return null;
  return Object.keys(entries)[0] || null;
}

/**
 * Resolves the shape entry for a category+subtype, falling back to the
 * category's default subtype (never to nothing) so an unrecognized or
 * legacy subtype value still renders a silhouette instead of a blank doll.
 */
export function resolveShape(category, subtype) {
  const entries = GARMENT_SHAPES[category];
  if (!entries) return null;
  return entries[subtype] || entries[defaultSubtype(category)] || null;
}

export function fitScale(fit) {
  return FIT_SCALE[fit] ?? 1;
}

export function categoryAnchor(category) {
  return CATEGORY_ANCHOR[category] || { x: 75, y: 105 };
}
