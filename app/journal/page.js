"use client";

import { useStore } from "@/lib/StoreContext";
import TopBar from "@/components/TopBar";

export default function JournalPage() {
  const { data } = useStore();
  const totalSpent = data.items.reduce((s, i) => s + (i.price || 0), 0);
  const mostWorn = [...data.items].filter((i) => !i.consumable).sort((a, b) => (b.worn || 0) - (a.worn || 0))[0];

  const hasEntries = data.items.length > 0;

  return (
    <main className="px-5">
      <TopBar title="Your journal 📝" />

      <div className="grid grid-cols-3 gap-2.5 mt-2">
        <div className="bg-white/70 backdrop-blur-xs border border-white/70 rounded-md shadow-sm p-3.5 text-center">
          <div className="font-title text-xl text-plum">{data.items.length}</div>
          <div className="text-[10px] font-label font-semibold text-plum-soft mt-0.5 tracking-wide">Items owned</div>
        </div>
        <div className="bg-white/70 backdrop-blur-xs border border-white/70 rounded-md shadow-sm p-3.5 text-center">
          <div className="font-title text-xl text-plum">₹{totalSpent.toLocaleString("en-IN")}</div>
          <div className="text-[10px] font-label font-semibold text-plum-soft mt-0.5 tracking-wide">Total spent</div>
        </div>
        <div className="bg-white/70 backdrop-blur-xs border border-white/70 rounded-md shadow-sm p-3.5 text-center">
          <div className="font-title text-xl text-plum">{mostWorn ? mostWorn.worn || 0 : 0}×</div>
          <div className="text-[10px] font-label font-semibold text-plum-soft mt-0.5 tracking-wide">Top worn</div>
        </div>
      </div>

      {mostWorn && (
        <div className="mt-4 bg-white/70 backdrop-blur-xs border border-white/70 rounded-md shadow-sm p-4 flex items-center gap-3">
          <span className="text-2xl">✨</span>
          <div>
            <div className="font-heading-serif italic text-base text-plum">{mostWorn.name}</div>
            <div className="text-xs font-label text-plum-soft mt-0.5">Your most-worn piece — worn {mostWorn.worn || 0} times</div>
          </div>
        </div>
      )}

      {!hasEntries && (
        <div className="text-center py-14 text-plum-soft">
          <span className="text-3xl block mb-2">📝</span>
          <p className="font-heading-serif italic text-base">Your journal is quiet.</p>
          <p className="text-xs font-label mt-1">Add pieces to your wardrobe to see them reflected here.</p>
        </div>
      )}
    </main>
  );
}
