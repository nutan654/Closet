import Face from "./Face";
import Hair from "./Hair";

/**
 * A dedicated close-up composition for the Vanity Room: the doll's face,
 * scaled up and centered in a lit round mirror, hair rendered as a frame
 * around the face rather than the full-body silhouette.
 */
export default function VanityCloseup({ equipped = {}, className = "" }) {
  const { jewelry, makeup } = equipped;
  const lipColor = makeup?.category === "makeup" && /lip/i.test(makeup.name || "") ? makeup.color : null;
  const cheekColor = makeup?.category === "makeup" && /blush|cheek/i.test(makeup.name || "") ? makeup.color : null;
  const earringColor = jewelry?.subtype === "Earrings" ? jewelry.color : null;

  const bulbs = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = 118;
    return { x: 150 + Math.cos(angle) * r, y: 150 + Math.sin(angle) * r };
  });

  return (
    <svg viewBox="0 0 300 300" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* vanity mirror frame */}
      <circle cx="150" cy="150" r="128" fill="#FFFFFF" />
      <circle cx="150" cy="150" r="128" fill="none" stroke="#E4D9F0" strokeWidth="6" />
      {bulbs.map((b, i) => (
        <circle key={i} cx={b.x} cy={b.y} r="6" fill="#FFE9C7" stroke="#FFD9BE" strokeWidth="2" />
      ))}
      {/* mirror glass */}
      <circle cx="150" cy="150" r="112" fill="url(#mirrorGlass)" />
      <defs>
        <radialGradient id="mirrorGlass" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#FDF7F2" />
          <stop offset="100%" stopColor="#F1E6EE" />
        </radialGradient>
      </defs>

      {/* face, scaled + centered inside the glass */}
      <g transform="translate(52, 97) scale(1.3)">
        <Hair color="#9C7259" part="back" />
        <Face lipColor={lipColor} cheekColor={cheekColor} earringColor={earringColor} />
        <Hair color="#9C7259" part="front" />
        {/* order matters: bangs after face, so the fringe overlays the forehead like real hair */}
      </g>
    </svg>
  );
}
