"use client";

/**
 * lib/StoreContext.jsx
 *
 * Phase 4.3 migration: this used to be a synchronous, localStorage-backed
 * store (see git history / the Phase 4.1-4.2 versions of this file for the
 * old `PROFILE_PREFIX`/`ACTIVE_KEY` implementation). It is now a thin
 * state layer over the Go API:
 *
 *   Component -> useStore() methods (UNCHANGED signatures) -> lib/api/* -> Go API
 *
 * The guiding rule (Phase 4.3 brief, section 4): existing components
 * should not need to learn about HTTP. `addItem(partial)` is still
 * `addItem(partial)` to every caller — internally it now awaits
 * items.createItem(), maps the response, and updates React state from
 * that response rather than from a locally-fabricated object.
 *
 * Identity now comes from AuthContext (lib/AuthContext.jsx), not a
 * typed-in localStorage profile name — StoreProvider reads useAuth()
 * directly and loads/clears server data whenever the authenticated user
 * changes, rather than requiring AppShell to call an enterProfile()/
 * switchProfile() bridge by hand (Phase 4.3 brief, section 17).
 *
 * Two small, deliberate, DOCUMENTED breaking changes to the old public API
 * (Phase 4.3 brief, section 19 — "if a breaking change is unavoidable,
 * identify it explicitly, update every consumer"):
 *
 *   - `enterProfile` and `listProfiles` are removed. Both existed solely
 *     for the old local-profile-name flow; DoorGate now authenticates
 *     through AuthContext directly (Phase 4.2), and AppShell no longer
 *     needs to bridge identity into this context by hand (it was their
 *     only two callers — see components/AppShell.jsx, updated to match).
 *   - `switchProfile` is KEPT on this context's public API (still backed
 *     by a real AuthContext.logout() instead of clearing a localStorage
 *     key — there's no more "local profile switching" without going
 *     through the backend). Phase 5.1 update: TopBar.jsx no longer calls
 *     it directly — it now calls useAuth().logout() itself, since that
 *     removed a second, visually-overlapping door icon that AppShell used
 *     to render (see components/TopBar.jsx and components/AppShell.jsx).
 *     switchProfile stays exported here for backward compatibility with
 *     anything else that may still reference it. `profileName` is
 *     likewise KEPT, unchanged in shape (still just a display name
 *     string, still read by TopBar.jsx for its greeting), derived from
 *     AuthContext's user.name instead of a localStorage key.
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";
import * as itemsApi from "./api/items";
import * as outfitsApi from "./api/outfits";
import * as userApi from "./api/user";
import { mkItem, seedData, uid } from "./model";
import {
  toFrontendItem,
  toItemCreatePayload,
  toItemPatchPayload,
  toItemPatternPatchPayload,
  toFrontendOutfit,
  toOutfitPayload,
  toOutfitPatchPayload,
  equippedFromUser,
} from "./api/mappers";

// Phase 5.1: how long to wait after the last pattern edit (slider tick,
// upload, tint toggle...) before actually sending the PATCH. Long enough
// that a drag gesture — many `setPatternStyle` calls in a few hundred ms —
// collapses into a single request; short enough that closing the pattern
// editor or navigating away a moment later still reliably captures the
// final value. Same idea as the optimistic-update / background-sync
// pattern used elsewhere in this codebase's sibling project, just applied
// to a slider instead of a like button.
const PATTERN_SAVE_DEBOUNCE_MS = 700;

const StoreContext = createContext(null);

function emptyData(displayName) {
  // Same shape blankProfile() always returned, so every existing consumer
  // that reads data.items / data.outfits / data.settings.equipped keeps
  // working untouched. `routines` and `journal` stay empty arrays — there
  // is no backend support for either (the Journal/Companion pages are
  // still "coming soon" placeholders; see app/journal/page.js and
  // app/companion/page.js), so migrating them is out of scope here.
  return { items: [], outfits: [], routines: [], journal: [], settings: { equipped: {}, displayName } };
}

export function StoreProvider({ children }) {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Tracks which user's data is currently loaded (or in flight), so a
  // `user` object that's merely a *new reference* for the *same* account
  // (e.g. after AuthContext.refreshSession()) doesn't trigger a redundant
  // reload — but a genuinely different account always does (Phase 4.3
  // brief, section 17: never let user A's state answer for user B).
  const loadedUserId = useRef(null);
  const reloadTick = useRef(0);

  // Demo mode (see lib/AuthContext.jsx's DEMO_EMAIL/loginDemo): a ref, not
  // state, so every mutation callback below can read the *current* value
  // without needing `user` in its own dependency array — same pattern as
  // loadedUserId/reloadTick just above.
  const isDemoRef = useRef(false);
  useEffect(() => {
    isDemoRef.current = !!user?.isDemo;
  }, [user]);

  const loadForUser = useCallback(async (activeUser) => {
    const myTick = ++reloadTick.current;
    setIsLoading(true);
    setError(null);

    if (activeUser.isDemo) {
      // Synchronous and network-free on purpose — same seedData() this
      // app used before the backend existed (lib/model.js), so demo mode
      // works even with no NEXT_PUBLIC_API_URL set at all.
      const seed = seedData();
      setData({ ...seed, settings: { ...seed.settings, displayName: activeUser.name } });
      setIsLoading(false);
      return;
    }

    try {
      const [itemsPage, outfits] = await Promise.all([
        // perPage: 100 is the backend's max (see item_handler.go List) —
        // the wardrobe/vanity UIs filter the full set client-side by
        // category with no pagination controls of their own, so this
        // mirrors the old "load everything up front" behavior as closely
        // as a single page-1 request can. A wardrobe past 100 pieces
        // will need real pagination support added to the UI — flagged as
        // a known limitation, not solved in this phase.
        itemsApi.getItems({ perPage: 100 }),
        outfitsApi.getOutfits(),
      ]);
      if (reloadTick.current !== myTick) return; // a newer load (or a logout) superseded this one
      setData({
        items: (itemsPage?.items || []).map(toFrontendItem),
        outfits: (outfits || []).map(toFrontendOutfit),
        routines: [],
        journal: [],
        settings: { equipped: equippedFromUser(activeUser), displayName: activeUser.name },
      });
    } catch (err) {
      if (reloadTick.current !== myTick) return;
      // err.message is already a safe, friendly string by the time it
      // reaches here — see lib/api/client.js's ApiError, which never
      // carries raw HTTP/DB/stack-trace detail.
      setError(err?.message || "Couldn't load your closet. Please try again.");
      setData(emptyData(activeUser.name)); // fail safe: never leave consumers reading data.items off `null`
    } finally {
      if (reloadTick.current === myTick) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return; // wait for AuthContext to finish bootstrapping before deciding anything

    if (isAuthenticated && user) {
      if (loadedUserId.current !== user.id) {
        loadedUserId.current = user.id;
        loadForUser(user);
      }
      return;
    }

    // Unauthenticated (fresh page load with no session, or just logged
    // out): clear everything rather than leaving a previous user's data
    // sitting in React state (Phase 4.3 brief, section 17).
    if (loadedUserId.current !== null) {
      loadedUserId.current = null;
      reloadTick.current += 1; // invalidate any load still in flight for the old user
      setData(null);
      setError(null);
      setIsLoading(false);
    }
  }, [isAuthenticated, user, authLoading, loadForUser]);

  /** Re-runs the initial load for whoever is currently signed in — exposed for a manual retry after a failed load. */
  const reload = useCallback(() => {
    if (user) loadForUser(user);
  }, [user, loadForUser]);

  /** See the file-level note above: now signs all the way out through AuthContext, not a local profile switch. */
  const switchProfile = useCallback(() => {
    logout();
  }, [logout]);

  // ---------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------

  const addItem = useCallback(async (partial) => {
    if (isDemoRef.current) {
      // No upload pipeline in demo mode — a chosen file just becomes a
      // local object URL good for this browser tab's lifetime, same as
      // any other demo data (nothing here is ever sent anywhere).
      const { imageFile, ...rest } = partial || {};
      const photo = imageFile ? URL.createObjectURL(imageFile) : rest.photo ?? null;
      const item = mkItem({ ...rest, photo });
      setData((d) => ({ ...d, items: [...d.items, item] }));
      return item;
    }
    const payload = toItemCreatePayload(partial); // plain object (JSON) or FormData (multipart, when partial.imageFile is a File) — see mappers.js
    const created = await itemsApi.createItem(payload); // throws ApiError on failure; caller decides how to surface it, state is never touched before this resolves
    const item = toFrontendItem(created);
    setData((d) => ({ ...d, items: [...d.items, item] }));
    return item;
  }, []);

  const updateItem = useCallback(async (id, patch) => {
    if (isDemoRef.current) {
      setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
      return;
    }
    const payload = toItemPatchPayload(patch);
    await itemsApi.updateItem(id, payload); // PATCH returns no updated item (dto.Ok("updated", nil)) — success alone is the confirmation
    // Mirrors the exact patch just confirmed by the server onto local
    // state — the same `{ ...i, ...patch }` shape the old localStorage
    // version used, but only ever applied *after* a 200 response, never
    // before (Phase 4.3 brief, section 10/11).
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  }, []);

  const deleteItem = useCallback(async (id) => {
    if (isDemoRef.current) {
      setData((d) => ({
        ...d,
        items: d.items.filter((i) => i.id !== id),
        outfits: d.outfits.map((o) => ({ ...o, itemIds: o.itemIds.filter((x) => x !== id) })),
      }));
      return;
    }
    await itemsApi.deleteItem(id);
    setData((d) => ({
      ...d,
      items: d.items.filter((i) => i.id !== id),
      // The backend does not itself prune deleted item ids out of outfits
      // (see backend/internal/service/outfit_service.go — Delete only
      // touches the items table); this client-side cleanup matches the
      // old local-only behavior but is not persisted server-side. No UI
      // today creates or edits outfits (addOutfit has zero callers in
      // app/ or components/), so this is a known, low-risk gap rather
      // than something silently "fixed" by inventing new backend calls.
      outfits: d.outfits.map((o) => ({ ...o, itemIds: o.itemIds.filter((x) => x !== id) })),
    }));
  }, []);

  /**
   * Records a wear. Mirrors the backend's actual LogWear behavior (see
   * backend/internal/repository/item_repository.go: `worn = worn + 1,
   * times_used = times_used + 1`) rather than the pre-migration local
   * version's behavior, which also set `status: "dirty"` — the backend's
   * LogWear never touches status, so this mapping deliberately drops that
   * part rather than drifting from what the server actually recorded.
   */
  const logWear = useCallback(async (id) => {
    if (!isDemoRef.current) {
      await itemsApi.logWear(id);
    }
    setData((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === id ? { ...i, worn: (i.worn || 0) + 1, timesUsed: (i.timesUsed || 0) + 1 } : i)),
    }));
  }, []);

  /**
   * Consumable-use tracking (skincare/makeup running low). Only
   * `inventoryPercent` is patchable server-side (ItemPatchRequest has no
   * `timesUsed` field — see backend/internal/dto/item_dto.go — it's
   * response-only/derived), so the inventory decrement is persisted via
   * the normal PATCH path; the `timesUsed` bump stays local-only, same as
   * before. This is a genuine, narrow backend gap, not a bug: `logUse`
   * has zero callers anywhere in app/ or components/ today, so adding a
   * dedicated backend mutation for it was judged out of scope for this
   * phase rather than a "real API mismatch" blocking current
   * functionality (contrast with the `equipped` gap fixed in
   * backend/internal/dto/auth_dto.go, which blocked the doll from ever
   * loading its state at all).
   */
  const logUse = useCallback(
    async (id, amount = 3) => {
      const current = (data?.items || []).find((i) => i.id === id);
      if (!current?.consumable) return;
      const inventoryPercent = Math.max(0, (current.inventoryPercent ?? 100) - amount);
      await updateItem(id, { inventoryPercent }); // persists the one field the backend supports
      setData((d) => ({
        ...d,
        items: d.items.map((i) => (i.id === id ? { ...i, timesUsed: (i.timesUsed || 0) + 1 } : i)),
      }));
    },
    [data, updateItem]
  );

  // Phase 5.1: per-item debounce timers + save-status, so many rapid
  // setPatternStyle calls (a slider drag fires dozens) collapse into one
  // PATCH per item rather than one per tick, without blocking the
  // instant local re-render the brief calls for. Refs, not state — these
  // are bookkeeping for the effect below, not something a render should
  // ever depend on.
  const patternSaveTimers = useRef({});
  const [patternSaveStatus, setPatternSaveStatusState] = useState({});

  const setPatternSaveStatus = useCallback((id, status) => {
    setPatternSaveStatusState((s) => ({ ...s, [id]: status }));
  }, []);

  // Flush any pending debounced pattern saves on unmount (e.g. the user
  // navigates away a moment after their last slider tick) rather than
  // silently dropping the last edit.
  useEffect(() => {
    const timersRef = patternSaveTimers;
    return () => {
      Object.values(timersRef.current).forEach((entry) => {
        if (!entry) return;
        clearTimeout(entry.timer);
        if (entry.pending) {
          itemsApi.updateItem(entry.id, toItemPatternPatchPayload(entry.pending)).catch(() => {});
        }
      });
    };
  }, []);

  /**
   * Phase 5.1: instant local update (unchanged from Phase 5 — the brief's
   * "primarily happen locally" requirement still holds, a slider drag
   * never blocks on the network) PLUS a debounced background PATCH, so
   * the pattern actually survives a reload now that the backend persists
   * it (see backend/internal/dto/item_dto.go ItemPatchRequest and
   * migration 0003_item_patterns.up.sql). Mirrors the optimistic-update
   * shape used elsewhere: update the UI first, reconcile with the server
   * quietly after, surface a failure without rolling the slider back
   * mid-drag (that would be jarring — instead patternSaveStatus[id]
   * flips to "error" so a consumer can show a small "couldn't save"
   * indicator if it wants to; PatternControls.jsx itself is unchanged and
   * free to ignore it).
   */
  const setPatternStyle = useCallback((id, patch) => {
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));

    if (isDemoRef.current) {
      setPatternSaveStatus(id, "saved"); // nothing to actually save — local state above is already the whole story
      return;
    }

    const existing = patternSaveTimers.current[id];
    if (existing) clearTimeout(existing.timer);

    const pending = { ...(existing?.pending || {}), ...patch };
    setPatternSaveStatus(id, "pending");

    const timer = setTimeout(async () => {
      const payload = toItemPatternPatchPayload(pending);
      delete patternSaveTimers.current[id];
      if (Object.keys(payload).length === 0) return;
      setPatternSaveStatus(id, "saving");
      try {
        await itemsApi.updateItem(id, payload);
        setPatternSaveStatus(id, "saved");
      } catch (err) {
        setPatternSaveStatus(id, "error");
      }
    }, PATTERN_SAVE_DEBOUNCE_MS);

    patternSaveTimers.current[id] = { id, pending, timer };
  }, [setPatternSaveStatus]);

  // ---------------------------------------------------------------------
  // Equipped doll state
  // ---------------------------------------------------------------------

  /**
   * PUT /me/equipped returns the FULL updated equipped map (see
   * backend/internal/service/user_service.go's SetEquipped — it already
   * implements the same dresses-vs-tops/bottoms mutual exclusion the old
   * local version hand-rolled), so this simply adopts the server's
   * answer wholesale rather than re-deriving it client-side.
   */
  const setEquipped = useCallback(async (slot, itemId) => {
    if (isDemoRef.current) {
      setData((d) => {
        const equipped = { ...d.settings.equipped };
        if (!itemId) {
          delete equipped[slot];
        } else {
          equipped[slot] = itemId;
          // Same mutual exclusion the backend enforces (see
          // backend/internal/service/user_service.go's SetEquipped).
          if (slot === "dresses") {
            delete equipped.tops;
            delete equipped.bottoms;
          } else if (slot === "tops" || slot === "bottoms") {
            delete equipped.dresses;
          }
        }
        return { ...d, settings: { ...d.settings, equipped } };
      });
      return;
    }
    const equipped = await userApi.setEquipped(slot, itemId || null);
    setData((d) => ({ ...d, settings: { ...d.settings, equipped } }));
  }, []);

  // ---------------------------------------------------------------------
  // Outfits
  // ---------------------------------------------------------------------

  const addOutfit = useCallback(async (outfit) => {
    if (isDemoRef.current) {
      const o = { id: uid("outfit"), name: "Untitled outfit", itemIds: [], ...outfit };
      setData((d) => ({ ...d, outfits: [...d.outfits, o] }));
      return o;
    }
    const payload = toOutfitPayload(outfit); // applies the same client-side defaults the old version did, so this still never fails locally for a missing name
    const created = await outfitsApi.createOutfit(payload);
    const o = toFrontendOutfit(created);
    setData((d) => ({ ...d, outfits: [...d.outfits, o] }));
    return o;
  }, []);

  /**
   * Not part of the pre-migration StoreContext (only addOutfit existed —
   * see the file-level note), but the backend fully supports it
   * (PATCH /outfits/:id) and the Phase 4.3 test plan requires update/
   * delete outfit coverage, so it's added here now using the same
   * request-first-then-update-state pattern as every other mutation. No
   * UI wires this up yet — same status as addOutfit before this phase.
   */
  const updateOutfit = useCallback(async (id, patch) => {
    if (isDemoRef.current) {
      setData((d) => ({ ...d, outfits: d.outfits.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
      return;
    }
    const payload = toOutfitPatchPayload(patch);
    await outfitsApi.updateOutfit(id, payload); // PATCH returns no updated outfit — success is the confirmation, same as updateItem
    setData((d) => ({ ...d, outfits: d.outfits.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  }, []);

  /** See updateOutfit's note — added for the same reason. */
  const deleteOutfit = useCallback(async (id) => {
    if (isDemoRef.current) {
      setData((d) => ({ ...d, outfits: d.outfits.filter((o) => o.id !== id) }));
      return;
    }
    await outfitsApi.deleteOutfit(id);
    setData((d) => ({ ...d, outfits: d.outfits.filter((o) => o.id !== id) }));
  }, []);

  return (
    <StoreContext.Provider
      value={{
        data,
        isLoading,
        error,
        reload,
        profileName: user?.name || null,
        switchProfile,
        addItem,
        updateItem,
        deleteItem,
        setPatternStyle,
        patternSaveStatus,
        setEquipped,
        addOutfit,
        updateOutfit,
        deleteOutfit,
        logWear,
        logUse,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
