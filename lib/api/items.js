/**
 * lib/api/items.js
 *
 * Maps to backend/internal/handlers/item_handler.go via
 * backend/internal/routes/routes.go:
 *
 *   POST   /api/v1/items          -> createItem()
 *   GET    /api/v1/items          -> getItems()
 *   PATCH  /api/v1/items/:id      -> updateItem()
 *   DELETE /api/v1/items/:id      -> deleteItem()
 *   POST   /api/v1/items/:id/wear -> logWear()
 *   GET    /api/v1/history        -> getHistory()
 *
 * There is deliberately no getItem(id) here — the backend has no
 * `GET /items/:id` route (see routes.go); only list, patch, delete, wear,
 * and history exist for items. Do not invent one.
 *
 * Request/response shapes come from backend/internal/dto/item_dto.go
 * (ItemRequest, ItemPatchRequest, ItemResponse, PageResponse).
 */

import { apiGet, apiPost, apiPatch, apiDelete } from "./client";

/**
 * Creates an item. Accepts either:
 *  - a plain object -> sent as application/json (no image; the "legacy"
 *    Phase 2 path where `photo` is just a free-text URL string), or
 *  - a FormData instance -> sent as multipart/form-data, letting the
 *    browser set its own Content-Type + boundary. This is required for
 *    the optional `image` file part the backend accepts (see
 *    backend/internal/handlers/item_handler.go Create, and
 *    backend/internal/dto/item_dto.go ItemRequest's dual `json`/`form`
 *    tags). Never build the multipart Content-Type header by hand.
 *
 * @param {object|FormData} payload
 * @returns {Promise<object>} ItemResponse
 */
export function createItem(payload) {
  const isFormData = typeof FormData !== "undefined" && payload instanceof FormData;
  return apiPost("/items", payload, { isFormData });
}

/**
 * @param {{ category?: string, page?: number, perPage?: number }} [params]
 * @returns {Promise<{ items: object[], total: number, page: number, perPage: number, totalPages: number }>}
 */
export function getItems(params = {}) {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.page) query.set("page", String(params.page));
  if (params.perPage) query.set("perPage", String(params.perPage));
  const qs = query.toString();
  return apiGet(`/items${qs ? `?${qs}` : ""}`);
}

/**
 * Partial update — only send fields that actually changed (mirrors
 * ItemPatchRequest's all-pointer shape server-side).
 * @param {string} id
 * @param {object} patch
 */
export function updateItem(id, patch) {
  return apiPatch(`/items/${encodeURIComponent(id)}`, patch);
}

/** @param {string} id */
export function deleteItem(id) {
  return apiDelete(`/items/${encodeURIComponent(id)}`);
}

/** Records that an item was worn today. @param {string} id */
export function logWear(id) {
  return apiPost(`/items/${encodeURIComponent(id)}/wear`);
}

/** Recent wear history for the current user (most recent 200, server-side capped). */
export function getHistory() {
  return apiGet("/history");
}
