export default function Face({ skinColor = "#FBDCC0", lipColor, cheekColor, earringColor, size = "normal" }) {
  // size="large" is used by the Vanity close-up; same proportions, just meant
  // to be scaled up by the parent viewBox rather than re-drawn.
  //
  // Chibi-style head: much bigger relative to the body (cy 40, r 33, vs the
  // old r 27) with oversized eyes and a rounder, softer jaw — this is the
  // main "cuter doll" pass. Coordinates stay inside the same 0-150 viewBox
  // so Hair/Body/clothing layers don't need re-plumbing.
  return (
    <g>
      {/* head — very slightly wider than tall for a soft, rounded cheek line */}
      <ellipse cx="75" cy="41" rx="33" ry="32" fill={skinColor} />

      {/* ears, tucked mostly behind hair */}
      <circle cx="42.5" cy="43" r="5.2" fill={skinColor} />
      <circle cx="107.5" cy="43" r="5.2" fill={skinColor} />

      {/* soft round blush, bigger + gentler than a realistic doll's */}
      <ellipse cx="53" cy="49" rx="8" ry="5.5" fill={cheekColor || "#FFC3CE"} opacity={cheekColor ? 0.8 : 0.55} />
      <ellipse cx="97" cy="49" rx="8" ry="5.5" fill={cheekColor || "#FFC3CE"} opacity={cheekColor ? 0.8 : 0.55} />

      {/* soft, high eyebrows — friendly rather than serious */}
      <path d="M56 25 Q62 21.5 69 24" stroke="#8A6A66" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M94 25 Q88 21.5 81 24" stroke="#8A6A66" strokeWidth="1.6" fill="none" strokeLinecap="round" />

      {/* big sparkly chibi eyes */}
      <ellipse cx="61" cy="39" rx="6.8" ry="8.6" fill="#4A3540" />
      <ellipse cx="89" cy="39" rx="6.8" ry="8.6" fill="#4A3540" />
      <ellipse cx="61" cy="41.5" rx="6.8" ry="4.4" fill="#6B4E5A" opacity="0.5" />
      <ellipse cx="89" cy="41.5" rx="6.8" ry="4.4" fill="#6B4E5A" opacity="0.5" />
      <circle cx="63.6" cy="34.5" r="2.1" fill="#FFF" />
      <circle cx="91.6" cy="34.5" r="2.1" fill="#FFF" />
      <circle cx="58.5" cy="43" r="1.1" fill="#FFF" opacity="0.85" />
      <circle cx="86.5" cy="43" r="1.1" fill="#FFF" opacity="0.85" />

      {/* tiny button nose — just a soft dot, no harsh lines */}
      <circle cx="75" cy="47" r="1" fill="#E3AE87" opacity="0.55" />

      {/* cute open smile — tinted by equipped lip product */}
      <path
        d="M66 55 Q75 61.5 84 55"
        stroke={lipColor || "#E08B8B"}
        strokeWidth={lipColor ? 3.2 : 2.6}
        fill="none"
        strokeLinecap="round"
      />

      {earringColor && (
        <>
          <circle cx="43" cy="50" r="2.4" fill={earringColor} />
          <circle cx="107" cy="50" r="2.4" fill={earringColor} />
        </>
      )}
    </g>
  );
}
