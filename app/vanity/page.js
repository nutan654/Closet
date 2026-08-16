"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/StoreContext";
import { ROOM_CATEGORIES, CATEGORY_DEFS, CARD_STYLES } from "@/lib/constants";
import TopBar from "@/components/TopBar";
import VanityCloseup from "@/components/doll/VanityCloseup";
import ItemCard from "@/components/ItemCard";
import ColorPicker from "@/components/ColorPicker";
import Chip from "@/components/ui/Chip";
import Button from "@/components/ui/Button";
import ItemDetailSheet from "@/components/ItemDetailSheet";
import { useToast } from "@/components/ui/Toast";

const SORT_OPTIONS = [
  { key: "recent", label: "Recent" },
  { key: "worn", label: "Most used" },
  { key: "favorite", label: "Favorites" },
  { key: "name", label: "A–Z" },
];

function resolveEquipped(data) {
  const eq = data.settings.equipped || {};
  const out = {};
  Object.keys(eq).forEach((slot) => { out[slot] = data.items.find((i) => i.id === eq[slot]); });
  return out;
}

export default function VanityPage() {
  const { data, setEquipped, addItem } = useStore();
  const toast = useToast();
  const cats = ROOM_CATEGORIES.vanity;
  const [activeCat, setActiveCat] = useState(cats[0]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [favOnly, setFavOnly] = useState(false);
  const [detailItem, setDetailItem] = useState(null);

  const equipped = resolveEquipped(data);
  const rawItems = data.items.filter((i) => i.category === activeCat);

  let items = rawItems;
  if (favOnly) items = items.filter((i) => i.favorite);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    items = items.filter((i) => i.name?.toLowerCase().includes(q) || i.brand?.toLowerCase().includes(q));
  }
  items = [...items].sort((a, b) => {
    if (sortBy === "worn") return (b.timesUsed || 0) - (a.timesUsed || 0);
    if (sortBy === "favorite") return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
    if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });

  // for makeup/jewelry we equip into a shared "makeup"/"jewelry" slot so the
  // face close-up can read it directly
  const slotFor = (cat) => (cat === "makeup" ? "makeup" : cat === "jewelry" ? "jewelry" : cat);

  return (
    <main className="px-5">
      <TopBar title="Vanity Room 🪞" />

      <div className="relative rounded-lg p-6 pt-8 shadow-md bg-gradient-to-b from-[#F1E9F7] to-[#FFE3EC]">
        <span className="absolute top-4 left-4 text-2xl">🌿</span>
        <div className="flex justify-center">
          <VanityCloseup equipped={equipped} className="w-64 h-64" />
        </div>
        <p className="text-center text-xs text-plum-soft mt-2">
          Equip a lip or blush product below to see it tint her face ✨
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto mt-4 pb-1">
        {cats.map((c) => (
          <Chip key={c} active={activeCat === c} onClick={() => setActiveCat(c)}>
            {CATEGORY_DEFS[c].emoji} {CATEGORY_DEFS[c].label}
          </Chip>
        ))}
      </div>

      <div className="flex justify-between items-center mt-5 mb-2.5">
        <h2 className="font-heading-serif italic text-xl text-plum">{CATEGORY_DEFS[activeCat].label}</h2>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${CATEGORY_DEFS[activeCat].label.toLowerCase()}…`}
          className="flex-1 min-w-0 border border-line bg-white/80 backdrop-blur-xs rounded-pill px-4 py-2 font-body text-sm"
        />
        <Chip active={favOnly} onClick={() => setFavOnly((v) => !v)}>♥</Chip>
      </div>
      <div className="flex gap-2 overflow-x-auto mb-3 pb-0.5">
        {SORT_OPTIONS.map((s) => (
          <Chip key={s.key} active={sortBy === s.key} onClick={() => setSortBy(s.key)}>
            {s.label}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} onClick={() => setDetailItem(item)} />
        ))}
        {!items.length && rawItems.length > 0 && (
          <div className="col-span-2 text-center py-12 text-plum-soft">
            <span className="text-3xl block mb-2">🔍</span>
            <p className="font-heading-serif italic text-base">No products match that search.</p>
          </div>
        )}
        {!rawItems.length && (
          <div className="col-span-2 text-center py-12 text-plum-soft">
            <span className="text-3xl block mb-2">🪄</span>
            <p className="font-heading-serif italic text-base">Your shelf is empty here.</p>
            <p className="text-xs font-label mt-1 mb-3">Add a product to get started ✨</p>
            <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
              Add your first product
            </Button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {detailItem && (
          <ItemDetailSheet
            item={detailItem}
            isEquipped={equipped[slotFor(detailItem.category)]?.id === detailItem.id}
            onClose={() => setDetailItem(null)}
            onWear={() =>
              setEquipped(
                slotFor(detailItem.category),
                equipped[slotFor(detailItem.category)]?.id === detailItem.id ? null : detailItem.id
              )
            }
          />
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setShowAdd(true)}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 500, damping: 26 }}
        className="fixed bottom-24 right-[max(1rem,calc(50%-15rem+1rem))] w-14 h-14 rounded-full bg-plum text-cream text-2xl shadow-lg grid place-items-center z-40"
      >
        +
      </motion.button>

      <AnimatePresence>
        {showAdd && (
          <AddProductSheet
            category={activeCat}
            onClose={() => setShowAdd(false)}
            onSave={async (patch) => {
              // Mirrors Wardrobe's AddItemSheet contract (app/wardrobe/page.js):
              // let a failed addItem() propagate to the sheet's own catch so
              // it stays open with a friendly error instead of silently
              // closing on a product that never actually saved.
              const item = await addItem({ category: activeCat, ...patch });
              toast.success(`${item.name} added to your shelf ✨`);
              setShowAdd(false);
            }}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function AddProductSheet({ category, onClose, onSave }) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("#FFD3E0");
  const [cardStyle, setCardStyle] = useState("classic");
  const [consumable, setConsumable] = useState(true);
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name || "Untitled product", brand, color, cardStyle, consumable, inventoryPercent: 100, imageFile });
    } catch (err) {
      setError(err?.message || "Couldn't save this product. Please try again.");
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
        <h2 className="text-xl font-title text-plum mb-1">Add to {CATEGORY_DEFS[category].label}</h2>
        <p className="text-xs font-label text-plum-soft mb-4">A new find for your shelf ✨</p>

        <div className="flex flex-col gap-1 mb-3">
          <label className="text-xs font-label font-semibold text-plum-soft">Photo (optional)</label>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-md overflow-hidden bg-white border border-line grid place-items-center shrink-0">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl">{CATEGORY_DEFS[category]?.emoji}</span>
              )}
            </div>
            <label className="text-xs font-label font-semibold text-plum bg-white border border-line rounded-pill px-3 py-1.5 cursor-pointer">
              {imageFile ? "Change photo" : "Add a photo"}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} className="hidden" />
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-1 mb-3">
          <label className="text-xs font-label font-semibold text-plum-soft">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="border border-line bg-white rounded-sm px-3 py-2.5 font-body text-sm" placeholder="e.g. Rare Beauty Blush" />
          <p className="text-[10px] font-label text-plum-soft">Tip: include &quot;lip&quot; or &quot;blush/cheek&quot; in the name to have it tint her face when equipped.</p>
        </div>

        <div className="flex flex-col gap-1 mb-3">
          <label className="text-xs font-label font-semibold text-plum-soft">Brand</label>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} className="border border-line bg-white rounded-sm px-3 py-2.5 font-body text-sm" placeholder="Brand" />
        </div>

        <div className="flex flex-col gap-1 mb-3">
          <label className="text-xs font-label font-semibold text-plum-soft">Shade / color</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <label className="flex items-center gap-2 text-sm font-body text-plum mb-4">
          <input type="checkbox" checked={consumable} onChange={(e) => setConsumable(e.target.checked)} className="accent-plum" />
          Uses up over time
        </label>

        <div className="flex flex-col gap-1 mb-5">
          <label className="text-xs font-label font-semibold text-plum-soft">Card style</label>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(CARD_STYLES).map(([key, s]) => (
              <Chip key={key} active={cardStyle === key} onClick={() => setCardStyle(key)}>{s.label}</Chip>
            ))}
          </div>
        </div>

        {error && <p className="text-xs font-label text-pink-deep mb-3">{error}</p>}

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? "Adding to shelf…" : "Add to shelf"}
        </Button>
      </motion.div>
    </motion.div>
  );
}
