import Body from "./Body";
import Hair from "./Hair";
import Bottoms from "./Bottoms";
import Tops from "./Tops";
import Dress from "./Dress";
import Outerwear from "./Outerwear";
import Face from "./Face";
import Bag from "./Bag";
import Accessory from "./Accessory";

/**
 * equipped: { tops, bottoms, dresses, outerwear, shoes, bags, accessories, jewelry, makeup }
 * each value (if present) is the full item object: { color, fit, subtype,
 * patternUrl, patternScale, patternOffsetX, patternOffsetY,
 * patternRotation, patternTint, ... } — see lib/model.js's mkItem() for
 * the full frontend item shape and lib/doll/pattern.js for what the
 * pattern* fields mean.
 *
 * Layer order (back to front) — the authoritative definition lives in
 * lib/doll/layers.js (LAYER_ORDER); this JSX follows it in the same
 * sequence so there's exactly one place that decides stacking, per the
 * brief's "central layer-order definition" requirement (section 5):
 *   Hair (back) -> Body -> Bottoms -> Tops/Dress -> Outerwear -> Accessory (scarf) -> Face -> Hair (front) -> Jewelry -> Bag
 *
 * bags/accessories used to be equippable slots with no visual at all —
 * equipping one saved fine but nothing on the doll ever changed. Bag.jsx
 * / Accessory.jsx give them an actual (simple, solid-fill) shape so
 * "equipped" is always visibly true, same as every other slot.
 *
 * Garment rendering itself (shape + solid/pattern/tint fill) is handled by
 * GarmentRenderer.jsx via the Tops/Bottoms/Outerwear/Dress wrappers below
 * — Doll.jsx only decides *which* garments are equipped and in what
 * order, never how a garment is drawn (brief section 25).
 */
export default function Doll({ equipped = {}, pose = "standing", className = "" }) {
  const { tops, bottoms, dresses, outerwear, shoes, bags, accessories, jewelry, makeup } = equipped;

  const lipColor = makeup?.category === "makeup" && /lip/i.test(makeup.name || "") ? makeup.color : null;
  const cheekColor = makeup?.category === "makeup" && /blush|cheek/i.test(makeup.name || "") ? makeup.color : null;
  const earringColor = jewelry?.subtype === "Earrings" ? jewelry.color : null;
  const jewelryColor = jewelry && jewelry.subtype !== "Earrings" ? jewelry.color : null;

  // Every garment's own equipped item id scopes its SVG <pattern> defs
  // (GarmentRenderer's instanceId), so two patterned garments worn at
  // once never collide on the same <defs> id.
  const patternProps = (item) => ({
    id: item?.id,
    patternUrl: item?.patternUrl,
    patternScale: item?.patternScale,
    patternOffsetX: item?.patternOffsetX,
    patternOffsetY: item?.patternOffsetY,
    patternRotation: item?.patternRotation,
    patternTint: item?.patternTint,
  });

  return (
    <svg viewBox="0 0 150 210" className={className} xmlns="http://www.w3.org/2000/svg">
      <Hair color="#9C7259" part="back" />
      <Body pose={pose} shoesColor={shoes?.color || "#E9C9A6"} />

      {dresses ? (
        <Dress color={dresses.color} fit={dresses.fit} {...patternProps(dresses)} />
      ) : (
        <>
          <Tops color={tops?.color} fit={tops?.fit} subtype={tops?.subtype} {...patternProps(tops)} />
          <Bottoms color={bottoms?.color} fit={bottoms?.fit} subtype={bottoms?.subtype} {...patternProps(bottoms)} />
        </>
      )}

      <Outerwear color={outerwear?.color} fit={outerwear?.fit} subtype={outerwear?.subtype} {...patternProps(outerwear)} />
      <Accessory color={accessories?.color} />
      <Face lipColor={lipColor} cheekColor={cheekColor} earringColor={earringColor} />
      <Hair color="#9C7259" part="front" />
      {jewelryColor && <circle cx="75" cy="72" r="3.2" fill={jewelryColor} />}
      <Bag color={bags?.color} />
    </svg>
  );
}
