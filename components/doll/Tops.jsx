"use client";

import GarmentRenderer from "./GarmentRenderer";

/**
 * Thin wrapper: category-specific defaults + prop-shape adapter over the
 * shared GarmentRenderer (see components/doll/GarmentRenderer.jsx and the
 * brief's "GarmentRenderer used by GarmentPreview and Doll" architecture,
 * section 15/16). Kept as its own file (rather than inlining `category="tops"`
 * everywhere) so Doll.jsx and GarmentPreview.jsx keep the exact same
 * `<Tops color fit .../>` call shape they always have — this is a
 * backward-compatible superset of the old props, not a breaking change.
 *
 * New optional props beyond the original (color, fit): `subtype` picks the
 * silhouette (T-Shirt/Shirt/Top — see lib/doll/garmentShapes.js, defaults
 * to "T-Shirt"), `id` scopes pattern <defs> ids per wardrobe item, and the
 * `pattern*` props carry the fabric texture (see lib/doll/pattern.js).
 */
export default function Tops({
  color,
  fit = "Regular",
  subtype = "T-Shirt",
  id,
  patternUrl,
  patternScale,
  patternOffsetX,
  patternOffsetY,
  patternRotation,
  patternTint,
}) {
  if (!color && !patternUrl) return null;
  return (
    <GarmentRenderer
      category="tops"
      subtype={subtype}
      fit={fit}
      color={color}
      instanceId={id}
      patternStyle={{ patternUrl, patternScale, patternOffsetX, patternOffsetY, patternRotation, patternTint }}
    />
  );
}
