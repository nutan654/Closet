/**
 * lib/api/auth.js
 *
 * Maps to backend/internal/handlers/auth_handler.go via
 * backend/internal/routes/routes.go:
 *
 *   POST /api/v1/auth/signup   -> signup()
 *   POST /api/v1/auth/login    -> login()
 *   POST /api/v1/auth/refresh  -> refresh()
 *   POST /api/v1/auth/logout   -> logout()
 *   GET  /api/v1/auth/me       -> getCurrentUser()
 *
 * Request/response shapes come directly from
 * backend/internal/dto/auth_dto.go (SignupRequest, LoginRequest,
 * RefreshRequest, AuthResponse, UserResponse).
 *
 * As of Phase 4.2 this is wired up: lib/AuthContext.jsx is the one place
 * that calls these functions and holds the resulting `user` in React
 * state. Nothing outside lib/api and lib/AuthContext.jsx should import
 * this module directly — see lib/AuthContext.jsx for the single source
 * of truth on auth state.
 */

import { apiPost, apiGet, refreshAccessToken } from "./client";
import { setTokens, clearTokens, getRefreshToken } from "./tokenStore";

/**
 * @param {{ name: string, email: string, password: string }} payload
 * @returns {Promise<{ user: object, accessToken: string, refreshToken: string, expiresIn: number }>}
 */
export async function signup(payload) {
  const data = await apiPost("/auth/signup", payload, { auth: false });
  setTokens(data);
  return data;
}

/**
 * @param {{ email: string, password: string }} payload
 * @returns {Promise<{ user: object, accessToken: string, refreshToken: string, expiresIn: number }>}
 */
export async function login(payload) {
  const data = await apiPost("/auth/login", payload, { auth: false });
  setTokens(data);
  return data;
}

/**
 * Exchanges the refresh token currently held in tokenStore for a new
 * access+refresh token pair. The backend expects the refresh token in the
 * JSON body (`{ "refreshToken": "..." }`) — it is never read from a
 * cookie (see backend/internal/dto/auth_dto.go RefreshRequest and
 * backend/internal/handlers/auth_handler.go Refresh).
 *
 * This is a thin wrapper around client.js's refreshAccessToken(), which
 * also backs the automatic 401->refresh->retry flow — routing both
 * through the same function means AuthContext.refreshSession() (a manual
 * call) and a concurrent 401 elsewhere in the app always share the same
 * single in-flight refresh request rather than firing two.
 */
export function refresh() {
  return refreshAccessToken();
}

/**
 * Revokes the current refresh token server-side. Always clears local
 * tokens regardless of whether the request succeeds, so the client never
 * ends up "logged out visually but still holding a live token" — this
 * covers the case where the session was already invalid/expired
 * server-side too (Phase 4.2 brief, section 9).
 *
 * If there's no refresh token to revoke (e.g. a prior refresh already
 * failed and cleared it), skips the network call — there's nothing valid
 * left server-side to invalidate — and just clears local state.
 */
export async function logout() {
  const token = getRefreshToken();
  try {
    if (token) {
      await apiPost("/auth/logout", { refreshToken: token }, { auth: false });
    }
  } finally {
    clearTokens();
  }
}

/** GET /api/v1/auth/me — requires a valid access token. */
export function getCurrentUser() {
  return apiGet("/auth/me");
}
