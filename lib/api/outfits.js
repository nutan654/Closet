/**
 * lib/api/outfits.js
 *
 * Maps to backend/internal/handlers/outfit_handler.go via
 * backend/internal/routes/routes.go:
 *
 *   POST   /api/v1/outfits      -> createOutfit()
 *   GET    /api/v1/outfits      -> getOutfits()
 *   GET    /api/v1/outfits/:id  -> getOutfit()
 *   PATCH  /api/v1/outfits/:id  -> updateOutfit()
 *   DELETE /api/v1/outfits/:id  -> deleteOutfit()
 *
 * Request/response shapes come from backend/internal/dto/item_dto.go
 * (OutfitRequest, OutfitPatchRequest, OutfitResponse — outfit DTOs live in
 * that file alongside the item ones on the backend).
 */

import { apiGet, apiPost, apiPatch, apiDelete } from "./client";

/** @param {{ name: string, emoji?: string, itemIds?: string[] }} payload */
export function createOutfit(payload) {
  return apiPost("/outfits", payload);
}

/** @returns {Promise<object[]>} OutfitResponse[] */
export function getOutfits() {
  return apiGet("/outfits");
}

/** @param {string} id */
export function getOutfit(id) {
  return apiGet(`/outfits/${encodeURIComponent(id)}`);
}

/** @param {string} id @param {{ name?: string, emoji?: string, itemIds?: string[] }} patch */
export function updateOutfit(id, patch) {
  return apiPatch(`/outfits/${encodeURIComponent(id)}`, patch);
}

/** @param {string} id */
export function deleteOutfit(id) {
  return apiDelete(`/outfits/${encodeURIComponent(id)}`);
}
