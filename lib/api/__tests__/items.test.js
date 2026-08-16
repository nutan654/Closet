/**
 * lib/api/__tests__/items.test.js
 *
 * Phase 4.4: tests for lib/api/items.js's multipart detection, and for
 * the specific upload error codes the backend's apperror package returns
 * (backend/internal/apperror/apperror.go — ERR_FILE_TOO_LARGE,
 * ERR_UNSUPPORTED_FILE_TYPE, ERR_INVALID_IMAGE). Fetch is fully mocked —
 * no live Go server required.
 */

import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { createItem, deleteItem } from "../items";
import { ApiError } from "../client";
import { clearTokens } from "../tokenStore";

function envelope(success, data, message, error) {
  return JSON.stringify({ success, data, message, error });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:8080/api/v1";
  clearTokens();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete global.fetch;
});

describe("createItem: multipart vs JSON detection", () => {
  test("a plain object is sent as application/json to POST /items", async () => {
    let capturedHeaders;
    let capturedBody;
    global.fetch = vi.fn(async (url, opts) => {
      expect(url).toBe("http://localhost:8080/api/v1/items");
      expect(opts.method).toBe("POST");
      capturedHeaders = opts.headers;
      capturedBody = opts.body;
      return new Response(envelope(true, { id: "item_1" }, "added to your closet ✨"), { status: 201 });
    });

    await createItem({ category: "tops", name: "Plain Top", color: "#FFD9BE" });

    expect(capturedHeaders["Content-Type"]).toBe("application/json");
    expect(JSON.parse(capturedBody)).toEqual({ category: "tops", name: "Plain Top", color: "#FFD9BE" });
  });

  test("a FormData instance is sent multipart, field name 'image', browser sets its own Content-Type", async () => {
    let capturedHeaders;
    let capturedBody;
    global.fetch = vi.fn(async (url, opts) => {
      capturedHeaders = opts.headers;
      capturedBody = opts.body;
      return new Response(
        envelope(true, { id: "item_2", imageUrl: "https://cdn/full.jpg", thumbnailUrl: "https://cdn/thumb.jpg" }, "added to your closet ✨"),
        { status: 201 }
      );
    });

    const fd = new FormData();
    fd.append("category", "dresses");
    fd.append("name", "Sage Dress");
    fd.append("color", "#B7C9A8");
    fd.append("image", new File(["bytes"], "dress.png", { type: "image/png" }));

    const created = await createItem(fd);

    expect(capturedBody).toBe(fd);
    expect(capturedHeaders["Content-Type"]).toBeUndefined(); // never set manually — the browser generates the multipart boundary
    expect(created.imageUrl).toBe("https://cdn/full.jpg");
    expect(created.thumbnailUrl).toBe("https://cdn/thumb.jpg");
  });
});

describe("createItem: backend upload validation errors", () => {
  test("ERR_FILE_TOO_LARGE (413) surfaces the backend's friendly message", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(envelope(false, null, "image exceeds the maximum allowed file size", "ERR_FILE_TOO_LARGE"), {
          status: 413,
        })
    );

    const err = await createItem(new FormData()).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(413);
    expect(err.code).toBe("ERR_FILE_TOO_LARGE");
    expect(err.message).toBe("image exceeds the maximum allowed file size");
  });

  test("ERR_UNSUPPORTED_FILE_TYPE (415) surfaces the backend's friendly message", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          envelope(false, null, "only JPEG, PNG, and WebP images are supported", "ERR_UNSUPPORTED_FILE_TYPE"),
          { status: 415 }
        )
    );

    const err = await createItem(new FormData()).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(415);
    expect(err.code).toBe("ERR_UNSUPPORTED_FILE_TYPE");
    expect(err.message).toBe("only JPEG, PNG, and WebP images are supported");
  });

  test("ERR_INVALID_IMAGE (400, corrupt file) surfaces the backend's friendly message", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          envelope(false, null, "the uploaded file could not be read as a valid image", "ERR_INVALID_IMAGE"),
          { status: 400 }
        )
    );

    const err = await createItem(new FormData()).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("ERR_INVALID_IMAGE");
    expect(err.message).toBe("the uploaded file could not be read as a valid image");
  });

  test("network failure during an image upload normalizes to NETWORK_ERROR, same as any other request", async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const err = await createItem(new FormData()).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.code).toBe("NETWORK_ERROR");
  });
});

describe("deleteItem: storage cleanup is entirely the backend's responsibility", () => {
  test("DELETE /items/:id is called; the frontend does not attempt any separate cleanup call", async () => {
    global.fetch = vi.fn(async (url, opts) => {
      expect(url).toBe("http://localhost:8080/api/v1/items/item_with_image");
      expect(opts.method).toBe("DELETE");
      return new Response(envelope(true, null, "removed"), { status: 200 });
    });

    await deleteItem("item_with_image");
    expect(global.fetch).toHaveBeenCalledTimes(1); // exactly one call — no extra frontend storage/cleanup request
  });
});
