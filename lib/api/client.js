/**
 * lib/api/client.js
 *
 * Central HTTP client for talking to the Go backend
 * (backend/internal/routes/routes.go mounts everything under /api/v1).
 *
 * Design notes (see the Phase 4.1 brief):
 * - Native `fetch` is used. The project has no HTTP library dependency
 *   (see package.json — next, react, react-dom, framer-motion only), so
 *   adding axios would be an unnecessary new dependency for something
 *   fetch already does fine.
 * - Every response from the Go API is wrapped in the same envelope
 *   (backend/internal/dto/response.go):
 *     { success: boolean, message?: string, data?: any, error?: string }
 *   This client unwraps that envelope so callers just get `data` back on
 *   success, and throws a normalized ApiError on failure.
 * - Auth: the backend reads `Authorization: Bearer <accessToken>`
 *   (backend/internal/middleware/auth.go) — there is no cookie-based
 *   session anywhere in the backend. Accordingly this client does NOT set
 *   `credentials: "include"`; it attaches the bearer token itself from
 *   lib/api/tokenStore.js when one is available. Nothing currently calls
 *   setTokens(), so today every request simply goes out without an
 *   Authorization header, same as before this phase existed.
 */

import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "./tokenStore";

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Normalized error shape every failed request throws, so callers never
 * need to know about Response objects, status codes, or the envelope
 * shape. Never carries stack traces, DB errors, or file paths — only what
 * the Go API's `message`/`error` fields already exposed on purpose.
 */
export class ApiError extends Error {
  constructor({ status, code, message, details } = {}) {
    super(message || "Request failed");
    this.name = "ApiError";
    this.status = status ?? 0; // 0 = no HTTP response at all (network/timeout)
    this.code = code || "UNKNOWN_ERROR";
    this.details = details;
  }
}

function getBaseUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    // Fails loudly in dev rather than silently hitting a relative path
    // that happens to 404. Never hardcode localhost as a fallback here —
    // see Phase 4.1 brief, section 5.
    throw new ApiError({
      status: 0,
      code: "CONFIG_ERROR",
      message: "NEXT_PUBLIC_API_URL is not set. Add it to your .env.local (see .env.example).",
    });
  }
  return url.replace(/\/+$/, "");
}

// Module-level lock: at most one /auth/refresh request in flight at a
// time, no matter how many requests hit a 401 concurrently (Phase 4.2
// brief, section 8) or how many places call refreshAccessToken()
// directly (e.g. AuthContext.refreshSession() — see lib/AuthContext.jsx).
// Every caller during a refresh gets the SAME promise back instead of
// firing its own request.
let refreshPromise = null;

/**
 * Exchanges the refresh token in tokenStore for a new access+refresh
 * token pair via POST /auth/refresh, storing the result. Safe to call
 * concurrently from many places — see the single-flight note above.
 *
 * Intentionally calls apiFetch directly rather than importing
 * lib/api/auth.js's refresh() (auth.js imports *this* module, so
 * importing it back here would be circular); lib/api/auth.js's refresh()
 * is a thin wrapper around this same function.
 *
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string, expiresIn: number}>}
 */
export function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  const token = getRefreshToken();
  if (!token) {
    clearTokens();
    return Promise.reject(
      new ApiError({
        status: 401,
        code: "NO_REFRESH_TOKEN",
        message: "Your session has expired. Please sign in again.",
      })
    );
  }

  refreshPromise = apiFetch("/auth/refresh", {
    method: "POST",
    body: { refreshToken: token },
    auth: false, // the refresh endpoint is itself public; it authenticates via the body, not a bearer token
  })
    .then((data) => {
      setTokens(data);
      return data;
    })
    .catch((err) => {
      // A failed refresh (expired/revoked/invalid token, or the backend
      // being unreachable) means the session cannot continue — clear
      // whatever's left so nothing keeps retrying with a dead token.
      clearTokens();
      throw err;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/**
 * Core request function. Prefer the verb helpers (get/post/patch/del)
 * below or the per-resource modules (auth.js, items.js, outfits.js,
 * user.js) — most call sites should never need to import this directly.
 *
 * @param {string} path - e.g. "/items" (leading slash, no base URL)
 * @param {object} [options]
 * @param {string} [options.method="GET"]
 * @param {object|FormData} [options.body]
 * @param {boolean} [options.isFormData=false] - pass a FormData body
 *   through untouched so the browser sets `Content-Type:
 *   multipart/form-data; boundary=...` itself (see items.js createItem —
 *   this must never be set manually, the boundary has to come from the
 *   browser).
 * @param {boolean} [options.auth=true] - attach `Authorization: Bearer`
 *   when a token is available. Set false for endpoints that are public by
 *   design (signup/login/refresh).
 * @param {number} [options.timeoutMs=15000]
 * @param {AbortSignal} [options.signal] - external cancellation, combined
 *   with the internal timeout-based abort.
 */
export async function apiFetch(path, options = {}) {
  const {
    method = "GET",
    body,
    isFormData = false,
    auth = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: externalSignal,
    headers: extraHeaders,
    _isRetry = false,
  } = options;

  const baseUrl = getBaseUrl();
  const headers = { Accept: "application/json", ...extraHeaders };

  let fetchBody;
  if (isFormData) {
    fetchBody = body; // browser sets Content-Type + boundary
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchBody = JSON.stringify(body);
  }

  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // Combine an internal timeout-abort with any caller-supplied signal, so
  // both `AbortController` cancellation and a hung request are covered.
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  const onExternalAbort = () => timeoutController.abort();
  if (externalSignal) {
    if (externalSignal.aborted) timeoutController.abort();
    else externalSignal.addEventListener("abort", onExternalAbort);
  }

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: fetchBody,
      signal: timeoutController.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      const wasExternal = externalSignal?.aborted;
      throw new ApiError({
        status: 0,
        code: wasExternal ? "CANCELLED" : "TIMEOUT",
        message: wasExternal ? "Request was cancelled." : "The request timed out. Please try again.",
      });
    }
    // fetch() itself only rejects on network-level failures (DNS,
    // connection refused, offline, CORS preflight failure, etc.) — never
    // on 4xx/5xx, those still resolve normally and are handled below.
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message: "Could not reach the server. Check your connection and try again.",
    });
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
  }

  // Every backend response is JSON (dto.Envelope), even error responses —
  // but guard against a malformed/non-JSON body (proxy error page, empty
  // 204, etc.) rather than letting a raw parse error leak to the caller.
  let envelope = null;
  const rawText = await response.text();
  if (rawText) {
    try {
      envelope = JSON.parse(rawText);
    } catch {
      throw new ApiError({
        status: response.status,
        code: "INVALID_RESPONSE",
        message: "The server returned an unexpected response.",
      });
    }
  }

  if (!response.ok || envelope?.success === false) {
    // request -> 401 -> refresh -> new tokens -> retry original request
    // once (Phase 4.2 brief, section 8). Only for requests that were
    // actually sent with a bearer token in the first place (`auth`
    // true) — auth:false calls (login/signup/refresh/logout itself) are
    // deliberately never retried this way, which also rules out any
    // possibility of this recursing into itself.
    if (response.status === 401 && auth && !_isRetry) {
      await refreshAccessToken(); // throws (already-normalized ApiError) if the refresh itself fails; that propagates below
      return apiFetch(path, { ...options, _isRetry: true });
    }

    throw new ApiError({
      status: response.status,
      code: envelope?.error || `HTTP_${response.status}`,
      message: envelope?.message || response.statusText || "Something went wrong.",
      details: envelope?.details,
    });
  }

  // Successful responses: unwrap to `data` so callers never touch the
  // envelope. Some endpoints (logout, wear, update, delete) return
  // `data: null` with only a message — callers that don't need a return
  // value can simply ignore it.
  return envelope ? envelope.data : null;
}

export const apiGet = (path, options) => apiFetch(path, { ...options, method: "GET" });
export const apiPost = (path, body, options) => apiFetch(path, { ...options, method: "POST", body });
export const apiPatch = (path, body, options) => apiFetch(path, { ...options, method: "PATCH", body });
export const apiPut = (path, body, options) => apiFetch(path, { ...options, method: "PUT", body });
export const apiDelete = (path, options) => apiFetch(path, { ...options, method: "DELETE" });
