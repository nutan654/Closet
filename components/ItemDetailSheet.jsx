"use client";

import { motion } from "framer-motion";
import { CATEGORY_DEFS } from "@/lib/constants";
import Button from "./ui/Button";
import { useStore } from "@/lib/StoreContext";
import { useToast } from "./ui/Toast";
import { useConfirm } from "./ui/ConfirmDialog";

/**
 * components/ItemDetailSheet.jsx
 *
 * Tapping a card in grid mode used to equip the item immediately with no
 * way to see more, favorite it, check its wear count, or delete it —
 * `favorite`, `deleteItem`, and `logWear` all existed in StoreContext but
 * had zero callers anywhere in app/ or components/. This sheet is the
 * missing "item detail" surface that wires all three up.
 */
export default function ItemDetailSheet({ item, isEquipped, onClose, onWear }) {
  const { updateItem, deleteItem, logWear } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const cat = CATEGORY_DEFS[item.category];

  async function handleDelete() {
    const ok = await confirm({
      title: "Remove this piece?",
      message: `"${item.name}" will be gone for good, and removed from any saved outfits it's in.`,
      confirmLabel: "Delete",
      cancelLabel: "Keep it",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteItem(item.id);
      toast.success("Removed from your closet");
      onClose();
    } catch (err) {
      toast.error(err?.message || "Couldn't delete this item");
    }
  }

  async function handleFavorite() {
    try {
      await updateItem(item.id, { favorite: !item.favorite });
    } catch (err) {
      toast.error(err?.message || "Couldn't update favorite");
    }
  }

  async function handleWear() {
    try {
      await onWear?.();
      if (!isEquipped) {
        logWear(item.id).catch(() => {});
        toast.success(`Wearing ${item.name} ✨`);
      } else {
        toast.info(`Took off ${item.name}`);
      }
      onClose();
    } catch (err) {
      toast.error(err?.message || "Couldn't update this item");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-plum/25 backdrop-blur-[2px] z-[100] flex items-end justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 340, damping: 34 }}
        className="bg-cream w-full max-w-[480px] rounded-t-lg p-5 pb-8 max-h-[88vh] overflow-y-auto shadow-lg"
      >
        <div className="w-10 h-1.5 bg-line rounded-pill mx-auto mb-4" />

        <div className="flex items-start gap-4 mb-4">
          <div
            className="w-20 h-20 rounded-md overflow-hidden grid place-items-center text-3xl shrink-0"
            style={{ background: `linear-gradient(160deg, ${item.color}2E, ${item.color}12)` }}
          >
            {item.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.photo} alt="" className="w-full h-full object-cover" />
            ) : (
              cat?.emoji
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-title text-plum truncate">{item.name}</h2>
            <p className="text-sm font-label text-plum-soft truncate">
              {item.brand || "Unbranded"} · {cat?.label}
            </p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {item.fit && (
                <span className="text-[10px] font-label text-plum-soft bg-lavender/40 px-2 py-0.5 rounded-pill">
                  {item.fit}
                </span>
              )}
              {item.worn > 0 && (
                <span className="text-[10px] font-label text-plum-soft bg-white border border-line px-2 py-0.5 rounded-pill">
                  Worn {item.worn}×
                </span>
              )}
              {isEquipped && (
                <span className="text-[10px] font-label text-plum bg-peach px-2 py-0.5 rounded-pill">
                  Currently on ✨
                </span>
              )}
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={handleFavorite}
            className="text-2xl shrink-0 leading-none pt-1"
            aria-label={item.favorite ? "Remove from favorites" : "Add to favorites"}
          >
            <span className={item.favorite ? "text-pink-deep" : "text-plum-soft"}>
              {item.favorite ? "♥" : "♡"}
            </span>
          </motion.button>
        </div>

        {item.consumable && (
          <div className="mb-4">
            <div className="flex justify-between text-xs font-label text-plum-soft mb-1">
              <span>Product left</span>
              <span>{item.inventoryPercent ?? 100}%</span>
            </div>
            <div className="h-2 rounded-pill bg-line overflow-hidden">
              <div
                className="h-full bg-plum rounded-pill transition-all"
                style={{ width: `${item.inventoryPercent ?? 100}%` }}
              />
            </div>
          </div>
        )}

        <Button variant="primary" size="lg" className="w-full mb-3" onClick={handleWear}>
          {isEquipped ? "Take it off" : "Wear this"}
        </Button>
        <Button variant="ghost" className="w-full !text-pink-deep" onClick={handleDelete}>
          Remove from closet
        </Button>
      </motion.div>
    </motion.div>
  );
}
