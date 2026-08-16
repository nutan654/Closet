/**
 * lib/doll/__tests__/pattern.test.js
 *
 * Covers brief section 21, items 3-6, 8, 9, 12: pattern repeat
 * generation, scaling, positioning, solid color rendering, pattern
 * rendering, pattern + tint, and malformed pattern input.
 */

import { describe, test, expect } from "vitest";
import {
  PATTERN_SCALE_MIN,
  PATTERN_SCALE_MAX,
  PATTERN_BASE_TILE_PX,
  DEFAULT_PATTERN_STYLE,
  normalizePatternStyle,
  clampScale,
  computePatternTransform,
  patternDefsId,
  resolveFillMode,
} from "../pattern";

describe("normalizePatternStyle", () => {
  test("defaults every field when given nothing", () => {
    expect(normalizePatternStyle(undefined)).toEqual(DEFAULT_PATTERN_STYLE);
    expect(normalizePatternStyle(null)).toEqual(DEFAULT_PATTERN_STYLE);
    expect(normalizePatternStyle({})).toEqual(DEFAULT_PATTERN_STYLE);
  });

  test("passes through valid values unchanged", () => {
    const style = normalizePatternStyle({
      patternUrl: "https://example.com/tile.png",
      patternScale: 1.5,
      patternOffsetX: 10,
      patternOffsetY: -5,
      patternRotation: 45,
      patternTint: true,
    });
    expect(style.patternUrl).toBe("https://example.com/tile.png");
    expect(style.patternScale).toBe(1.5);
    expect(style.patternOffsetX).toBe(10);
    expect(style.patternOffsetY).toBe(-5);
    expect(style.patternRotation).toBe(45);
    expect(style.patternTint).toBe(true);
  });

  // "malformed pattern input" — brief section 21, item 12.
  test("malformed input never throws and always resolves to safe defaults", () => {
    expect(() => normalizePatternStyle("banana")).not.toThrow();
    expect(() => normalizePatternStyle(42)).not.toThrow();
    expect(() => normalizePatternStyle([1, 2, 3])).not.toThrow();

    const style = normalizePatternStyle({
      patternUrl: 12345, // not a string
      patternScale: "not-a-number",
      patternOffsetX: NaN,
      patternOffsetY: undefined,
      patternRotation: "banana",
      patternTint: "yes", // truthy non-boolean is fine, coerced
    });
    expect(style.patternUrl).toBeNull();
    expect(style.patternScale).toBe(DEFAULT_PATTERN_STYLE.patternScale);
    expect(style.patternOffsetX).toBe(0);
    expect(style.patternOffsetY).toBe(0);
    expect(style.patternRotation).toBe(0);
    expect(style.patternTint).toBe(true);
  });

  test("empty-string patternUrl is treated as no pattern", () => {
    expect(normalizePatternStyle({ patternUrl: "" }).patternUrl).toBeNull();
  });

  test("negative rotation normalizes into [0, 360)", () => {
    expect(normalizePatternStyle({ patternRotation: -90 }).patternRotation).toBe(270);
    expect(normalizePatternStyle({ patternRotation: 720 }).patternRotation).toBe(0);
    expect(normalizePatternStyle({ patternRotation: 405 }).patternRotation).toBe(45);
  });
});

describe("clampScale", () => {
  test("clamps below the minimum", () => {
    expect(clampScale(0)).toBe(PATTERN_SCALE_MIN);
    expect(clampScale(-5)).toBe(PATTERN_SCALE_MIN);
  });

  test("clamps above the maximum", () => {
    expect(clampScale(999)).toBe(PATTERN_SCALE_MAX);
  });

  test("passes through an in-range value", () => {
    expect(clampScale(2)).toBe(2);
  });
});

describe("computePatternTransform", () => {
  test("scale=1 with no offset/rotation produces the base tile size and no transform", () => {
    const t = computePatternTransform({ patternScale: 1 });
    expect(t.width).toBe(PATTERN_BASE_TILE_PX);
    expect(t.height).toBe(PATTERN_BASE_TILE_PX);
    expect(t.patternTransform).toBeUndefined();
  });

  test("scale doubles the tile dimensions proportionally", () => {
    const t = computePatternTransform({ patternScale: 2 });
    expect(t.width).toBe(PATTERN_BASE_TILE_PX * 2);
    expect(t.height).toBe(PATTERN_BASE_TILE_PX * 2);
  });

  test("a non-zero offset produces a translate() in the transform string", () => {
    const t = computePatternTransform({ patternOffsetX: 5, patternOffsetY: -3 });
    expect(t.patternTransform).toContain("translate(5 -3)");
  });

  test("a non-zero rotation produces a rotate() around the tile center", () => {
    const t = computePatternTransform({ patternScale: 1, patternRotation: 30 });
    const half = PATTERN_BASE_TILE_PX / 2;
    expect(t.patternTransform).toContain(`rotate(30 ${half} ${half})`);
  });

  test("out-of-range scale is clamped before computing tile size", () => {
    const t = computePatternTransform({ patternScale: 999 });
    expect(t.width).toBe(PATTERN_BASE_TILE_PX * PATTERN_SCALE_MAX);
  });
});

describe("patternDefsId", () => {
  test("produces a stable, collision-scoped id per instance+category", () => {
    expect(patternDefsId("item_abc123", "tops")).toBe("pat-tops-item_abc123");
  });

  test("strips characters that aren't valid in an SVG id", () => {
    expect(patternDefsId("item abc/123!", "tops")).toBe("pat-tops-itemabc123");
  });

  test("falls back to 'anon' for a missing instance id", () => {
    expect(patternDefsId(undefined, "bottoms")).toBe("pat-bottoms-anon");
  });

  test("two different items never collide", () => {
    const a = patternDefsId("item_1", "tops");
    const b = patternDefsId("item_2", "tops");
    expect(a).not.toBe(b);
  });
});

describe("resolveFillMode", () => {
  test("no patternUrl -> solid", () => {
    expect(resolveFillMode({ patternUrl: null })).toBe("solid");
    expect(resolveFillMode({})).toBe("solid");
  });

  test("patternUrl without tint -> pattern", () => {
    expect(resolveFillMode({ patternUrl: "x.png", patternTint: false })).toBe("pattern");
  });

  test("patternUrl with tint -> pattern-tint", () => {
    expect(resolveFillMode({ patternUrl: "x.png", patternTint: true })).toBe("pattern-tint");
  });
});
