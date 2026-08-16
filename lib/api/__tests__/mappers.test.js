/**
 * lib/api/__tests__/mappers.test.js
 *
 * Focused unit tests for the image-related mapping logic in mappers.js
 * (Phase 4.4). No fetch involved — these test the pure functions directly.
 */

import { describe, test, expect } from "vitest";
import { toFrontendItem, toItemCreatePayload } from "../mappers";

function apiItem(overrides = {}) {
  return {
    id: "item_1",
    category: "tops",
    name: "Sage Wrap Top",
    brand: "",
    price: 0,
    purchaseDate: null,
    expiryDate: null,
    consumable: false,
    inventoryPercent: 100,
    timesUsed: 0,
    status: "clean",
    notes: "",
    color: "#FFD9BE",
    photo: null,
    imageUrl: null,
    thumbnailUrl: null,
    worn: 0,
    favorite: false,
    fit: "regular",
    season: "all",
    occasion: "casual",
    material: "",
    size: "",
    shade: "",
    finish: "",
    subtype: "",
    cardStyle: "solid",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("toFrontendItem: image field mapping", () => {
  test("prefers thumbnailUrl for item.photo when both thumbnailUrl and imageUrl exist (cards render photo)", () => {
    const item = toFrontendItem(apiItem({ imageUrl: "https://cdn/full.jpg", thumbnailUrl: "https://cdn/thumb.jpg" }));
    expect(item.photo).toBe("https://cdn/thumb.jpg");
    expect(item.imageUrl).toBe("https://cdn/full.jpg"); // still available, just not what `photo` resolves to
    expect(item.thumbnailUrl).toBe("https://cdn/thumb.jpg");
  });

  test("falls back to imageUrl for item.photo when no thumbnail exists", () => {
    const item = toFrontendItem(apiItem({ imageUrl: "https://cdn/full.jpg", thumbnailUrl: null }));
    expect(item.photo).toBe("https://cdn/full.jpg");
  });

  test("falls back to the legacy free-text photo field when no uploaded image exists at all", () => {
    const item = toFrontendItem(apiItem({ imageUrl: null, thumbnailUrl: null, photo: "https://legacy.example/old.jpg" }));
    expect(item.photo).toBe("https://legacy.example/old.jpg");
  });

  test("resolves to null when no image field of any kind is present", () => {
    const item = toFrontendItem(apiItem({ imageUrl: null, thumbnailUrl: null, photo: null }));
    expect(item.photo).toBeNull();
  });

  test("maps the remaining image metadata fields through unchanged", () => {
    const item = toFrontendItem(
      apiItem({ imageMimeType: "image/webp", imageFileSize: 204800, imageWidth: 1200, imageHeight: 1600 })
    );
    expect(item.imageMimeType).toBe("image/webp");
    expect(item.imageFileSize).toBe(204800);
    expect(item.imageWidth).toBe(1200);
    expect(item.imageHeight).toBe(1600);
  });
});

describe("toItemCreatePayload: File -> FormData conversion", () => {
  test("returns a plain JSON-able object (not FormData) when no imageFile is given", () => {
    const payload = toItemCreatePayload({ category: "tops", name: "Plain Top", color: "#FFD9BE" });
    expect(payload instanceof FormData).toBe(false);
    expect(payload).toMatchObject({ category: "tops", name: "Plain Top", color: "#FFD9BE" });
  });

  test("returns a FormData instance with the raw File under the 'image' field when imageFile is a File", () => {
    const file = new File(["bytes"], "dress.png", { type: "image/png" });
    const payload = toItemCreatePayload({ category: "dresses", name: "Sage Dress", color: "#B7C9A8", imageFile: file });
    expect(payload instanceof FormData).toBe(true);
    expect(payload.get("image")).toBe(file);
    expect(payload.get("category")).toBe("dresses");
    expect(payload.get("name")).toBe("Sage Dress");
    // Never base64/data-URL encoded — the browser handles multipart encoding of the raw File.
    expect(typeof payload.get("image")).not.toBe("string");
  });

  test("a non-File imageFile value (e.g. a stale data-URL string) is ignored, not sent as-is", () => {
    const payload = toItemCreatePayload({ category: "tops", name: "Top", color: "#FFD9BE", imageFile: "data:image/png;base64,AAAA" });
    expect(payload instanceof FormData).toBe(false); // falls back to the JSON path since it's not a real File
  });
});
