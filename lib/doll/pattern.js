/**
 * lib/doll/pattern.js
 *
 * Pure, framework-free math for applying a repeating fabric texture to a
 * garment shape (Phase 5 brief, sections 9-11). No rendering here — this
 * just computes the numbers GarmentRenderer feeds into an SVG <pattern>
 * element. Kept separate from GarmentRenderer.jsx specifically so it's
 * trivially unit-testable without React or a DOM (see
 * lib/doll/__tests__/pattern.test.js).
 *
 * How the actual "clipped to garment silhouette" requirement (section 11)
 * is satisfied: GarmentRenderer fills an SVG <path> with `fill="url(#..)"`
 * pointing at a <pattern>. SVG patterns are inherently clipped to
 * whatever shape they fill — there is no separate clip-path step needed,
 * which is exactly the "prefer SVG so the fabric naturally follows the
 * garment shape" approach the brief calls out over pasting a rectangular
 * image on top.
 */

// Sane bounds so a malformed/absent value never produces a broken or
// invisible pattern (division by zero, negative tile size, etc.) — see
// tests for "malformed pattern input" (brief section 21, item 12).
export const PATTERN_SCALE_MIN = 0.25;
export const PATTERN_SCALE_MAX = 4;
export const PATTERN_BASE_TILE_PX = 40; // size (in the doll's 150x210 viewBox units) of one tile at scale=1

export const DEFAULT_PATTERN_STYLE = Object.freeze({
  patternUrl: null,
  patternScale: 1,
  patternOffsetX: 0,
  patternOffsetY: 0,
  patternRotation: 0,
  patternTint: false, // when true + a color is set, overlay color as a multiply tint on top of the texture
});

function toFiniteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Clamps/normalizes a raw (possibly partial, possibly malformed) pattern
 * style object into one that's always safe to render. Every field is
 * independently defaulted, so passing `{}`, `null`, or a style with a
 * garbage `patternScale: "banana"` all resolve to sane output instead of
 * throwing or rendering a broken pattern.
 */
export function normalizePatternStyle(style) {
  const s = style || {};
  const scale = clampScale(toFiniteNumber(s.patternScale, DEFAULT_PATTERN_STYLE.patternScale));
  return {
    patternUrl: typeof s.patternUrl === "string" && s.patternUrl.length > 0 ? s.patternUrl : null,
    patternScale: scale,
    patternOffsetX: toFiniteNumber(s.patternOffsetX, DEFAULT_PATTERN_STYLE.patternOffsetX),
    patternOffsetY: toFiniteNumber(s.patternOffsetY, DEFAULT_PATTERN_STYLE.patternOffsetY),
    patternRotation: ((toFiniteNumber(s.patternRotation, DEFAULT_PATTERN_STYLE.patternRotation) % 360) + 360) % 360,
    patternTint: Boolean(s.patternTint),
  };
}

export function clampScale(scale) {
  return Math.min(PATTERN_SCALE_MAX, Math.max(PATTERN_SCALE_MIN, scale));
}

/**
 * Produces the props GarmentRenderer spreads onto an SVG <pattern>
 * element: tile width/height (in viewBox units) and a patternTransform
 * string encoding offset + rotation. `patternUnits="userSpaceOnUse"` is
 * assumed (set by GarmentRenderer), so these are absolute viewBox units,
 * not 0-1 fractions.
 */
export function computePatternTransform(rawStyle) {
  const style = normalizePatternStyle(rawStyle);
  const tileSize = PATTERN_BASE_TILE_PX * style.patternScale;

  const transformParts = [];
  if (style.patternOffsetX !== 0 || style.patternOffsetY !== 0) {
    transformParts.push(`translate(${style.patternOffsetX} ${style.patternOffsetY})`);
  }
  if (style.patternRotation !== 0) {
    // Rotate around the tile's own center so rotation reads naturally
    // rather than swinging the whole pattern off-canvas.
    transformParts.push(`rotate(${style.patternRotation} ${tileSize / 2} ${tileSize / 2})`);
  }

  return {
    width: tileSize,
    height: tileSize,
    patternTransform: transformParts.length ? transformParts.join(" ") : undefined,
  };
}

/** A short, collision-resistant id suffix for scoping <defs> ids per garment instance. */
export function patternDefsId(instanceId, category) {
  const safe = String(instanceId || "anon").replace(/[^a-zA-Z0-9_-]/g, "");
  return `pat-${category}-${safe}`;
}

/**
 * Decides which fill to use for a garment path: solid color, pattern, or
 * pattern (base fill references the <pattern> element by id; the caller
 * is responsible for actually defining that <pattern> in <defs> — see
 * GarmentRenderer). Centralizing this decision keeps GarmentRenderer's
 * JSX simple and keeps the "solid vs pattern vs pattern+tint" branching
 * (brief section 10) in one tested place.
 */
export function resolveFillMode(rawStyle) {
  const style = normalizePatternStyle(rawStyle);
  if (!style.patternUrl) return "solid";
  return style.patternTint ? "pattern-tint" : "pattern";
}
