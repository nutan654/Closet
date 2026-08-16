// @vitest-environment jsdom
/**
 * lib/__tests__/setPatternStyle.test.jsx
 *
 * Phase 5.1: pattern styling now persists server-side (see
 * backend/internal/dto/item_dto.go's ItemPatchRequest pattern fields,
 * migration 0003_item_patterns.up.sql, and lib/api/mappers.js's
 * toItemPatternPatchPayload). setPatternStyle still updates local state
 * synchronously and instantly on every call — a slider drag must never
 * feel network-bound — but it now also schedules a debounced PATCH so the
 * final value actually survives a reload, which it did not before this
 * phase (the old version of this test file asserted the opposite: that
 * updateItem was *never* called. That was the bug being fixed here, not a
 * behavior to preserve).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";
import { StoreProvider, useStore } from "../StoreContext";

const authState = { user: null, isAuthenticated: false, isLoading: false, logout: vi.fn() };

vi.mock("../AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("../api/items", () => ({
  getItems: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  logWear: vi.fn(),
  getHistory: vi.fn(),
}));

vi.mock("../api/outfits", () => ({
  getOutfits: vi.fn(),
  createOutfit: vi.fn(),
  updateOutfit: vi.fn(),
  deleteOutfit: vi.fn(),
}));

vi.mock("../api/user", () => ({
  setEquipped: vi.fn(),
}));

import * as itemsApi from "../api/items";
import * as outfitsApi from "../api/outfits";

const storeRef = { current: null };

function Harness() {
  storeRef.current = useStore();
  return null;
}

function renderStore() {
  return render(
    <StoreProvider>
      <Harness />
    </StoreProvider>
  );
}

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
    fit: "Regular",
    season: "",
    occasion: "",
    material: "",
    size: "",
    shade: "",
    finish: "",
    subtype: "T-Shirt",
    cardStyle: "classic",
    patternUrl: null,
    patternScale: null,
    patternOffsetX: null,
    patternOffsetY: null,
    patternRotation: null,
    patternTint: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  authState.user = { id: "user_a", name: "Priya", email: "priya@example.com", equipped: {} };
  authState.isAuthenticated = true;
  authState.isLoading = false;
  itemsApi.getItems.mockResolvedValue({ items: [apiItem()], total: 1, page: 1, perPage: 100, totalPages: 1 });
  itemsApi.updateItem.mockResolvedValue(undefined);
  outfitsApi.getOutfits.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  storeRef.current = null;
  vi.useRealTimers();
});

// waitForReal flushes pending microtasks (the async load effect resolving
// its mocked getItems()/getOutfits() calls) without using testing-library's
// waitFor — waitFor polls internally via setTimeout, which deadlocks once
// vi.useFakeTimers() is active unless timers are advanced concurrently.
// Several Promise.resolve() ticks are enough here since nothing in the
// awaited chain (mocked API calls) is itself timer-based.
async function waitForReal(assertion) {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
    try {
      assertion();
      return;
    } catch {
      // keep flushing
    }
  }
  assertion(); // let the final attempt's real error surface
}

test("setPatternStyle updates local state instantly, before any debounce elapses", async () => {
  renderStore();
  await waitForReal(() => expect(storeRef.current.data.items.length).toBe(1));

  act(() => {
    storeRef.current.setPatternStyle("item_1", { patternUrl: "https://example.com/tile.png", patternScale: 1.5 });
  });

  const item = storeRef.current.data.items.find((i) => i.id === "item_1");
  expect(item.patternUrl).toBe("https://example.com/tile.png");
  expect(item.patternScale).toBe(1.5);

  // Brief section 14's actual requirement: no network call *yet* — the
  // slider must never feel like it's waiting on the server.
  expect(itemsApi.updateItem).not.toHaveBeenCalled();
});

test("setPatternStyle persists via a debounced PATCH after edits settle", async () => {
  renderStore();
  await waitForReal(() => expect(storeRef.current.data.items.length).toBe(1));

  act(() => {
    storeRef.current.setPatternStyle("item_1", { patternUrl: "a.png", patternScale: 1.2 });
  });
  expect(itemsApi.updateItem).not.toHaveBeenCalled();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
  });

  expect(itemsApi.updateItem).toHaveBeenCalledTimes(1);
  expect(itemsApi.updateItem).toHaveBeenCalledWith("item_1", { patternUrl: "a.png", patternScale: 1.2 });
});

test("rapid successive edits within the debounce window collapse into a single PATCH", async () => {
  renderStore();
  await waitForReal(() => expect(storeRef.current.data.items.length).toBe(1));

  // Simulates a slider drag: many calls in quick succession.
  act(() => {
    storeRef.current.setPatternStyle("item_1", { patternUrl: "a.png" });
  });
  act(() => {
    storeRef.current.setPatternStyle("item_1", { patternScale: 1.1 });
  });
  act(() => {
    storeRef.current.setPatternStyle("item_1", { patternScale: 1.4 });
  });
  act(() => {
    storeRef.current.setPatternStyle("item_1", { patternOffsetX: 12 });
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
  });

  // One request, carrying the final coalesced values — not four requests.
  expect(itemsApi.updateItem).toHaveBeenCalledTimes(1);
  expect(itemsApi.updateItem).toHaveBeenCalledWith("item_1", {
    patternUrl: "a.png",
    patternScale: 1.4,
    patternOffsetX: 12,
  });
});

test("setPatternStyle merges into existing item fields rather than replacing them", async () => {
  renderStore();
  await waitForReal(() => expect(storeRef.current.data.items.length).toBe(1));

  act(() => {
    storeRef.current.setPatternStyle("item_1", { patternUrl: "a.png" });
  });
  expect(storeRef.current.data.items.find((i) => i.id === "item_1").patternUrl).toBe("a.png");

  act(() => {
    storeRef.current.setPatternStyle("item_1", { patternScale: 2 });
  });
  const item = storeRef.current.data.items.find((i) => i.id === "item_1");
  expect(item.patternUrl).toBe("a.png"); // untouched by the second call
  expect(item.patternScale).toBe(2);
});

test("setPatternStyle({ patternUrl: null }) clears a pattern locally and sends clearPattern: true", async () => {
  renderStore();
  await waitForReal(() => expect(storeRef.current.data.items.length).toBe(1));

  act(() => {
    storeRef.current.setPatternStyle("item_1", { patternUrl: "a.png" });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
  });
  expect(itemsApi.updateItem).toHaveBeenCalledTimes(1);

  act(() => {
    storeRef.current.setPatternStyle("item_1", { patternUrl: null });
  });
  expect(storeRef.current.data.items.find((i) => i.id === "item_1").patternUrl).toBeNull();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
  });

  expect(itemsApi.updateItem).toHaveBeenCalledTimes(2);
  expect(itemsApi.updateItem).toHaveBeenLastCalledWith("item_1", { patternUrl: null, clearPattern: true });
});

test("a failed PATCH surfaces via patternSaveStatus without rolling back the local slider value", async () => {
  itemsApi.updateItem.mockRejectedValueOnce(new Error("network down"));
  renderStore();
  await waitForReal(() => expect(storeRef.current.data.items.length).toBe(1));

  act(() => {
    storeRef.current.setPatternStyle("item_1", { patternScale: 1.8 });
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
  });

  expect(storeRef.current.patternSaveStatus["item_1"]).toBe("error");
  // The whole point: a failed background save must not yank the slider
  // back to its old position mid-edit.
  expect(storeRef.current.data.items.find((i) => i.id === "item_1").patternScale).toBe(1.8);
});

test("setPatternStyle for a non-existent item id is a no-op, not a crash", async () => {
  renderStore();
  await waitForReal(() => expect(storeRef.current.data.items.length).toBe(1));

  expect(() =>
    act(() => {
      storeRef.current.setPatternStyle("item_does_not_exist", { patternUrl: "a.png" });
    })
  ).not.toThrow();
  // original item untouched
  expect(storeRef.current.data.items.find((i) => i.id === "item_1").patternUrl).toBeNull();
});
