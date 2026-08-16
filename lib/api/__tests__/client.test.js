/**
 * lib/api/__tests__/client.test.js
 *
 * Unit tests for lib/api/client.js. `fetch` is fully mocked — these never
 * require the Go server to be running (Phase 4.1 brief, section 12).
 */

import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { apiFetch, ApiError } from "../client";
import { setTokens, clearTokens } from "../tokenStore";

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:8080/api/v1";
  clearTokens();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete global.fetch;
});

describe("apiFetch — success cases", () => {
  test("successful GET unwraps envelope.data and sends the bearer token when set", async () => {
    setTokens({ accessToken: "test-access-token" });
    let capturedHeaders;
    global.fetch = vi.fn(async (url, opts) => {
      capturedHeaders = opts.headers;
      expect(url).toBe("http://localhost:8080/api/v1/items");
      expect(opts.method).toBe("GET");
      return new Response(
        JSON.stringify({ success: true, data: { items: [], total: 0, page: 1, perPage: 20, totalPages: 0 } }),
        { status: 200 }
      );
    });

    const data = await apiFetch("/items", { method: "GET" });

    expect(data).toEqual({ items: [], total: 0, page: 1, perPage: 20, totalPages: 0 });
    expect(capturedHeaders.Authorization).toBe("Bearer test-access-token");
  });

  test("successful POST sends a JSON body with Content-Type application/json", async () => {
    let capturedBody;
    let capturedHeaders;
    global.fetch = vi.fn(async (url, opts) => {
      capturedBody = opts.body;
      capturedHeaders = opts.headers;
      return new Response(
        JSON.stringify({ success: true, message: "outfit saved", data: { id: "outfit_1", name: "Brunch" } }),
        { status: 201 }
      );
    });

    const data = await apiFetch("/outfits", { method: "POST", body: { name: "Brunch", itemIds: [] } });

    expect(capturedHeaders["Content-Type"]).toBe("application/json");
    expect(JSON.parse(capturedBody)).toEqual({ name: "Brunch", itemIds: [] });
    expect(data).toEqual({ id: "outfit_1", name: "Brunch" });
  });

  test("multipart request passes FormData through untouched (no manual Content-Type)", async () => {
    let capturedHeaders;
    let capturedBody;
    global.fetch = vi.fn(async (url, opts) => {
      capturedHeaders = opts.headers;
      capturedBody = opts.body;
      return new Response(
        JSON.stringify({ success: true, message: "added to your closet ✨", data: { id: "item_1" } }),
        { status: 201 }
      );
    });

    const formData = new FormData();
    formData.append("name", "Sage Wrap Dress");
    formData.append("category", "dresses");

    const data = await apiFetch("/items", { method: "POST", body: formData, isFormData: true });

    // The browser (or undici, in Node) is responsible for setting
    // Content-Type + boundary — this client must never set it manually.
    expect(capturedHeaders["Content-Type"]).toBeUndefined();
    expect(capturedBody).toBe(formData);
    expect(data).toEqual({ id: "item_1" });
  });
});

describe("apiFetch — error cases", () => {
  test("structured API error throws a normalized ApiError", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: false, message: "item not found", error: "NOT_FOUND" }), {
          status: 404,
        })
    );

    const err = await apiFetch("/items/does-not-exist", { method: "DELETE" }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("item not found");
  });

  test("network failure normalizes to a NETWORK_ERROR ApiError", async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const err = await apiFetch("/items").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.code).toBe("NETWORK_ERROR");
  });

  test("timeout aborts the request and throws a TIMEOUT ApiError", async () => {
    global.fetch = vi.fn(
      (url, opts) =>
        new Promise((resolve, reject) => {
          opts.signal.addEventListener("abort", () => {
            const abortErr = new Error("The operation was aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
          });
        })
    );

    const err = await apiFetch("/items", { timeoutMs: 10 }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("TIMEOUT");
  });

  test("an externally-cancelled AbortSignal throws a CANCELLED ApiError, not TIMEOUT", async () => {
    global.fetch = vi.fn(
      (url, opts) =>
        new Promise((resolve, reject) => {
          opts.signal.addEventListener("abort", () => {
            const abortErr = new Error("The operation was aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
          });
        })
    );

    const controller = new AbortController();
    const promise = apiFetch("/items", { signal: controller.signal, timeoutMs: 5000 });
    controller.abort();

    const err = await promise.catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("CANCELLED");
  });

  test("malformed (non-JSON) response body throws an INVALID_RESPONSE ApiError", async () => {
    global.fetch = vi.fn(async () => new Response("<html>not json</html>", { status: 200 }));

    const err = await apiFetch("/items").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("INVALID_RESPONSE");
  });
});
