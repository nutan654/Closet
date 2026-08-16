export default function Hair({ color = "#9C7259", part = "back" }) {
  if (part === "front") {
    return (
      <g>
        {/* solid fringe, drawn on top of the face (see Doll.jsx layer order) so
            it actually covers the forehead instead of hiding behind it */}
        <path
          d="M38 30 Q40 4 75 3 Q110 4 112 30 Q104 20 90 26 Q75 18 60 26 Q46 20 38 30 Z"
          fill={color}
        />
        {/* little cowlick curl — the signature cute touch */}
        <path d="M71 8 Q76 0 84 5 Q80 8 73 10 Z" fill={color} />

        {/* tiny bow clip, tucked at the side part */}
        <g transform="translate(99, 17)">
          <path
            d="M-7 0 Q-13 -7 -5 -9 Q0 -5 0 0 Q0 -5 5 -9 Q13 -7 7 0 Q0 4 0 4 Q0 4 -7 0 Z"
            fill="#FFB6CD"
          />
          <circle cx="0" cy="0" r="2" fill="#FF95B4" />
        </g>
      </g>
    );
  }
  return (
    <g>
      {/*
        Back hair, as one continuous silhouette rather than a center cap
        plus two separate side slivers. The old three-piece version left
        a visible gap at the cheek/ear line on both sides — the side
        pieces curved inward before they reached the face ellipse's own
        edge (Face.jsx: cx 75 cy 41 rx 33 ry 32), so a sliver of the
        cream page background showed through between hair and face at
        certain widths. This shape's vertical sides sit at x=38/x=112 —
        consistently outside the face ellipse's edge at every y from the
        crown down through the jaw — so there's no curve-tuning left that
        can reopen that gap; the coverage is guaranteed by geometry, not
        by two matching curves happening to line up.
      */}
      <path
        d="M38 30 Q38 4 75 4 Q112 4 112 30 L112 76 Q112 92 96 97 L54 97 Q38 92 38 76 Z"
        fill={color}
      />
      {/* soft shine streak for a bit of depth, works on any hair color */}
      <path d="M87 12 Q99 20 95 38" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.22" />
    </g>
  );
}
