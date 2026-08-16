"use client";

import { useState, useEffect } from "react";

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export default function ColorPicker({ value = "#FFD9BE", onChange }) {
  const [hex, setHex] = useState(value);
  const [hue, setHue] = useState(20);
  const [sat, setSat] = useState(80);
  const [light, setLight] = useState(85);

  useEffect(() => setHex(value), [value]);

  function update(h, s, l) {
    const newHex = hslToHex(h, s, l);
    setHex(newHex);
    onChange?.(newHex);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-md border-2 border-white shadow-sm shrink-0"
          style={{ background: hex }}
        />
        <input
          type="text"
          value={hex}
          onChange={(e) => {
            setHex(e.target.value);
            onChange?.(e.target.value);
          }}
          className="flex-1 border border-line rounded-sm px-3 py-2 text-sm font-mono"
          placeholder="#FFD9BE"
        />
      </div>

      <label className="text-xs font-bold text-plum-soft">Hue</label>
      <input
        type="range" min="0" max="360" value={hue}
        onChange={(e) => { const h = Number(e.target.value); setHue(h); update(h, sat, light); }}
        className="w-full accent-plum"
        style={{
          background: "linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red)",
          height: "8px",
          borderRadius: "999px",
        }}
      />

      <label className="text-xs font-bold text-plum-soft">Saturation</label>
      <input
        type="range" min="0" max="100" value={sat}
        onChange={(e) => { const s = Number(e.target.value); setSat(s); update(hue, s, light); }}
        className="w-full accent-plum"
      />

      <label className="text-xs font-bold text-plum-soft">Lightness</label>
      <input
        type="range" min="10" max="95" value={light}
        onChange={(e) => { const l = Number(e.target.value); setLight(l); update(hue, sat, l); }}
        className="w-full accent-plum"
      />
    </div>
  );
}
