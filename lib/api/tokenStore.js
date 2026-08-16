/**
 * lib/api/tokenStore.js
 *
 * Holds the access/refresh tokens returned by the Go backend's auth
 * endpoints (see backend/internal/dto/auth_dto.go — AuthResponse carries
 * both `accessToken` and `refreshToken` directly in the JSON body; the
 * backend does NOT set an HttpOnly cookie anywhere in
 * backend/internal/middleware/auth.go or the auth handlers). Because the
 * refresh token only exists in the JSON body, some client-side storage is
 * unavoidable once auth is wired up — but which storage (memory only,
 * sessionStorage, localStorage) is a decision for Phase 4.2, when
 * StoreContext migration actually happens.
 *
 * For Phase 4.1 this is intentionally minimal: an in-memory holder that
 * the API client can read from when attaching `Authorization: Bearer …`,
 * and that auth.js can write to after login/signup/refresh. Nothing here
 * touches localStorage yet, and nothing here is imported by StoreContext —
 * nothing about current app behavior changes.
 */

let accessToken = null;
let refreshToken = null;

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return refreshToken;
}

/** Store both tokens after a successful login/signup/refresh response. */
export function setTokens({ accessToken: at, refreshToken: rt } = {}) {
  accessToken = at ?? accessToken;
  refreshToken = rt ?? refreshToken;
}

/** Clear both tokens (logout, or a refresh that failed permanently). */
export function clearTokens() {
  accessToken = null;
  refreshToken = null;
}
