"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/StoreContext";
import { ROOM_CATEGORIES, CATEGORY_DEFS, FIT_OPTIONS, GARMENT_SUBTYPES, CARD_STYLES } from "@/lib/constants";
import TopBar from "@/components/TopBar";
import Doll from "@/components/doll/Doll";
import EquippedStrip from "@/components/EquippedStrip";
import SwipeStack from "@/components/SwipeStack";
import ItemCard from "@/components/ItemCard";
import ColorPicker from "@/components/ColorPicker";
import PatternControls from "@/components/PatternControls";
import Chip from "@/components/ui/Chip";
import Button from "@/components/ui/Button";
import ItemDetailSheet from "@/components/ItemDetailSheet";
import { useToast } from "@/components/ui/Toast";

const SORT_OPTIONS = [
  { key: "recent", label: "Recent" },
  { key: "worn", label: "Most worn" },
  { key: "favorite", label: "Favorites" },
  { key: "name", label: "A–Z" },
];

function resolveEquipped(data) {
  const eq = data.settings.equipped || {};
  const out = {};
  Object.keys(eq).forEach((slot) => { out[slot] = data.items.find((i) => i.id === eq[slot]); });
  return out;
}

// Categories that actually render a silhouette on the doll (see
// lib/doll/layers.js's CATEGORY_LAYER) — shoes/bags/accessories are
// wardrobe categories but have no doll garment shape, so there's nothing
// for a pattern to apply to.
const PATTERNABLE_CATEGORIES = new Set(["tops", "bottoms", "dresses", "outerwear"]);

export default function WardrobePage() {
  const { data, setEquipped, addItem, setPatternStyle, patternSaveStatus } = useStore();
  const toast = useToast();
  const cats = ROOM_CATEGORIES.wardrobe;
  const [activeCat, setActiveCat] = useState(cats[0]);
  const [mode, setMode] = useState("swipe"); // swipe | grid
  const [showAdd, setShowAdd] = useState(false);
  const [showPatternEditor, setShowPatternEditor] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [favOnly, setFavOnly] = useState(false);
  const [detailItem, setDetailItem] = useState(null);

  const equipped = resolveEquipped(data);
  const rawItems = data.items.filter((i) => i.category === activeCat);
  const equippedItem = equipped[activeCat];
  const canCustomizePattern = Boolean(equippedItem) && PATTERNABLE_CATEGORIES.has(activeCat);

  // Grid mode gets full search/sort/favorites tooling (brief: "sorting by
  // category, favorite, recently used" + "search/filter"). Swipe mode
  // stays a simple, ordered stack — filtering a shuffled deck by search
  // wouldn't make sense there.
  let items = rawItems;
  if (mode === "grid") {
    if (favOnly) items = items.filter((i) => i.favorite);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (i) => i.name?.toLowerCase().includes(q) || i.brand?.toLowerCase().includes(q)
      );
    }
    items = [...items].sort((a, b) => {
      if (sortBy === "worn") return (b.worn || 0) - (a.worn || 0);
      if (sortBy === "favorite") return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
      if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
      return (b.createdAt || "").localeCompare(a.createdAt || ""); // recent first
    });
  }

  return (
    <main className="px-5">
      <TopBar title="Wardrobe Room" />

      <div className="relative rounded-lg p-6 pt-8 shadow-md bg-gradient-to-b from-[#F6E9F7] via-[#FBEFEE] to-[#FFF0E4] border border-white/60 overflow-hidden">
        <span className="absolute top-4 left-4 text-2xl sparkle">🌿</span>
        <span className="absolute top-10 right-16 text-xs sparkle" style={{ animationDelay: "1.4s" }}>✨</span>
        <div className="absolute top-4 right-4 w-14 h-14 rounded-md border-4 border-white shadow-sm bg-gradient-to-b from-[#D8E8F7] to-[#FFEACB]" />
        <EquippedStrip equipped={equipped} />
        <div className="flex justify-center items-end min-h-[200px]">
          <Doll equipped={equipped} pose="standing" className="w-36 h-52" />
        </div>

        {canCustomizePattern && (
          <div className="relative z-10 flex justify-center mt-1">
            <Chip active={showPatternEditor} onClick={() => setShowPatternEditor((v) => !v)}>
              🧵 {showPatternEditor ? "Hide pattern styling" : `Style ${equippedItem.name}'s fabric`}
            </Chip>
          </div>
        )}
      </div>

      {/*
        Live doll preview (brief section 14): setPatternStyle is a pure
        local state update (see lib/StoreContext.jsx) — no network call —
        so every slider drag here re-renders the Doll above instantly.
        Bound directly to the currently-equipped item's own pattern
        fields, so "what you see here" and "what the doll is wearing"
        are always the same object, never a separate draft copy.
      */}
      {canCustomizePattern && showPatternEditor && (
        <div className="mt-3">
          <PatternControls
            value={equippedItem}
            color={equippedItem.color}
            onChange={(patch) => setPatternStyle(equippedItem.id, patch)}
          />
          {/*
            The pattern edit itself already applied instantly above (local
            state, no network wait) — this only reports on the quiet
            background PATCH that persists it (lib/StoreContext.jsx's
            setPatternStyle). Without this, a failed save was previously
            invisible: the doll kept showing the new fabric, but nothing
            actually survived a reload and the person was never told.
          */}
          {patternSaveStatus?.[equippedItem.id] === "error" && (
            <p className="text-xs font-label text-pink-deep mt-2 text-center">
              Couldn&apos;t save this styling — it&apos;s still shown here, but may not survive a reload.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto mt-4 pb-1">
        {cats.map((c) => (
          <Chip key={c} active={activeCat === c} onClick={() => setActiveCat(c)}>
            {CATEGORY_DEFS[c].emoji} {CATEGORY_DEFS[c].label}
          </Chip>
        ))}
      </div>

      <div className="flex justify-between items-center mt-5 mb-2.5">
        <h2 className="font-heading-serif italic text-xl text-plum">{CATEGORY_DEFS[activeCat].label}</h2>
        <div className="flex gap-1 bg-white/70 backdrop-blur-xs border border-white/70 rounded-pill p-1 shadow-sm">
          <button
            onClick={() => setMode("swipe")}
            className={`px-3 py-1 rounded-pill text-xs font-label font-semibold transition-colors ${mode === "swipe" ? "bg-peach text-plum" : "text-plum-soft"}`}
          >
            Swipe
          </button>
          <button
            onClick={() => setMode("grid")}
            className={`px-3 py-1 rounded-pill text-xs font-label font-semibold transition-colors ${mode === "grid" ? "bg-peach text-plum" : "text-plum-soft"}`}
          >
            Cards
          </button>
        </div>
      </div>

      {mode === "swipe" ? (
        <SwipeStack
          items={rawItems}
          onWear={(item) => setEquipped(activeCat, item.id)}
          onSkip={() => {}}
        />
      ) : (
        <>
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
                <p className="font-heading-serif italic text-base">No pieces match that search.</p>
              </div>
            )}
            {!rawItems.length && (
              <div className="col-span-2 text-center py-12 text-plum-soft">
                <span className="text-3xl block mb-2">🪞</span>
                <p className="font-heading-serif italic text-base">
                  This shelf is waiting for its first treasure ✨
                </p>
                <Button variant="primary" size="sm" className="mt-3" onClick={() => setShowAdd(true)}>
                  Add your first {CATEGORY_DEFS[activeCat].label.toLowerCase().replace(/s$/, "")}
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {detailItem && (
          <ItemDetailSheet
            item={detailItem}
            isEquipped={equipped[detailItem.category]?.id === detailItem.id}
            onClose={() => setDetailItem(null)}
            onWear={() =>
              setEquipped(
                detailItem.category,
                equipped[detailItem.category]?.id === detailItem.id ? null : detailItem.id
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
          <AddItemSheet
            category={activeCat}
            onClose={() => setShowAdd(false)}
            onSave={async (patch) => {
              // patternStyle never goes through addItem/ItemRequest (the
              // create endpoint has no pattern* fields) — it's applied as
              // a separate step via setPatternStyle once the real item
              // (with a server-assigned id) exists. That step DOES persist
              // to the backend now (a debounced PATCH — see
              // lib/StoreContext.jsx's setPatternStyle and lib/model.js's
              // mkItem() comment), just one API call later than the item
              // itself.
              const { patternStyle, ...itemPatch } = patch;
              const item = await addItem({ category: activeCat, ...itemPatch }); // let a failure propagate to AddItemSheet's catch — sheet stays open, item never appears "saved" that wasn't
              if (patternStyle?.patternUrl) setPatternStyle(item.id, patternStyle);
              toast.success(`${item.name} added to your closet ✨`);
              setShowAdd(false);
            }}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function AddItemSheet({ category, onClose, onSave }) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("#FFD9BE");
  const [fit, setFit] = useState((FIT_OPTIONS[category] || ["Regular"])[0]);
  const subtypeChoices = GARMENT_SUBTYPES[category];
  const [subtype, setSubtype] = useState((subtypeChoices || [""])[0]);
  const [cardStyle, setCardStyle] = useState("classic");
  // Frontend-only pattern draft (brief section 6/18) — applied to the
  // item locally via StoreContext.setPatternStyle right after creation,
  // never sent as part of the create payload. See PatternControls.jsx.
  const [patternStyle, setPatternStyle] = useState({});
  // Phase 4.4: the pre-existing AddItemSheet had no photo field at all
  // (see git history / the Phase 4.3 report) — this is the smallest
  // addition that lets the real backend upload pipeline get exercised
  // from the actual UI, styled to match every other field in this sheet.
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fitChoices = FIT_OPTIONS[category];

  // File -> object URL for an instant local preview, exactly as it will
  // look once persisted (backend renders the same image back as
  // thumbnailUrl/imageUrl after upload — see lib/api/mappers.js). Revoked
  // on replacement/unmount so it doesn't leak.
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
      await onSave({ name: name || "Untitled item", brand, color, fit, subtype, cardStyle, imageFile, patternStyle });
      // On success the sheet is closed by the caller (see onSave in
      // WardrobePage) — nothing left to do here.
    } catch (err) {
      // err.message is already a safe, friendly string — see
      // lib/api/client.js's ApiError and the backend's apperror package
      // (ERR_FILE_TOO_LARGE / ERR_UNSUPPORTED_FILE_TYPE / ERR_INVALID_IMAGE
      // all carry human-readable messages already).
      setError(err?.message || "Couldn't save this item. Please try again.");
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
        <p className="text-xs font-label text-plum-soft mb-4">A new piece for your collection ✨</p>

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
          <label className="text-xs font-label font-semibold text-plum-soft">Piece name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="border border-line bg-white rounded-sm px-3 py-2.5 font-body text-sm" placeholder="e.g. Sage Wrap Dress" />
        </div>

        <div className="flex flex-col gap-1 mb-3">
          <label className="text-xs font-label font-semibold text-plum-soft">Designer</label>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} className="border border-line bg-white rounded-sm px-3 py-2.5 font-body text-sm" placeholder="Brand" />
        </div>

        {subtypeChoices && (
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs font-label font-semibold text-plum-soft">Style</label>
            <div className="flex gap-2 flex-wrap">
              {subtypeChoices.map((s) => (
                <Chip key={s} active={subtype === s} onClick={() => setSubtype(s)}>{s}</Chip>
              ))}
            </div>
          </div>
        )}

        {fitChoices && (
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs font-label font-semibold text-plum-soft">Fit</label>
            <div className="flex gap-2 flex-wrap">
              {fitChoices.map((f) => (
                <Chip key={f} active={fit === f} onClick={() => setFit(f)}>{f}</Chip>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1 mb-3">
          <label className="text-xs font-label font-semibold text-plum-soft">Color</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        {(subtypeChoices || category === "dresses") && (
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs font-label font-semibold text-plum-soft">Fabric</label>
            <PatternControls value={patternStyle} color={color} onChange={setPatternStyle} />
          </div>
        )}

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
          {saving ? "Trying it on…" : "Try it"}
        </Button>
      </motion.div>
    </motion.div>
  );
}
