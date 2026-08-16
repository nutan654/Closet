"use client";

import { DOLL_SLOTS, CATEGORY_DEFS } from "@/lib/constants";

/**
 * components/EquippedStrip.jsx
 *
 * A column of small circles running down the left edge of the doll card,
 * one per currently-equipped slot (DOLL_SLOTS — dresses/tops/bottoms/
 * outerwear/shoes/bags/accessories), each showing that item's own photo
 * (falling back to a color swatch, then the category emoji) plus its name
 * underneath in a small italic "fairy" caption — so at a glance you can
 * see exactly what the doll is wearing without opening the wardrobe grid.
 *
 * Purely presentational / read-only: it renders `equipped` (the same
 * resolved map WardrobePage already builds via resolveEquipped()), it
 * never mutates anything itself.
 */
export default function EquippedStrip({ equipped = {} }) {
  const worn = DOLL_SLOTS.map((slot) => ({ slot, item: equipped[slot] })).filter((s) => s.item);

  if (!worn.length) return null;

  return (
    <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-3 max-h-[85%] overflow-y-auto pr-1">
      {worn.map(({ slot, item }) => (
        <div key={slot} className="flex flex-col items-center w-14 shrink-0" title={item.name}>
          <div
            className="w-11 h-11 rounded-full overflow-hidden bg-white border-2 border-white shadow-md grid place-items-center shrink-0"
            style={{ boxShadow: "0 2px 8px rgba(91, 62, 74, 0.18)" }}
          >
            {item.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.photo} alt="" className="w-full h-full object-cover" />
            ) : (
              <span
                className="w-full h-full grid place-items-center text-base"
                style={{ background: `linear-gradient(160deg, ${item.color}55, ${item.color}22)` }}
              >
                {CATEGORY_DEFS[slot]?.emoji}
              </span>
            )}
          </div>
          <span className="mt-1 font-heading-serif italic text-[10px] leading-tight text-plum text-center truncate w-full">
            {item.name}
          </span>
        </div>
      ))}
    </div>
  );
}
