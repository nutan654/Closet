"use client";

import GarmentRenderer from "./GarmentRenderer";

/** See Tops.jsx's file-level comment — same wrapper pattern. Default subtype is "Jacket". */
export default function Outerwear({
  color,
  fit = "Regular",
  subtype = "Jacket",
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
      category="outerwear"
      subtype={subtype}
      fit={fit}
      color={color}
      instanceId={id}
      patternStyle={{ patternUrl, patternScale, patternOffsetX, patternOffsetY, patternRotation, patternTint }}
    />
  );
}
