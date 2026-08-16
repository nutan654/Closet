"use client";

/**
 * lib/AuthContext.jsx
 *
 * The ONE source of truth for authentication state (Phase 4.2 brief,
 * section 2 — deliberately NOT duplicated inside StoreContext, which
 * instead reads the authenticated user from this context to know when to
 * load/clear its own server-backed wardrobe state; see
 * lib/StoreContext.jsx, migrated off localStorage in Phase 4.3).
 *
 * Backend contract (backend/internal/handlers/auth_handler.go +
 * backend/internal/dto/auth_dto.go):
 *   - POST /auth/signup, POST /auth/login, and POST /auth/refresh all
 *     return { user, accessToken, refreshToken, expiresIn } — signup logs
 *     the new user in immediately, there is no separate "verify then
 *     login" step.
 *   - GET /auth/me is the authoritative source for "who is signed in" —
 *     never derived from a decoded JWT or anything localStorage-based.
 *   - Authorization is `Bearer <accessToken>`; there is no cookie session
 *     anywhere in the backend.
 *
 * Token storage trade-off (Phase 4.2 brief, section 4): tokens live only
 * in memory (lib/api/tokenStore.js) — never in localStorage, never in a
 * cookie. This is deliberate: it avoids exposing long-lived credentials
 * to XSS / localStorage-reading extensions. The cost is that a full
 * browser refresh (or closing the tab) always drops the session — there
 * is no "silent resume" across a hard reload. That's an accepted,
 * temporary trade-off for this phase, not a bug; a real persistence
 * strategy (rotating HttpOnly cookie set by the backend, or an explicit
 * "remember me" opt-in) is a backend-and-frontend decision for a later
 * phase, not something to route around here by quietly writing the
 * refresh token to localStorage.
 */

import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { login as apiLogin, signup as apiSignup, logout as apiLogout, refresh as apiRefresh, getCurrentUser } from "@/lib/api/auth";
import { getAccessToken, getRefreshToken, clearTokens } from "@/lib/api/tokenStore";

// Demo mode (see README.md "Try it without a backend"): a fixed, publicly
// documented email/password that logs straight into an in-memory session
// — no network call, so it works even with NEXT_PUBLIC_API_URL unset or
// the backend not deployed yet. StoreContext.jsx checks `user.isDemo` and
// mirrors every mutation into local React state instead of calling the
// Go API — see lib/model.js's seedData()/mkItem(), the same shapes this
// app used before the backend existed.
export const DEMO_EMAIL = "demo@lifecloset.app";
export const DEMO_PASSWORD = "demo1234";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // Guards against setting state after unmount if bootstrap resolves late
  // (StrictMode double-invokes effects in dev, and a slow/failed request
  // could otherwise land after the component's gone).
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // App initialization (Phase 4.2 brief, section 5). Tokens are
  // memory-only, so on a fresh page load there's usually nothing to find
  // here — this mainly matters for client-side remounts within the same
  // JS session. When a token *is* present but the access token has
  // expired, GET /auth/me will come back 401, and lib/api/client.js's
  // built-in 401->refresh->retry handles steps 2-4 (refresh, store new
  // tokens, retry /auth/me) transparently — this effect doesn't need to
  // orchestrate that part by hand.
  useEffect(() => {
    async function bootstrap() {
      if (!getAccessToken() && !getRefreshToken()) {
        // Nothing to resume — plainly unauthenticated, no network call needed.
        if (mountedRef.current) setIsLoading(false);
        return;
      }
      try {
        const me = await getCurrentUser();
        if (mountedRef.current) setUser(me);
      } catch {
        // Refresh (if it was attempted) already cleared tokens on failure;
        // this covers the "no refresh token left, /auth/me just 401'd"
        // case too.
        clearTokens();
        if (mountedRef.current) setUser(null);
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    }
    bootstrap();
  }, []);

  /** Synchronous, network-free session — see DEMO_EMAIL/DEMO_PASSWORD above. */
  const loginDemo = useCallback(() => {
    const demoUser = { id: "demo-user", name: "Demo", email: DEMO_EMAIL, isDemo: true };
    setUser(demoUser);
    return demoUser;
  }, []);

  /** @param {{ email: string, password: string }} credentials */
  const login = useCallback(
    async (credentials) => {
      if (credentials.email?.trim().toLowerCase() === DEMO_EMAIL && credentials.password === DEMO_PASSWORD) {
        return loginDemo();
      }
      const data = await apiLogin(credentials); // throws ApiError on invalid credentials, etc. — caller (DoorGate) shows data.message
      setUser(data.user);
      return data.user;
    },
    [loginDemo]
  );

  /** @param {{ name: string, email: string, password: string }} payload */
  const signup = useCallback(async (payload) => {
    const data = await apiSignup(payload); // signup authenticates immediately, same response shape as login
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    if (user?.isDemo) {
      setUser(null);
      return;
    }
    try {
      await apiLogout();
    } catch {
      // Even an already-invalid-session error from the backend must still
      // end the frontend session (Phase 4.2 brief, section 9) — apiLogout
      // already clears tokenStore in its own finally block regardless.
    } finally {
      setUser(null);
    }
  }, [user]);

  /** Manual/proactive refresh — shares client.js's single-flight lock with the automatic 401 handler. */
  const refreshSession = useCallback(async () => {
    try {
      const data = await apiRefresh();
      setUser(data.user);
      return data.user;
    } catch (err) {
      setUser(null);
      throw err;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        loginDemo,
        signup,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
