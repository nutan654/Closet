"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useStore } from "@/lib/StoreContext";
import TopBar from "@/components/TopBar";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";

// Same wardrobe/vanity slot mapping used on the Vanity page (makeup and
// jewelry each equip into their own shared slot rather than their raw
// category name) — kept in one place so applying a saved outfit equips
// every piece into the slot the doll actually reads.
function slotFor(category) {
  return category === "makeup" ? "makeup" : category === "jewelry" ? "jewelry" : category;
}

export default function CollectionsPage() {
  const { data, setEquipped, updateOutfit, deleteOutfit } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [applyingId, setApplyingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState("");

  function resolveItems(outfit) {
    return outfit.itemIds.map((id) => data.items.find((i) => i.id === id)).filter(Boolean);
  }

  async function handleApply(outfit) {
    const outfitItems = resolveItems(outfit);
    if (!outfitItems.length) {
      toast.error("This look's pieces have all been removed from your closet");
      return;
    }
    setApplyingId(outfit.id);
    try {
      for (const item of outfitItems) {
        await setEquipped(slotFor(item.category), item.id);
      }
      toast.success(`Wearing "${outfit.name}" now ✨`);
      router.push("/");
    } catch (err) {
      toast.error(err?.message || "Couldn't apply this look");
    } finally {
      setApplyingId(null);
    }
  }

  async function handleDelete(outfit) {
    const ok = await confirm({
      title: "Delete this look?",
      message: `"${outfit.name}" will be removed from Collections. Your items themselves stay in your closet.`,
      confirmLabel: "Delete",
      cancelLabel: "Keep it",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteOutfit(outfit.id);
      toast.success("Look deleted");
    } catch (err) {
      toast.error(err?.message || "Couldn't delete this look");
    }
  }

  function startRename(outfit) {
    setEditingId(outfit.id);
    setDraftName(outfit.name);
  }

  async function commitRename(outfit) {
    const name = draftName.trim();
    setEditingId(null);
    if (!name || name === outfit.name) return;
    try {
      await updateOutfit(outfit.id, { name });
      toast.success("Renamed");
    } catch (err) {
      toast.error(err?.message || "Couldn't rename this look");
    }
  }

  return (
    <main className="px-5">
      <TopBar title="Collections 📦" />

      {data.outfits.length ? (
        <div className="grid grid-cols-2 gap-3 mt-2">
          {data.outfits.map((o) => {
            const pieceCount = resolveItems(o).length;
            return (
              <motion.div
                key={o.id}
                whileTap={{ scale: 0.98 }}
                className="bg-white/70 backdrop-blur-xs border border-white/70 rounded-md shadow-sm p-3.5 hover:shadow-md transition-shadow"
              >
                <button
                  onClick={() => handleApply(o)}
                  disabled={applyingId === o.id}
                  className="w-full text-center disabled:opacity-60"
                >
                  <div className="w-full h-16 rounded-sm bg-gradient-to-br from-peach to-pink grid place-items-center text-2xl mb-2.5">
                    {o.emoji}
                  </div>
                  {editingId === o.id ? (
                    <input
                      autoFocus
                      value={draftName}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => commitRename(o)}
                      onKeyDown={(e) => e.key === "Enter" && commitRename(o)}
                      className="w-full text-center font-heading-serif font-semibold text-[15px] text-plum bg-white border border-line rounded-sm px-1.5 py-0.5"
                    />
                  ) : (
                    <div className="font-heading-serif font-semibold text-[15px] text-plum truncate">{o.name}</div>
                  )}
                  <div className="text-[11px] font-label text-plum-soft mt-0.5">
                    {applyingId === o.id ? "Applying…" : `${pieceCount} ${pieceCount === 1 ? "piece" : "pieces"}`}
                  </div>
                </button>

                <div className="flex justify-center gap-3 mt-2 pt-2 border-t border-line">
                  <button
                    onClick={(e) => { e.stopPropagation(); startRename(o); }}
                    className="text-xs font-label text-plum-soft hover:text-plum"
                    aria-label="Rename look"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(o); }}
                    className="text-xs font-label text-plum-soft hover:text-pink-deep"
                    aria-label="Delete look"
                  >
                    🗑️
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-14 text-plum-soft">
          <span className="text-3xl block mb-2">🌼</span>
          <p className="font-heading-serif italic text-base">No looks saved yet.</p>
          <p className="text-xs font-label mt-1 mb-4">
            Dress your doll in the Wardrobe or Vanity room, then save the look from Home.
          </p>
          <Link href="/">
            <Button variant="primary" size="sm">Go dress her</Button>
          </Link>
        </div>
      )}
    </main>
  );
}
