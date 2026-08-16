import Tops from "./doll/Tops";
import Bottoms from "./doll/Bottoms";
import Dress from "./doll/Dress";
import Outerwear from "./doll/Outerwear";

const GARMENT_COMPONENTS = { tops: Tops, bottoms: Bottoms, dresses: Dress, outerwear: Outerwear };

/**
 * Step 8/9 of the premium pass: "Pink floral crop top" should look like a
 * pink crop top, not a generic pink square. This reuses the exact same
 * fit-shaped paths the doll wears, cropped in tight on a torso-height slice
 * of the shared 150x210 doll viewBox — so a card thumbnail and the doll
 * wearing that item are always literally the same silhouette.
 *
 * Phase 5: also passes subtype + the pattern* fields through, and the
 * item's own id as GarmentRenderer's instanceId — same props Doll.jsx
 * passes, via the same Tops/Bottoms/Outerwear/Dress components (which
 * both this and Doll.jsx call, per the GarmentRenderer architecture in
 * components/doll/GarmentRenderer.jsx). This is *why* a preview and the
 * doll can never visually diverge: they're not two rendering paths kept
 * in sync by hand, they're the same call.
 *
 * Returns null for categories with no garment silhouette yet (shoes, bags,
 * jewelry, etc.) — ItemCard falls back to the category emoji for those.
 */
export default function GarmentPreview({ item, className = "" }) {
  const Garment = GARMENT_COMPONENTS[item.category];
  if (!Garment) return null;

  // Every category falls back to the same placeholder swatch when an item
  // has no color set yet (e.g. mid-creation) — outerwear used to skip this
  // fallback, which meant an uncolored jacket rendered as nothing at all
  // (GarmentRenderer bails out when both color and patternUrl are falsy)
  // instead of the same soft lavender placeholder every other category
  // gets. Unified so preview and doll never silently go blank.
  const props = { color: item.color || "#E7DEF2", fit: item.fit };

  return (
    <svg viewBox="30 72 90 102" className={className} xmlns="http://www.w3.org/2000/svg">
      <Garment
        {...props}
        subtype={item.subtype}
        id={item.id}
        patternUrl={item.patternUrl}
        patternScale={item.patternScale}
        patternOffsetX={item.patternOffsetX}
        patternOffsetY={item.patternOffsetY}
        patternRotation={item.patternRotation}
        patternTint={item.patternTint}
      />
    </svg>
  );
}
