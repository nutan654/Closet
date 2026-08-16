/**
 * lib/api/__tests__/auth.test.js
 *
 * Mocked-fetch tests for the auth flows added in Phase 4.2: login, signup,
 * logout, /auth/me, the automatic 401 -> refresh -> retry behavior in
 * client.js, and concurrent-401 single-flight refresh locking. No live Go
 * server required — `fetch` is fully mocked (Phase 4.2 brief, section 14).
 */

import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { apiFetch, ApiError } from "../client";
import { login, signup, logout, getCurrentUser } from "../auth";
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "../tokenStore";

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

describe("login / signup / logout / me", () => {
  test("login success stores tokens and returns the user", async () => {
    global.fetch = vi.fn(async (url) => {
      expect(url).toBe("http://localhost:8080/api/v1/auth/login");
      return new Response(
        envelope(true, {
          user: { id: "u1", name: "Priya", email: "priya@example.com" },
          accessToken: "access-1",
          refreshToken: "refresh-1",
          expiresIn: 900,
        }),
        { status: 200 }
      );
    });

    const data = await login({ email: "priya@example.com", password: "hunter2" });

    expect(data.user.email).toBe("priya@example.com");
    expect(getAccessToken()).toBe("access-1");
    expect(getRefreshToken()).toBe("refresh-1");
  });

  test("login failure (invalid credentials) throws a friendly ApiError and stores no tokens", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(envelope(false, null, "invalid email or password", "INVALID_CREDENTIALS"), { status: 401 })
    );

    const err = await login({ email: "priya@example.com", password: "wrong" }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("invalid email or password");
    expect(getAccessToken()).toBeNull();
  });

  test("signup success stores tokens and returns the user (signup authenticates immediately)", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          envelope(true, {
            user: { id: "u2", name: "Sana", email: "sana@example.com" },
            accessToken: "access-2",
            refreshToken: "refresh-2",
            expiresIn: 900,
          }),
          { status: 201 }
        )
    );

    const data = await signup({ name: "Sana", email: "sana@example.com", password: "goodpassword" });

    expect(data.user.name).toBe("Sana");
    expect(getAccessToken()).toBe("access-2");
  });

  test("signup failure (duplicate email) throws a friendly ApiError", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(envelope(false, null, "an account with this email already exists", "EMAIL_TAKEN"), {
          status: 409,
        })
    );

    const err = await signup({ name: "Sana", email: "taken@example.com", password: "goodpassword" }).catch(
      (e) => e
    );

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("EMAIL_TAKEN");
  });

  test("getCurrentUser (/auth/me) success returns the backend's user as the source of truth", async () => {
    setTokens({ accessToken: "access-3", refreshToken: "refresh-3" });
    global.fetch = vi.fn(async (url, opts) => {
      expect(url).toBe("http://localhost:8080/api/v1/auth/me");
      expect(opts.headers.Authorization).toBe("Bearer access-3");
      return new Response(envelope(true, { id: "u3", name: "Wren", email: "wren@example.com" }), { status: 200 });
    });

    const user = await getCurrentUser();
    expect(user.name).toBe("Wren");
  });

  test("logout calls /auth/logout with the refresh token and always clears tokenStore, even on failure", async () => {
    setTokens({ accessToken: "access-4", refreshToken: "refresh-4" });
    global.fetch = vi.fn(async (url, opts) => {
      expect(url).toBe("http://localhost:8080/api/v1/auth/logout");
      expect(JSON.parse(opts.body)).toEqual({ refreshToken: "refresh-4" });
      // Simulate an already-invalid-session response — logout must still
      // clear local state (Phase 4.2 brief, section 9). auth.js's
      // logout() clears tokens in a `finally` but still propagates the
      // error itself; it's AuthContext.logout() (the layer DoorGate/
      // AppShell actually call) that catches it so the UI transitions
      // to signed-out cleanly either way — see lib/AuthContext.jsx.
      return new Response(envelope(false, null, "session already invalid", "SESSION_NOT_FOUND"), { status: 401 });
    });

    await expect(logout()).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  test("logout with no refresh token in memory skips the network call entirely", async () => {
    global.fetch = vi.fn();
    await logout();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("automatic 401 -> refresh -> retry", () => {
  test("a 401 on a protected request triggers exactly one refresh, then retries and succeeds", async () => {
    setTokens({ accessToken: "expired-access", refreshToken: "valid-refresh" });
    let itemsCallCount = 0;
    let refreshCallCount = 0;

    global.fetch = vi.fn(async (url, opts) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCallCount += 1;
        expect(JSON.parse(opts.body)).toEqual({ refreshToken: "valid-refresh" });
        return new Response(
          envelope(true, {
            user: { id: "u1", name: "Priya" },
            accessToken: "fresh-access",
            refreshToken: "fresh-refresh",
            expiresIn: 900,
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/items")) {
        itemsCallCount += 1;
        if (itemsCallCount === 1) {
          expect(opts.headers.Authorization).toBe("Bearer expired-access");
          return new Response(envelope(false, null, "token expired", "TOKEN_EXPIRED"), { status: 401 });
        }
        expect(opts.headers.Authorization).toBe("Bearer fresh-access");
        return new Response(envelope(true, { items: [], total: 0 }), { status: 200 });
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    const data = await apiFetch("/items", { method: "GET" });

    expect(data).toEqual({ items: [], total: 0 });
    expect(itemsCallCount).toBe(2); // original + one retry, never looping further
    expect(refreshCallCount).toBe(1);
    expect(getAccessToken()).toBe("fresh-access");
  });

  test("refresh failure clears tokens and propagates the error (caller/AuthContext treats this as logout)", async () => {
    setTokens({ accessToken: "expired-access", refreshToken: "dead-refresh" });

    global.fetch = vi.fn(async (url) => {
      if (url.endsWith("/auth/refresh")) {
        return new Response(envelope(false, null, "refresh token is invalid or revoked", "INVALID_REFRESH_TOKEN"), {
          status: 401,
        });
      }
      if (url.endsWith("/items")) {
        return new Response(envelope(false, null, "token expired", "TOKEN_EXPIRED"), { status: 401 });
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    const err = await apiFetch("/items", { method: "GET" }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("INVALID_REFRESH_TOKEN");
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  test("concurrent 401s from multiple in-flight requests trigger exactly one refresh call", async () => {
    setTokens({ accessToken: "expired-access", refreshToken: "valid-refresh" });
    let refreshCallCount = 0;

    global.fetch = vi.fn(async (url, opts) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCallCount += 1;
        // Simulate network latency so all three requests' 401s land
        // before the refresh resolves — this is the scenario the
        // single-flight lock in client.js has to survive.
        await new Promise((r) => setTimeout(r, 20));
        return new Response(
          envelope(true, {
            user: { id: "u1", name: "Priya" },
            accessToken: "fresh-access",
            refreshToken: "fresh-refresh",
            expiresIn: 900,
          }),
          { status: 200 }
        );
      }
      const usedFreshToken = opts.headers.Authorization === "Bearer fresh-access";
      if (usedFreshToken) {
        return new Response(envelope(true, { ok: true }), { status: 200 });
      }
      return new Response(envelope(false, null, "token expired", "TOKEN_EXPIRED"), { status: 401 });
    });

    const [a, b, c] = await Promise.all([
      apiFetch("/items", { method: "GET" }),
      apiFetch("/outfits", { method: "GET" }),
      apiFetch("/history", { method: "GET" }),
    ]);

    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(c).toEqual({ ok: true });
    expect(refreshCallCount).toBe(1); // never more than one refresh in flight, no matter how many 401s land
  });

  test("token rotation: a successful refresh replaces both the access AND refresh token", async () => {
    setTokens({ accessToken: "expired-access", refreshToken: "old-refresh" });

    global.fetch = vi.fn(async (url, opts) => {
      if (url.endsWith("/auth/refresh")) {
        expect(JSON.parse(opts.body)).toEqual({ refreshToken: "old-refresh" });
        return new Response(
          envelope(true, {
            user: { id: "u1", name: "Priya" },
            accessToken: "rotated-access",
            refreshToken: "rotated-refresh",
            expiresIn: 900,
          }),
          { status: 200 }
        );
      }
      return new Response(envelope(false, null, "token expired", "TOKEN_EXPIRED"), { status: 401 });
    });

    await apiFetch("/items", { method: "GET" }).catch(() => {}); // second /items call still 401s in this mock; only the rotation matters here

    expect(getAccessToken()).toBe("rotated-access");
    expect(getRefreshToken()).toBe("rotated-refresh"); // the OLD refresh token must never be reused after rotation
  });

  test("network failure during a protected request never attempts a refresh", async () => {
    setTokens({ accessToken: "access-x", refreshToken: "refresh-x" });
    global.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const err = await apiFetch("/items", { method: "GET" }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("NETWORK_ERROR");
    expect(global.fetch).toHaveBeenCalledTimes(1); // no refresh attempted — there was no 401 to react to
  });
});
