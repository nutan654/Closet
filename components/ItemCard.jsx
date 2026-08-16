"use client";

import { motion } from "framer-motion";
import { CATEGORY_DEFS, CARD_STYLES } from "@/lib/constants";
import GarmentPreview from "./GarmentPreview";

export default function ItemCard({ item, onClick }) {
  const cat = CATEGORY_DEFS[item.category];
  const style = CARD_STYLES[item.cardStyle] || CARD_STYLES.classic;

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={`relative w-full rounded-lg p-[3px] text-left ${style.glow ? "shadow-md" : "shadow-sm"}`}
      style={{ background: style.border }}
    >
      <div className="rounded-[15px] bg-cream p-3 h-full">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-label font-semibold text-plum-soft uppercase tracking-wide">
            {cat?.label}
          </span>
          {item.favorite && <span className="text-pink-deep text-xs">♥</span>}
        </div>

        <div
          className="w-full aspect-square rounded-md grid place-items-center text-4xl mb-2.5 relative overflow-hidden"
          style={
            // No photo, but this item has a fabric pattern (from
            // PatternControls' "Upload fabric photo" — item.patternUrl,
            // never the same field as item.photo): tile the processed
            // fabric texture as the card's own background instead of the
            // usual flat color wash, so the card itself looks like the
            // fabric. A photographed item keeps its photo as the source
            // of truth; the small corner swatch below still shows the
            // pattern in that case.
            !item.photo && item.patternUrl
              ? { backgroundImage: `url(${item.patternUrl})`, backgroundSize: "56px 56px", backgroundRepeat: "repeat" }
              : { background: `linear-gradient(160deg, ${item.color}2E, ${item.color}12)` }
          }
        >
          {item.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photo} alt="" className="w-full h-full object-cover" />
          ) : item.patternUrl ? null : ["tops", "bottoms", "dresses", "outerwear"].includes(item.category) ? (
            <GarmentPreview item={item} className="w-[78%] h-[78%]" />
          ) : (
            <span>{cat?.emoji}</span>
          )}
          {/*
            Tint overlay — mirrors GarmentRenderer's "pattern-tint" fill
            mode exactly (mix-blend-mode:multiply, opacity 0.55), so the
            card matches what the doll actually shows. Without this, the
            card's CSS background was always the raw, untinted fabric
            photo — noticeably lighter than the tinted garment once
            patternTint + a darker color are chosen, since the tint pass
            never ran here at all, only on the doll.
          */}
          {!item.photo && item.patternUrl && item.patternTint && item.color && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ backgroundColor: item.color, mixBlendMode: "multiply", opacity: 0.55 }}
            />
          )}
          {style.glow && (
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-white/10 pointer-events-none" />
          )}
          {/*
            Pattern swatch badge — only ever for item.patternUrl (the
            fabric), never for item.photo. Shown whenever a pattern
            exists, even when it's already the full background above, so
            it's consistently in the same corner as a quick "this piece
            has a custom fabric" indicator once a photo is also present.
          */}
          {item.patternUrl && item.photo && (
            <div
              className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-sm border-2 border-white shadow-sm overflow-hidden"
              style={{ backgroundImage: `url(${item.patternUrl})`, backgroundSize: "cover" }}
              title="Custom fabric"
            >
              {item.patternTint && item.color && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ backgroundColor: item.color, mixBlendMode: "multiply", opacity: 0.55 }}
                />
              )}
            </div>
          )}
        </div>

        <div className="font-heading-serif font-semibold text-[15px] leading-tight truncate text-plum">
          {item.name}
        </div>
        <div className="text-xs text-plum-soft truncate font-label">{item.brand || "Unbranded"}</div>

        <div className="flex items-center gap-2 mt-1.5">
          {item.fit && (
            <span className="text-[10px] font-label text-plum-soft bg-lavender/40 px-2 py-0.5 rounded-pill">
              {item.fit}
            </span>
          )}
          <span
            className="w-3.5 h-3.5 rounded-full border border-white shadow-sm shrink-0"
            style={{ background: item.color }}
            title={item.color}
          />
          {item.worn > 0 && (
            <span className="text-[10px] font-label text-plum-soft ml-auto">Worn {item.worn}×</span>
          )}
        </div>
      </div>
    </motion.button>
  );
}
