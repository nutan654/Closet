export default function Body({ pose = "standing", shoesColor = "#E9C9A6" }) {
  const legs =
    pose === "sitting" ? (
      <>
        <rect x="56" y="150" width="42" height="16" rx="8" fill="#F3C9A3" />
        <rect x="54" y="160" width="16" height="30" rx="8" fill="#F3C9A3" />
        <rect x="80" y="160" width="16" height="30" rx="8" fill="#F3C9A3" />
        <ellipse cx="62" cy="190" rx="11" ry="7" fill={shoesColor} />
        <ellipse cx="88" cy="190" rx="11" ry="7" fill={shoesColor} />
      </>
    ) : (
      <>
        <rect x="60" y="140" width="12" height="45" rx="6" fill="#F3C9A3" />
        <rect x="78" y="140" width="12" height="45" rx="6" fill="#F3C9A3" />
        <ellipse cx="66" cy="188" rx="11" ry="7" fill={shoesColor} />
        <ellipse cx="84" cy="188" rx="11" ry="7" fill={shoesColor} />
      </>
    );

  return (
    <g>
      {legs}
      {/* torso base (visible only where no top/dress covers it) */}
      <rect x="38" y="95" width="10" height="38" rx="5" fill="#F3C9A3" />
      <rect x="102" y="95" width="10" height="38" rx="5" fill="#F3C9A3" />
      {/* neck — wider/taller than before to bridge the bigger chibi head down to the torso */}
      <rect x="65" y="68" width="20" height="30" rx="9" fill="#F3C9A3" />
    </g>
  );
}
