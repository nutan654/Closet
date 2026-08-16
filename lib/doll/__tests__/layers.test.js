/**
 * lib/doll/__tests__/layers.test.js
 *
 * Covers brief section 21, item 2: "garment layer ordering."
 */

import { describe, test, expect } from "vitest";
import { LAYER, LAYER_ORDER, layerIndex, isAbove, CATEGORY_LAYER } from "../layers";

describe("LAYER_ORDER", () => {
  test("contains every LAYER value exactly once", () => {
    const values = Object.values(LAYER);
    expect(LAYER_ORDER.length).toBe(values.length);
    for (const v of values) {
      expect(LAYER_ORDER.filter((x) => x === v).length).toBe(1);
    }
  });

  test("body paints before any garment layer", () => {
    expect(isAbove(LAYER.TOP, LAYER.BODY)).toBe(true);
    expect(isAbove(LAYER.BOTTOM, LAYER.BODY)).toBe(true);
    expect(isAbove(LAYER.DRESS, LAYER.BODY)).toBe(true);
  });

  test("outerwear (jacket) paints above tops/bottoms/dresses", () => {
    expect(isAbove(LAYER.OUTERWEAR, LAYER.TOP)).toBe(true);
    expect(isAbove(LAYER.OUTERWEAR, LAYER.BOTTOM)).toBe(true);
    expect(isAbove(LAYER.OUTERWEAR, LAYER.DRESS)).toBe(true);
  });

  test("a shirt (top) paints above the body — brief's explicit example", () => {
    expect(isAbove(LAYER.TOP, LAYER.BODY)).toBe(true);
  });

  test("a jacket paints above a shirt — brief's explicit example", () => {
    expect(isAbove(LAYER.OUTERWEAR, LAYER.TOP)).toBe(true);
  });

  test("accessories (necklace) paint above clothing", () => {
    expect(isAbove(LAYER.ACCESSORIES, LAYER.OUTERWEAR)).toBe(true);
    expect(isAbove(LAYER.ACCESSORIES, LAYER.DRESS)).toBe(true);
  });

  test("jewelry paints last, above hair/face", () => {
    expect(isAbove(LAYER.JEWELRY, LAYER.FACE)).toBe(true);
    expect(isAbove(LAYER.JEWELRY, LAYER.HAIR_FRONT)).toBe(true);
  });

  test("isAbove is false for an unknown layer name", () => {
    expect(isAbove("not-a-layer", LAYER.BODY)).toBe(false);
    expect(isAbove(LAYER.BODY, "not-a-layer")).toBe(false);
  });

  test("isAbove is false when the same layer is compared to itself", () => {
    expect(isAbove(LAYER.TOP, LAYER.TOP)).toBe(false);
  });

  test("layerIndex returns -1 for an unknown layer", () => {
    expect(layerIndex("nonexistent")).toBe(-1);
  });
});

describe("CATEGORY_LAYER", () => {
  test("maps every doll-renderable wardrobe category to a layer", () => {
    expect(CATEGORY_LAYER.tops).toBe(LAYER.TOP);
    expect(CATEGORY_LAYER.bottoms).toBe(LAYER.BOTTOM);
    expect(CATEGORY_LAYER.dresses).toBe(LAYER.DRESS);
    expect(CATEGORY_LAYER.outerwear).toBe(LAYER.OUTERWEAR);
  });

  test("does not map categories with no doll silhouette", () => {
    expect(CATEGORY_LAYER.shoes).toBeUndefined();
    expect(CATEGORY_LAYER.bags).toBeUndefined();
    expect(CATEGORY_LAYER.jewelry).toBeUndefined();
  });
});
