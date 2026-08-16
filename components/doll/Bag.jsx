"use client";

/**
 * components/doll/Bag.jsx
 *
 * Bags were a real wardrobe category (lib/constants.js's CATEGORY_DEFS /
 * DOLL_SLOTS) that Doll.jsx never actually drew — equipping a bag saved
 * fine and showed up in the wardrobe grid, but nothing changed on the
 * doll, so it silently looked like equipping did nothing. This gives bags
 * an actual silhouette: a small shoulder bag resting on the hip, with a
 * strap running up to the shoulder, so "equipped" is visibly true.
 *
 * Deliberately solid-fill only (no pattern/tint system) to match the
 * scope of the other accessory-tier slots (jewelry) rather than pulling
 * bags into the full GarmentRenderer pattern pipeline built for
 * clothing — see Accessory.jsx for the same choice.
 */
export default function Bag({ color }) {
  if (!color) return null;
  return (
    <g>
      {/* strap, shoulder to hip */}
      <path d="M100 78 Q112 100 108 122" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* body of the bag */}
      <rect x="96" y="120" width="24" height="22" rx="6" fill={color} />
      {/* flap stitch detail */}
      <path d="M98 128 H118" stroke="#00000022" strokeWidth="1.4" />
      {/* clasp */}
      <circle cx="108" cy="124" r="1.6" fill="#00000033" />
    </g>
  );
}
