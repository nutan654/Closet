"use client";

/**
 * components/doll/GarmentRenderer.jsx
 *
 * The one place that turns (category, subtype, fit, color, pattern) into
 * actual SVG markup. Every category-specific component (Tops, Bottoms,
 * Outerwear, Dress) is now a thin wrapper around this — per the brief,
 * section 15/25:
 *
 *   Doll ──┐
 *          ├──> GarmentRenderer ──> shape (garmentShapes.js) + fill (solid/pattern/tint)
 *   GarmentPreview ──┘
 *
 * so the doll and the card thumbnail can never visually diverge (they
 * call the literal same component with the literal same props).
 *
 * Fill modes (brief section 10):
 *   - solid:        <path fill={color}>
 *   - pattern:       <path fill="url(#pattern-id)">, pattern's <image> is the fabric photo
 *   - pattern-tint:  pattern fill, plus a second identical path painted
 *                     with the chosen color at mix-blend-mode:multiply,
 *                     so the fabric shows through tinted rather than
 *                     replaced.
 *
 * Clipping to the garment silhouette (brief section 11) needs no explicit
 * clip-path: filling an SVG <path> with a <pattern> is inherently bounded
 * by that path's geometry.
 */

import { useId } from "react";
import { resolveShape, fitScale, categoryAnchor } from "@/lib/doll/garmentShapes";
import { computePatternTransform, normalizePatternStyle, resolveFillMode, patternDefsId } from "@/lib/doll/pattern";

/**
 * @param {string} category - "tops" | "bottoms" | "outerwear" | "dresses"
 * @param {string} [subtype] - e.g. "T-Shirt", "Shirt", "Top", "Pants", "Skirt", "Jacket"...
 * @param {string} [fit] - "Regular" | "Oversized" | "Fitted" | "Cropped" | ...
 * @param {string} [color] - solid fallback / tint color
 * @param {string} [instanceId] - stable unique id (e.g. the wardrobe item's id) so multiple
 *        garments rendered simultaneously on the doll never collide on SVG <defs> ids
 * @param {object} [patternStyle] - { patternUrl, patternScale, patternOffsetX, patternOffsetY, patternRotation, patternTint }
 */
export default function GarmentRenderer({ category, subtype, fit = "Regular", color, instanceId, patternStyle }) {
  const reactId = useId();
  if (!color && !patternStyle?.patternUrl) return null;

  const shape = resolveShape(category, subtype);
  if (!shape) return null;

  const scale = fitScale(fit);
  const anchor = categoryAnchor(category);
  const groupTransform =
    scale !== 1 ? `translate(${anchor.x} ${anchor.y}) scale(${scale}) translate(${-anchor.x} ${-anchor.y})` : undefined;

  const style = normalizePatternStyle(patternStyle);
  const fillMode = resolveFillMode(style);
  const defsId = patternDefsId(instanceId || reactId, category);

  if (fillMode === "solid") {
    return (
      <g transform={groupTransform}>
        {shape.paths.map((d, i) => (
          <path key={i} d={d} fill={color} />
        ))}
      </g>
    );
  }

  // pattern or pattern-tint: both need the <pattern> def; tint adds one
  // extra multiply-blended pass using the same path geometry.
  const { width, height, patternTransform } = computePatternTransform(style);

  return (
    <g transform={groupTransform}>
      <defs>
        <pattern
          id={defsId}
          patternUnits="userSpaceOnUse"
          width={width}
          height={height}
          patternTransform={patternTransform}
        >
          {/* preserveAspectRatio=slice keeps the source photo filling the
              tile (cropping rather than squashing) regardless of its
              original aspect ratio. */}
          <image href={style.patternUrl} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
        </pattern>
      </defs>
      {shape.paths.map((d, i) => (
        <path key={i} d={d} fill={`url(#${defsId})`} />
      ))}
      {fillMode === "pattern-tint" && color && (
        <g style={{ mixBlendMode: "multiply" }} opacity={0.55}>
          {shape.paths.map((d, i) => (
            <path key={`tint-${i}`} d={d} fill={color} />
          ))}
        </g>
      )}
    </g>
  );
}
