/**
 * lib/doll/__tests__/garmentShapes.test.js
 *
 * Covers brief section 21, items 1, 13: "garment category selection" and
 * "switching garments," plus the core "distinct silhouette per category"
 * requirement from section 3.
 */

import { describe, test, expect } from "vitest";
import {
  GARMENT_SHAPES,
  resolveShape,
  defaultSubtype,
  fitScale,
  categoryAnchor,
} from "../garmentShapes";

describe("resolveShape", () => {
  test("returns a distinct shape per subtype within the same category", () => {
    const tshirt = resolveShape("tops", "T-Shirt");
    const shirt = resolveShape("tops", "Shirt");
    const top = resolveShape("tops", "Top");
    expect(tshirt.paths).not.toEqual(shirt.paths);
    expect(tshirt.paths).not.toEqual(top.paths);
    expect(shirt.paths).not.toEqual(top.paths);
  });

  test("a T-shirt is not the same silhouette as a jacket (cross-category)", () => {
    const tshirt = resolveShape("tops", "T-Shirt");
    const jacket = resolveShape("outerwear", "Jacket");
    expect(tshirt.paths).not.toEqual(jacket.paths);
  });

  test("skirt is a single-path silhouette, pants is a two-path (leg-split) silhouette", () => {
    const skirt = resolveShape("bottoms", "Skirt");
    const pants = resolveShape("bottoms", "Pants");
    expect(skirt.paths.length).toBe(1);
    expect(pants.paths.length).toBe(2);
  });

  test("falls back to the category's default subtype for an unknown subtype", () => {
    const fallback = resolveShape("tops", "NotARealSubtype");
    const expected = resolveShape("tops", defaultSubtype("tops"));
    expect(fallback).toEqual(expected);
  });

  test("returns null for an unknown category entirely", () => {
    expect(resolveShape("hats", "Beanie")).toBeNull();
  });

  test("every registered category has at least one subtype with a non-empty path list", () => {
    for (const category of Object.keys(GARMENT_SHAPES)) {
      const subtype = defaultSubtype(category);
      const shape = resolveShape(category, subtype);
      expect(shape).not.toBeNull();
      expect(shape.paths.length).toBeGreaterThan(0);
      for (const d of shape.paths) {
        expect(typeof d).toBe("string");
        expect(d.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("fitScale", () => {
  test("Regular fit is scale 1 (identity, no visual change)", () => {
    expect(fitScale("Regular")).toBe(1);
  });

  test("Oversized is larger than Regular; Fitted/Cropped are smaller", () => {
    expect(fitScale("Oversized")).toBeGreaterThan(1);
    expect(fitScale("Fitted")).toBeLessThan(1);
    expect(fitScale("Cropped")).toBeLessThan(1);
  });

  test("unknown fit falls back to identity scale", () => {
    expect(fitScale("MadeUpFit")).toBe(1);
  });
});

describe("categoryAnchor", () => {
  test("every doll-renderable category has an anchor point", () => {
    for (const category of ["tops", "bottoms", "outerwear", "dresses"]) {
      const anchor = categoryAnchor(category);
      expect(typeof anchor.x).toBe("number");
      expect(typeof anchor.y).toBe("number");
    }
  });

  test("unknown category still returns a usable fallback anchor", () => {
    const anchor = categoryAnchor("hats");
    expect(typeof anchor.x).toBe("number");
    expect(typeof anchor.y).toBe("number");
  });
});
