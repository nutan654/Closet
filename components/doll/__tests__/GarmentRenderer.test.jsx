// @vitest-environment jsdom
/**
 * components/doll/__tests__/GarmentRenderer.test.jsx
 *
 * Covers brief section 21, items 6, 7, 8, 9, 10, 14: solid color
 * rendering, pattern rendering, pattern + tint, "garment renderer
 * receives correct data," "doll receives equipped garments correctly,"
 * and clearing a pattern.
 */

import { describe, test, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import GarmentRenderer from "../GarmentRenderer";
import Doll from "../Doll";

afterEach(() => {
  cleanup();
});

// GarmentRenderer emits raw <path>/<pattern> SVG elements with no
// top-level wrapper element carrying a test id, so tests render inside a
// real <svg> (required for valid SVG child elements) and query by tag.
function renderInSvg(children) {
  return render(<svg>{children}</svg>);
}

describe("GarmentRenderer — solid color", () => {
  test("renders a solid-fill path when no pattern is set", () => {
    const { container } = renderInSvg(
      <GarmentRenderer category="tops" subtype="T-Shirt" fit="Regular" color="#FF0000" instanceId="item_1" />
    );
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((p) => expect(p.getAttribute("fill")).toBe("#FF0000"));
    // No <defs>/<pattern> should exist for a plain solid fill.
    expect(container.querySelector("pattern")).toBeNull();
  });

  test("renders nothing when neither color nor pattern is provided", () => {
    const { container } = renderInSvg(<GarmentRenderer category="tops" subtype="T-Shirt" />);
    expect(container.querySelector("path")).toBeNull();
  });

  test("renders nothing for an unregistered category", () => {
    const { container } = renderInSvg(<GarmentRenderer category="hats" color="#FF0000" />);
    expect(container.querySelector("path")).toBeNull();
  });
});

describe("GarmentRenderer — pattern", () => {
  test("renders a <pattern> def and fills the path with url(#...) when patternUrl is set", () => {
    const { container } = renderInSvg(
      <GarmentRenderer
        category="tops"
        subtype="Shirt"
        color="#00AA00"
        instanceId="item_2"
        patternStyle={{ patternUrl: "https://example.com/tile.png" }}
      />
    );
    const pattern = container.querySelector("pattern");
    expect(pattern).not.toBeNull();
    const image = pattern.querySelector("image");
    expect(image.getAttribute("href")).toBe("https://example.com/tile.png");

    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
    const fillUrl = paths[0].getAttribute("fill");
    expect(fillUrl.startsWith("url(#")).toBe(true);
  });

  test("pattern + tint adds an extra multiply-blended color pass over the same geometry", () => {
    const { container } = renderInSvg(
      <GarmentRenderer
        category="tops"
        subtype="Shirt"
        color="#3333FF"
        instanceId="item_3"
        patternStyle={{ patternUrl: "https://example.com/tile.png", patternTint: true }}
      />
    );
    // One <g> for the tint overlay, containing paths filled with the solid color.
    const tintPaths = Array.from(container.querySelectorAll("path")).filter(
      (p) => p.getAttribute("fill") === "#3333FF"
    );
    expect(tintPaths.length).toBeGreaterThan(0);
  });

  test("pattern without tint does NOT add a solid-color overlay pass", () => {
    const { container } = renderInSvg(
      <GarmentRenderer
        category="tops"
        subtype="Shirt"
        color="#3333FF"
        instanceId="item_4"
        patternStyle={{ patternUrl: "https://example.com/tile.png", patternTint: false }}
      />
    );
    const tintPaths = Array.from(container.querySelectorAll("path")).filter(
      (p) => p.getAttribute("fill") === "#3333FF"
    );
    expect(tintPaths.length).toBe(0);
  });

  test("two garments rendered together never collide on <pattern> ids", () => {
    const { container } = renderInSvg(
      <>
        <GarmentRenderer
          category="tops"
          instanceId="item_A"
          color="#111111"
          patternStyle={{ patternUrl: "a.png" }}
        />
        <GarmentRenderer
          category="outerwear"
          instanceId="item_B"
          color="#222222"
          patternStyle={{ patternUrl: "b.png" }}
        />
      </>
    );
    const ids = Array.from(container.querySelectorAll("pattern")).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });

  test("clearing a pattern (patternUrl: null) falls back to solid color rendering", () => {
    const { container, rerender } = renderInSvg(
      <GarmentRenderer
        category="tops"
        instanceId="item_5"
        color="#654321"
        patternStyle={{ patternUrl: "https://example.com/tile.png" }}
      />
    );
    expect(container.querySelector("pattern")).not.toBeNull();

    rerender(
      <svg>
        <GarmentRenderer category="tops" instanceId="item_5" color="#654321" patternStyle={{ patternUrl: null }} />
      </svg>
    );
    expect(container.querySelector("pattern")).toBeNull();
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((p) => expect(p.getAttribute("fill")).toBe("#654321"));
  });
});

describe("Doll — equipped garments receive correct data", () => {
  test("an equipped top renders its color as a path fill somewhere in the doll", () => {
    const equipped = { tops: { id: "item_top", color: "#ABCDEF", fit: "Regular", subtype: "T-Shirt" } };
    const { container } = render(<Doll equipped={equipped} />);
    const match = Array.from(container.querySelectorAll("path")).some(
      (p) => p.getAttribute("fill") === "#ABCDEF"
    );
    expect(match).toBe(true);
  });

  test("dresses take precedence over tops+bottoms (mutually exclusive slots)", () => {
    const equipped = {
      dresses: { id: "item_dress", color: "#112233", fit: "Regular" },
      tops: { id: "item_top", color: "#445566", fit: "Regular" },
      bottoms: { id: "item_bottom", color: "#778899", fit: "Regular" },
    };
    const { container } = render(<Doll equipped={equipped} />);
    const fills = Array.from(container.querySelectorAll("path")).map((p) => p.getAttribute("fill"));
    expect(fills).toContain("#112233");
    expect(fills).not.toContain("#445566");
    expect(fills).not.toContain("#778899");
  });

  test("an equipped item's id scopes its pattern defs on the doll (no id collisions)", () => {
    const equipped = {
      tops: { id: "item_top", color: "#111111", patternUrl: "top.png" },
      outerwear: { id: "item_jacket", color: "#222222", patternUrl: "jacket.png" },
    };
    const { container } = render(<Doll equipped={equipped} />);
    const ids = Array.from(container.querySelectorAll("pattern")).map((p) => p.id);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
  });

  test("an empty equipped map renders the doll with no garment paint (base doll only)", () => {
    const { container } = render(<Doll equipped={{}} />);
    // Doll always renders (hair/body/face), but no garment-colored path exists.
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("pattern")).toBeNull();
  });
});
