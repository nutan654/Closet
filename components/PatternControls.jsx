"use client";

/**
 * components/PatternControls.jsx
 *
 * The "compact pattern-control interface" from the brief (section 12):
 * pattern on/off, scale, position, color/tint — deliberately NOT a big
 * settings panel. Controlled component: the caller owns the actual
 * pattern-style state and passes it in as `value`, this only renders
 * controls + calls `onChange(patch)` — so it works equally well wired to
 * AddItemSheet's local draft state (item doesn't exist yet) or to
 * StoreContext.setPatternStyle for an existing item (see
 * lib/StoreContext.jsx).
 *
 * Upload flow (brief section 7-8): select -> instant local object-URL
 * preview -> "Process" hits POST /patterns/process (lib/api/patterns.js)
 * -> Go backend proxies to the Python pattern-service -> returns a
 * seamlessly-tiling data-URL texture + a dominant-color palette. Only the
 * PROCESSED tile is ever set as patternUrl — the raw upload never touches
 * doll rendering, so every garment always displays a clean repeating
 * texture rather than one random crop of the photo.
 */

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { processPattern } from "@/lib/api/patterns";
import { PATTERN_SCALE_MIN, PATTERN_SCALE_MAX } from "@/lib/doll/pattern";
import Chip from "./ui/Chip";

export default function PatternControls({ value, onChange, color }) {
  const style = value || {};
  const fileInputRef = useRef(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [palette, setPalette] = useState([]);

  function patch(partial) {
    onChange?.({ ...style, ...partial });
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    const objectUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(objectUrl);
    setProcessing(true);
    try {
      const result = await processPattern(file);
      patch({ patternUrl: result.tileDataUrl });
      setPalette(result.palette || []);
    } catch (err) {
      setError(err?.message || "Couldn't process that image. Try a different photo.");
    } finally {
      setProcessing(false);
    }
  }

  const hasPattern = Boolean(style.patternUrl);

  return (
    <div className="flex flex-col gap-3 border border-line rounded-md p-3 bg-white/60">
      <div className="flex items-center justify-between">
        <span className="text-xs font-label font-semibold text-plum-soft">Fabric pattern</span>
        {hasPattern && (
          <Chip active={false} onClick={() => patch({ patternUrl: null })} className="!bg-white !text-plum-soft">
            Remove
          </Chip>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-md overflow-hidden bg-white border border-line grid place-items-center shrink-0">
          {style.patternUrl || localPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={style.patternUrl || localPreviewUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl">🧵</span>
          )}
        </div>
        <label className="text-xs font-label font-semibold text-plum bg-white border border-line rounded-pill px-3 py-1.5 cursor-pointer">
          {processing ? "Processing…" : hasPattern ? "Change fabric" : "Upload fabric photo"}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelected}
            className="hidden"
            disabled={processing}
          />
        </label>
      </div>

      {error && <p className="text-xs font-label text-pink-deep">{error}</p>}

      {palette.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-label text-plum-soft mr-1">From photo:</span>
          {palette.map((hex) => (
            <button
              key={hex}
              type="button"
              title={hex}
              onClick={() => onChange?.({ ...style, patternTint: false })}
              className="w-5 h-5 rounded-full border border-white shadow-sm"
              style={{ background: hex }}
            />
          ))}
        </div>
      )}

      {hasPattern && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-label font-semibold text-plum-soft">
              Scale — {style.patternScale?.toFixed?.(2) ?? "1.00"}×
            </label>
            <input
              type="range"
              min={PATTERN_SCALE_MIN}
              max={PATTERN_SCALE_MAX}
              step={0.05}
              value={style.patternScale ?? 1}
              onChange={(e) => patch({ patternScale: Number(e.target.value) })}
              className="w-full accent-plum"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-label font-semibold text-plum-soft">Position X</label>
              <input
                type="range"
                min={-40}
                max={40}
                step={1}
                value={style.patternOffsetX ?? 0}
                onChange={(e) => patch({ patternOffsetX: Number(e.target.value) })}
                className="w-full accent-plum"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-label font-semibold text-plum-soft">Position Y</label>
              <input
                type="range"
                min={-40}
                max={40}
                step={1}
                value={style.patternOffsetY ?? 0}
                onChange={(e) => patch({ patternOffsetY: Number(e.target.value) })}
                className="w-full accent-plum"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] font-label font-semibold text-plum-soft">Tint with garment color</span>
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => patch({ patternTint: !style.patternTint })}
              className={`w-10 h-6 rounded-pill p-0.5 transition-colors ${style.patternTint ? "bg-plum" : "bg-line"}`}
              aria-pressed={Boolean(style.patternTint)}
              aria-label="Toggle color tint on pattern"
            >
              <motion.span
                className="block w-5 h-5 rounded-full bg-white shadow-sm"
                animate={{ x: style.patternTint ? 16 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </motion.button>
          </div>
          {style.patternTint && (
            <div className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded-full border border-white shadow-sm shrink-0"
                style={{ background: color }}
              />
              <span className="text-[10px] font-label text-plum-soft">Tinted with the color selected above</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
