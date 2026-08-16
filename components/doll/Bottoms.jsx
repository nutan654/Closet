"use client";

import GarmentRenderer from "./GarmentRenderer";

/** See Tops.jsx's file-level comment — same wrapper pattern. Default subtype is "Pants". */
export default function Bottoms({
  color,
  fit = "Regular",
  subtype = "Pants",
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
      category="bottoms"
      subtype={subtype}
      fit={fit}
      color={color}
      instanceId={id}
      patternStyle={{ patternUrl, patternScale, patternOffsetX, patternOffsetY, patternRotation, patternTint }}
    />
  );
}
