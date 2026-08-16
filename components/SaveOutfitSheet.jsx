"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Button from "./ui/Button";
import { useStore } from "@/lib/StoreContext";
import { useToast } from "./ui/Toast";

const EMOJIS = ["✨", "🌸", "👑", "🌿", "🔥", "🖤", "🌙", "☀️"];

/**
 * components/SaveOutfitSheet.jsx
 *
 * `addOutfit` has lived in StoreContext since the backend migration but
 * had no UI caller anywhere — Collections could only ever show "no looks
 * saved yet". This sheet turns whatever the doll is currently wearing
 * into a saved, named outfit.
 */
export default function SaveOutfitSheet({ equipped, onClose }) {
  const { addOutfit } = useStore();
  const toast = useToast();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const itemIds = Object.values(equipped).filter(Boolean).map((i) => i.id);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await addOutfit({ name: name.trim() || "Untitled look", emoji, itemIds });
      toast.success("Look saved to Collections 📦");
      onClose();
    } catch (err) {
      setError(err?.message || "Couldn't save this look. Please try again.");
      setSaving(false);
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
        <h2 className="text-xl font-title text-plum mb-1">Save this look</h2>
        <p className="text-xs font-label text-plum-soft mb-4">
          {itemIds.length} {itemIds.length === 1 ? "piece" : "pieces"} on her right now ✨
        </p>

        <div className="flex flex-col gap-1 mb-3">
          <label className="text-xs font-label font-semibold text-plum-soft">Name it</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-line bg-white rounded-sm px-3 py-2.5 font-body text-sm"
            placeholder="e.g. Sunday brunch"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1 mb-5">
          <label className="text-xs font-label font-semibold text-plum-soft">Cover</label>
          <div className="flex gap-2 flex-wrap">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`w-10 h-10 rounded-md grid place-items-center text-lg border transition-colors ${
                  emoji === e ? "border-plum bg-peach/40" : "border-line bg-white"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs font-label text-pink-deep mb-3">{error}</p>}

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={saving || !itemIds.length}
          onClick={handleSave}
        >
          {saving ? "Saving…" : itemIds.length ? "Save look" : "Dress her first"}
        </Button>
      </motion.div>
    </motion.div>
  );
}
