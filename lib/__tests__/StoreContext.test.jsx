// @vitest-environment jsdom
/**
 * lib/__tests__/StoreContext.test.jsx
 *
 * Integration-level tests for StoreContext's migration off localStorage.
 * lib/api/* and lib/AuthContext are fully mocked — no live Go server, no
 * real network, no real auth flow (Phase 4.3 brief, section 22). A tiny
 * harness component renders StoreProvider and exposes the current
 * `useStore()` value to each test via a ref.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";
import { StoreProvider, useStore } from "../StoreContext";

// ---------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------

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
import * as userApi from "../api/user";

// ---------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------

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

function userA() {
  return { id: "user_a", name: "Priya", email: "priya@example.com", equipped: { tops: "item_top1" } };
}

function userB() {
  return { id: "user_b", name: "Sana", email: "sana@example.com", equipped: {} };
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

function apiOutfit(overrides = {}) {
  return { id: "outfit_1", name: "Brunch", emoji: "✨", itemIds: [], createdAt: "2026-01-01T00:00:00Z", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = null;
  authState.isAuthenticated = false;
  authState.isLoading = false;
  itemsApi.getItems.mockResolvedValue({ items: [], total: 0, page: 1, perPage: 100, totalPages: 0 });
  outfitsApi.getOutfits.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  storeRef.current = null;
});

// ---------------------------------------------------------------------
// 1 & 2. Initial item + outfit loading
// ---------------------------------------------------------------------

test("initial load: fetches items and outfits once authenticated, and exposes them as data.items/data.outfits", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  itemsApi.getItems.mockResolvedValue({ items: [apiItem()], total: 1, page: 1, perPage: 100, totalPages: 1 });
  outfitsApi.getOutfits.mockResolvedValue([apiOutfit()]);

  renderStore();

  await waitFor(() => expect(storeRef.current.data).not.toBeNull());

  expect(itemsApi.getItems).toHaveBeenCalledWith({ perPage: 100 });
  expect(outfitsApi.getOutfits).toHaveBeenCalledTimes(1);
  expect(storeRef.current.data.items).toHaveLength(1);
  expect(storeRef.current.data.items[0].name).toBe("Sage Wrap Top");
  expect(storeRef.current.data.outfits).toHaveLength(1);
  expect(storeRef.current.data.outfits[0].name).toBe("Brunch");
  // Equipped comes off the AuthContext user, not a separate request (no GET /me/equipped exists).
  expect(storeRef.current.data.settings.equipped).toEqual({ tops: "item_top1" });
  expect(storeRef.current.isLoading).toBe(false);
});

test("does not fetch anything while unauthenticated", async () => {
  renderStore();
  await new Promise((r) => setTimeout(r, 10));
  expect(itemsApi.getItems).not.toHaveBeenCalled();
  expect(outfitsApi.getOutfits).not.toHaveBeenCalled();
  expect(storeRef.current.data).toBeNull();
});

// ---------------------------------------------------------------------
// 3/4. Add item (+ with image)
// ---------------------------------------------------------------------

test("add item: posts JSON (not FormData) when no image file is given, and appends the mapped result", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  renderStore();
  await waitFor(() => expect(storeRef.current.data).not.toBeNull());

  itemsApi.createItem.mockResolvedValue(apiItem({ id: "item_new", name: "New Top" }));

  await act(async () => {
    await storeRef.current.addItem({ category: "tops", name: "New Top", color: "#FFD9BE" });
  });

  expect(itemsApi.createItem).toHaveBeenCalledTimes(1);
  const sentPayload = itemsApi.createItem.mock.calls[0][0];
  expect(sentPayload instanceof FormData).toBe(false);
  expect(sentPayload).toMatchObject({ category: "tops", name: "New Top", color: "#FFD9BE" });
  expect(storeRef.current.data.items.map((i) => i.name)).toContain("New Top");
});

test("add item with image: File -> FormData, never a base64 JSON body, and the returned thumbnailUrl becomes item.photo (cards use the thumbnail; full imageUrl stays available separately)", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  renderStore();
  await waitFor(() => expect(storeRef.current.data).not.toBeNull());

  const file = new File(["fake-bytes"], "top.jpg", { type: "image/jpeg" });
  itemsApi.createItem.mockResolvedValue(
    apiItem({ id: "item_img", name: "Photographed Top", imageUrl: "https://cdn.example/item_img.jpg", thumbnailUrl: "https://cdn.example/item_img_thumb.jpg" })
  );

  await act(async () => {
    await storeRef.current.addItem({ category: "tops", name: "Photographed Top", color: "#FFD9BE", imageFile: file });
  });

  const sentPayload = itemsApi.createItem.mock.calls[0][0];
  expect(sentPayload instanceof FormData).toBe(true);
  expect(sentPayload.get("image")).toBe(file); // the raw File, never base64
  expect(sentPayload.get("name")).toBe("Photographed Top");

  const created = storeRef.current.data.items.find((i) => i.id === "item_img");
  expect(created.imageUrl).toBe("https://cdn.example/item_img.jpg"); // full-resolution, kept for a future detail view
  expect(created.thumbnailUrl).toBe("https://cdn.example/item_img_thumb.jpg");
  expect(created.photo).toBe("https://cdn.example/item_img_thumb.jpg"); // ItemCard/SwipeStack are both card-sized — photo resolves to the thumbnail, not the full image
});

test("delete after image upload: removing an item that has an uploaded image still only removes it from state after the API confirms", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  renderStore();
  await waitFor(() => expect(storeRef.current.data).not.toBeNull());

  const file = new File(["fake-bytes"], "top.jpg", { type: "image/jpeg" });
  itemsApi.createItem.mockResolvedValue(
    apiItem({ id: "item_img", name: "Photographed Top", imageUrl: "https://cdn.example/item_img.jpg", thumbnailUrl: "https://cdn.example/item_img_thumb.jpg" })
  );
  await act(async () => {
    await storeRef.current.addItem({ category: "tops", name: "Photographed Top", color: "#FFD9BE", imageFile: file });
  });
  expect(storeRef.current.data.items.map((i) => i.id)).toContain("item_img");

  // Storage cleanup for the uploaded file is entirely the backend's job
  // (backend/internal/service/item_service.go's Delete — see the Phase
  // 4.4 report); the frontend's only responsibility is calling
  // DELETE /items/:id and not removing the card until that succeeds.
  itemsApi.deleteItem.mockResolvedValue(null);
  await act(async () => {
    await storeRef.current.deleteItem("item_img");
  });

  expect(itemsApi.deleteItem).toHaveBeenCalledWith("item_img");
  expect(storeRef.current.data.items.find((i) => i.id === "item_img")).toBeUndefined();
});

// ---------------------------------------------------------------------
// 5. Update item
// ---------------------------------------------------------------------

test("update item: patches only after the API confirms success, and merges the patch into local state", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  itemsApi.getItems.mockResolvedValue({ items: [apiItem({ id: "item_1", name: "Old Name" })], total: 1 });
  renderStore();
  await waitFor(() => expect(storeRef.current.data?.items).toHaveLength(1));

  itemsApi.updateItem.mockResolvedValue(null); // PATCH returns no body
  await act(async () => {
    await storeRef.current.updateItem("item_1", { name: "New Name", favorite: true });
  });

  expect(itemsApi.updateItem).toHaveBeenCalledWith("item_1", expect.objectContaining({ name: "New Name", favorite: true }));
  expect(storeRef.current.data.items[0].name).toBe("New Name");
  expect(storeRef.current.data.items[0].favorite).toBe(true);
});

// ---------------------------------------------------------------------
// 6. Delete item
// ---------------------------------------------------------------------

test("delete item: removes it from state only after the API call succeeds, and prunes it from outfit itemIds", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  itemsApi.getItems.mockResolvedValue({ items: [apiItem({ id: "item_1" })], total: 1 });
  outfitsApi.getOutfits.mockResolvedValue([apiOutfit({ id: "outfit_1", itemIds: ["item_1", "item_2"] })]);
  renderStore();
  await waitFor(() => expect(storeRef.current.data?.items).toHaveLength(1));

  itemsApi.deleteItem.mockResolvedValue(null);
  await act(async () => {
    await storeRef.current.deleteItem("item_1");
  });

  expect(storeRef.current.data.items).toHaveLength(0);
  expect(storeRef.current.data.outfits[0].itemIds).toEqual(["item_2"]);
});

test("delete item: on API failure, the item stays in state", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  itemsApi.getItems.mockResolvedValue({ items: [apiItem({ id: "item_1" })], total: 1 });
  renderStore();
  await waitFor(() => expect(storeRef.current.data?.items).toHaveLength(1));

  itemsApi.deleteItem.mockRejectedValue(Object.assign(new Error("could not delete"), { status: 500, code: "INTERNAL" }));

  await expect(act(async () => {
    await storeRef.current.deleteItem("item_1");
  })).rejects.toThrow("could not delete");

  expect(storeRef.current.data.items).toHaveLength(1); // untouched
});

// ---------------------------------------------------------------------
// 7/8. Equip / unequip
// ---------------------------------------------------------------------

test("equip item: sends the slot+id to PUT /me/equipped and adopts the server's returned map", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  renderStore();
  await waitFor(() => expect(storeRef.current.data).not.toBeNull());

  userApi.setEquipped.mockResolvedValue({ tops: "item_top1", bottoms: "item_bottom1" });
  await act(async () => {
    await storeRef.current.setEquipped("bottoms", "item_bottom1");
  });

  expect(userApi.setEquipped).toHaveBeenCalledWith("bottoms", "item_bottom1");
  expect(storeRef.current.data.settings.equipped).toEqual({ tops: "item_top1", bottoms: "item_bottom1" });
});

test("unequip item: passing no id sends null and adopts the server's returned (shrunken) map", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  renderStore();
  await waitFor(() => expect(storeRef.current.data).not.toBeNull());

  userApi.setEquipped.mockResolvedValue({}); // tops slot cleared server-side
  await act(async () => {
    await storeRef.current.setEquipped("tops", null);
  });

  expect(userApi.setEquipped).toHaveBeenCalledWith("tops", null);
  expect(storeRef.current.data.settings.equipped).toEqual({});
});

// ---------------------------------------------------------------------
// 9. Wear logging
// ---------------------------------------------------------------------

test("wear logging: calls POST /items/:id/wear and mirrors the server's known worn/timesUsed increment", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  itemsApi.getItems.mockResolvedValue({ items: [apiItem({ id: "item_1", worn: 2, timesUsed: 2 })], total: 1 });
  renderStore();
  await waitFor(() => expect(storeRef.current.data?.items).toHaveLength(1));

  itemsApi.logWear.mockResolvedValue(null);
  await act(async () => {
    await storeRef.current.logWear("item_1");
  });

  expect(itemsApi.logWear).toHaveBeenCalledWith("item_1");
  expect(storeRef.current.data.items[0].worn).toBe(3);
  expect(storeRef.current.data.items[0].timesUsed).toBe(3);
});

// ---------------------------------------------------------------------
// 10/11/12. Outfits
// ---------------------------------------------------------------------

test("add outfit: applies the same client-side defaults the old version used, and appends the mapped result", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  renderStore();
  await waitFor(() => expect(storeRef.current.data).not.toBeNull());

  outfitsApi.createOutfit.mockResolvedValue(apiOutfit({ id: "outfit_new", name: "New outfit", emoji: "✨" }));
  await act(async () => {
    await storeRef.current.addOutfit({}); // no name given -> defaults apply
  });

  expect(outfitsApi.createOutfit).toHaveBeenCalledWith({ name: "New outfit", emoji: "✨", itemIds: [] });
  expect(storeRef.current.data.outfits.map((o) => o.name)).toContain("New outfit");
});

test("update outfit: patches only after success", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  outfitsApi.getOutfits.mockResolvedValue([apiOutfit({ id: "outfit_1", name: "Old" })]);
  renderStore();
  await waitFor(() => expect(storeRef.current.data?.outfits).toHaveLength(1));

  outfitsApi.updateOutfit.mockResolvedValue(null);
  await act(async () => {
    await storeRef.current.updateOutfit("outfit_1", { name: "Renamed" });
  });

  expect(outfitsApi.updateOutfit).toHaveBeenCalledWith("outfit_1", { name: "Renamed" });
  expect(storeRef.current.data.outfits[0].name).toBe("Renamed");
});

test("delete outfit: removes it from state only after success", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  outfitsApi.getOutfits.mockResolvedValue([apiOutfit({ id: "outfit_1" })]);
  renderStore();
  await waitFor(() => expect(storeRef.current.data?.outfits).toHaveLength(1));

  outfitsApi.deleteOutfit.mockResolvedValue(null);
  await act(async () => {
    await storeRef.current.deleteOutfit("outfit_1");
  });

  expect(storeRef.current.data.outfits).toHaveLength(0);
});

// ---------------------------------------------------------------------
// 13. API failure
// ---------------------------------------------------------------------

test("API failure on initial load: sets a friendly error and a safe empty data shape rather than leaving data null forever", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  itemsApi.getItems.mockRejectedValue(Object.assign(new Error("Could not reach the server. Check your connection and try again."), { status: 0, code: "NETWORK_ERROR" }));

  renderStore();

  await waitFor(() => expect(storeRef.current.error).toBeTruthy());
  expect(storeRef.current.error).toBe("Could not reach the server. Check your connection and try again.");
  expect(storeRef.current.data).toEqual(
    expect.objectContaining({ items: [], outfits: [], settings: { equipped: {}, displayName: "Priya" } })
  );
  expect(storeRef.current.isLoading).toBe(false);
});

// ---------------------------------------------------------------------
// 14/15/16. Auth becoming available, logout clearing state, switching users
// ---------------------------------------------------------------------

test("authentication becoming available after mount triggers the initial load", async () => {
  const { rerender } = renderStore();
  await new Promise((r) => setTimeout(r, 5));
  expect(itemsApi.getItems).not.toHaveBeenCalled();

  authState.user = userA();
  authState.isAuthenticated = true;
  itemsApi.getItems.mockResolvedValue({ items: [apiItem()], total: 1 });

  act(() => rerender(<StoreProvider><Harness /></StoreProvider>));

  await waitFor(() => expect(storeRef.current.data?.items).toHaveLength(1));
});

test("logout clears StoreContext state entirely (no stale items/outfits left behind)", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  itemsApi.getItems.mockResolvedValue({ items: [apiItem()], total: 1 });
  const { rerender } = renderStore();
  await waitFor(() => expect(storeRef.current.data?.items).toHaveLength(1));

  authState.user = null;
  authState.isAuthenticated = false;
  act(() => rerender(<StoreProvider><Harness /></StoreProvider>));

  await waitFor(() => expect(storeRef.current.data).toBeNull());
});

test("switching users: user A's items never leak into user B's loaded state", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;
  itemsApi.getItems.mockResolvedValue({ items: [apiItem({ id: "item_a1", name: "Priya's Top" })], total: 1 });
  const { rerender } = renderStore();
  await waitFor(() => expect(storeRef.current.data?.items?.[0]?.name).toBe("Priya's Top"));

  // Log out user A first (mirrors real AuthContext behavior: user goes
  // through null before a new login resolves) — this is also what
  // guarantees loadedUserId gets reset so user B's load isn't skipped.
  authState.user = null;
  authState.isAuthenticated = false;
  act(() => rerender(<StoreProvider><Harness /></StoreProvider>));
  await waitFor(() => expect(storeRef.current.data).toBeNull());

  authState.user = userB();
  authState.isAuthenticated = true;
  itemsApi.getItems.mockResolvedValue({ items: [apiItem({ id: "item_b1", name: "Sana's Skirt" })], total: 1 });
  act(() => rerender(<StoreProvider><Harness /></StoreProvider>));

  await waitFor(() => expect(storeRef.current.data?.items?.[0]?.name).toBe("Sana's Skirt"));
  expect(storeRef.current.data.items.find((i) => i.name === "Priya's Top")).toBeUndefined();
  expect(storeRef.current.data.settings.equipped).toEqual({}); // user B's own (empty) equipped map, not user A's
});

// ---------------------------------------------------------------------
// 17. Stale request protection
// ---------------------------------------------------------------------

test("stale request protection: a slow load for a since-logged-out user never populates state after logout", async () => {
  authState.user = userA();
  authState.isAuthenticated = true;

  let resolveItems;
  itemsApi.getItems.mockReturnValue(
    new Promise((resolve) => {
      resolveItems = resolve;
    })
  );

  const { rerender } = renderStore();
  await waitFor(() => expect(storeRef.current.isLoading).toBe(true));

  // Log out while user A's request is still in flight.
  authState.user = null;
  authState.isAuthenticated = false;
  act(() => rerender(<StoreProvider><Harness /></StoreProvider>));
  await waitFor(() => expect(storeRef.current.data).toBeNull());

  // The stale request for user A finally resolves after logout — it must be discarded.
  await act(async () => {
    resolveItems({ items: [apiItem({ name: "Should never appear" })], total: 1 });
    await new Promise((r) => setTimeout(r, 10));
  });

  expect(storeRef.current.data).toBeNull();
});

// ---------------------------------------------------------------------
// Demo mode (no backend) — see lib/AuthContext.jsx's loginDemo()
// ---------------------------------------------------------------------

function demoUser() {
  return { id: "demo-user", name: "Demo", email: "demo@lifecloset.app", isDemo: true };
}

test("demo mode: loads local seed data instead of calling the API at all", async () => {
  authState.user = demoUser();
  authState.isAuthenticated = true;

  renderStore();

  await waitFor(() => expect(storeRef.current.data).not.toBeNull());

  expect(itemsApi.getItems).not.toHaveBeenCalled();
  expect(outfitsApi.getOutfits).not.toHaveBeenCalled();
  expect(storeRef.current.data.items.length).toBeGreaterThan(0);
  expect(storeRef.current.data.settings.displayName).toBe("Demo");
});

test("demo mode: addItem, updateItem, deleteItem all stay local — zero network calls", async () => {
  authState.user = demoUser();
  authState.isAuthenticated = true;
  renderStore();
  await waitFor(() => expect(storeRef.current.data).not.toBeNull());
  const startCount = storeRef.current.data.items.length;

  let added;
  await act(async () => {
    added = await storeRef.current.addItem({ category: "tops", name: "Demo Tee", color: "#ABCDEF" });
  });
  expect(storeRef.current.data.items).toHaveLength(startCount + 1);
  expect(added.name).toBe("Demo Tee");

  await act(async () => {
    await storeRef.current.updateItem(added.id, { name: "Renamed Tee" });
  });
  expect(storeRef.current.data.items.find((i) => i.id === added.id).name).toBe("Renamed Tee");

  await act(async () => {
    await storeRef.current.deleteItem(added.id);
  });
  expect(storeRef.current.data.items.find((i) => i.id === added.id)).toBeUndefined();

  expect(itemsApi.createItem).not.toHaveBeenCalled();
  expect(itemsApi.updateItem).not.toHaveBeenCalled();
  expect(itemsApi.deleteItem).not.toHaveBeenCalled();
});

test("demo mode: setEquipped mirrors the backend's dress vs tops/bottoms mutual exclusion, entirely locally", async () => {
  authState.user = demoUser();
  authState.isAuthenticated = true;
  renderStore();
  await waitFor(() => expect(storeRef.current.data).not.toBeNull());
  const topId = storeRef.current.data.items.find((i) => i.category === "tops").id;
  const dressId = storeRef.current.data.items.find((i) => i.category === "dresses").id;

  await act(async () => {
    await storeRef.current.setEquipped("tops", topId);
  });
  expect(storeRef.current.data.settings.equipped.tops).toBe(topId);

  await act(async () => {
    await storeRef.current.setEquipped("dresses", dressId);
  });
  expect(storeRef.current.data.settings.equipped.dresses).toBe(dressId);
  expect(storeRef.current.data.settings.equipped.tops).toBeUndefined();

  expect(userApi.setEquipped).not.toHaveBeenCalled();
});
