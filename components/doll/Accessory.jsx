"use client";

/**
 * components/doll/Accessory.jsx
 *
 * Same gap as Bag.jsx: "accessories" (scarves, belts, hats — see
 * GARMENT_SUBTYPES / CATEGORY_DEFS) was a real, equippable wardrobe slot
 * with zero doll representation. This draws a simple neck scarf so an
 * equipped accessory is actually visible, rather than only ever showing
 * up in the wardrobe grid.
 *
 * Solid-fill only, same reasoning as Bag.jsx — this is a small accent
 * shape, not a full garment run through the pattern pipeline.
 */
export default function Accessory({ color }) {
  if (!color) return null;
  return (
    <g>
      <path d="M62 88 Q75 100 88 88 Q86 96 75 98 Q64 96 62 88 Z" fill={color} />
      {/* trailing tail of the scarf */}
      <path d="M78 96 Q83 106 80 116 Q76 108 74 98 Z" fill={color} />
    </g>
  );
}
