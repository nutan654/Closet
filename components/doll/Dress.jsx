"use client";

import GarmentRenderer from "./GarmentRenderer";

/**
 * See Tops.jsx's file-level comment — same wrapper pattern. Dresses don't
 * have a separate "subtype" concept the way tops/bottoms/outerwear do
 * (the brief's dress requirement is "single continuous garment, waist/
 * skirt shape" — one silhouette family, not several unrelated ones), so
 * `fit` (Regular/Wrap/Slip/A-line) doubles as the shape key directly —
 * see lib/doll/garmentShapes.js's `dresses` entries, which are keyed by
 * fit name for exactly this reason.
 */
export default function Dress({
  color,
  fit = "Regular",
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
      category="dresses"
      subtype={fit}
      fit={fit}
      color={color}
      instanceId={id}
      patternStyle={{ patternUrl, patternScale, patternOffsetX, patternOffsetY, patternRotation, patternTint }}
    />
  );
}
