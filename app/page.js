"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/StoreContext";
import { CATEGORY_DEFS } from "@/lib/constants";
import TopBar from "@/components/TopBar";
import Doll from "@/components/doll/Doll";
import Button from "@/components/ui/Button";
import SaveOutfitSheet from "@/components/SaveOutfitSheet";

function resolveEquipped(data) {
  const eq = data.settings.equipped || {};
  const out = {};
  Object.keys(eq).forEach((slot) => {
    out[slot] = data.items.find((i) => i.id === eq[slot]);
  });
  return out;
}

export default function HomePage() {
  const { data } = useStore();
  const equipped = resolveEquipped(data);
  const parts = Object.values(equipped).filter(Boolean);
  const [showSave, setShowSave] = useState(false);

  const wardrobeCount = data.items.filter((i) => CATEGORY_DEFS[i.category]?.room === "wardrobe").length;
  const vanityCount = data.items.filter((i) => CATEGORY_DEFS[i.category]?.room === "vanity").length;
  const hasAnyItems = wardrobeCount + vanityCount > 0;

  return (
    <main className="px-5">
      <TopBar />

      <div className="relative rounded-lg p-6 pt-8 pb-2 shadow-md bg-gradient-to-b from-[#F6E9F7] via-[#FBEFEE] to-[#FFF0E4] overflow-hidden border border-white/60">
        <span className="absolute top-4 left-4 text-2xl sparkle" style={{ animationDelay: "0s" }}>🌿</span>
        <span className="absolute top-10 right-20 text-sm sparkle" style={{ animationDelay: "1.1s" }}>✨</span>
        <span className="absolute bottom-16 left-10 text-xs sparkle" style={{ animationDelay: "2s" }}>✨</span>
        <div className="absolute top-4 right-4 w-14 h-14 rounded-md border-4 border-white shadow-sm bg-gradient-to-b from-[#D8E8F7] to-[#FFEACB]" />
        <div className="flex justify-center items-end min-h-[210px]">
          <Doll equipped={equipped} pose="standing" className="w-36 h-52" />
        </div>

        {parts.length ? (
          <>
            <div className="flex gap-1.5 flex-wrap justify-center mt-2 pb-3">
              {parts.map((p) => (
                <span key={p.id} className="px-3 py-1.5 rounded-pill bg-white/80 backdrop-blur-xs text-xs font-label font-semibold shadow-sm text-plum">
                  {CATEGORY_DEFS[p.category]?.emoji} {p.name}
                </span>
              ))}
            </div>
            <div className="relative z-10 flex justify-center pb-3">
              <Button variant="secondary" size="sm" onClick={() => setShowSave(true)}>
                📦 Save this look
              </Button>
            </div>
          </>
        ) : hasAnyItems ? (
          <div className="text-center pb-4">
            <p className="text-sm font-heading-serif italic text-plum-soft mb-3">
              She&apos;s waiting to be dressed — visit a room to begin ✨
            </p>
            <Link href="/wardrobe">
              <Button variant="primary" size="sm">Start dressing her</Button>
            </Link>
          </div>
        ) : (
          <div className="text-center pb-4">
            <p className="text-sm font-heading-serif italic text-plum-soft mb-3">
              Your closet is empty — add your first piece to bring her to life ✨
            </p>
            <Link href="/wardrobe">
              <Button variant="primary" size="sm">Add your first item</Button>
            </Link>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showSave && <SaveOutfitSheet equipped={equipped} onClose={() => setShowSave(false)} />}
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-3 mt-5">
        <Link href="/wardrobe" className="flex items-center gap-3 bg-white/70 backdrop-blur-xs border border-white/70 rounded-md shadow-sm p-3.5 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-full bg-peach grid place-items-center text-lg">👗</div>
          <div>
            <div className="font-heading-serif font-semibold text-[15px] text-plum">Wardrobe</div>
            <div className="text-[11px] text-plum-soft font-label">{wardrobeCount} pieces</div>
          </div>
        </Link>
        <Link href="/vanity" className="flex items-center gap-3 bg-white/70 backdrop-blur-xs border border-white/70 rounded-md shadow-sm p-3.5 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-full bg-lavender grid place-items-center text-lg">🪞</div>
          <div>
            <div className="font-heading-serif font-semibold text-[15px] text-plum">Vanity</div>
            <div className="text-[11px] text-plum-soft font-label">{vanityCount} pieces</div>
          </div>
        </Link>
      </div>
    </main>
  );
}
