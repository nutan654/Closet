/**
 * Frosted glass surface — Step 12/13 material. A translucent white panel
 * with blur so whatever's behind it (the layered body background, a hero
 * gradient) softly shows through instead of a flat opaque card.
 */
export default function GlassPanel({ children, className = "", as: Tag = "div", ...props }) {
  return (
    <Tag
      className={`bg-white/60 backdrop-blur-md border border-white/70 shadow-sm ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}
