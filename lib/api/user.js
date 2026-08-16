/**
 * lib/api/user.js
 *
 * Maps to backend/internal/handlers/user_handler.go via
 * backend/internal/routes/routes.go:
 *
 *   PUT /api/v1/me/equipped -> setEquipped()
 *
 * This is a separate module from items.js on purpose: on the backend it's
 * UserHandler.SetEquipped, not part of ItemHandler at all — StoreContext's
 * current `setEquipped(slot, itemId)` (see lib/StoreContext.jsx) maps
 * directly onto this one endpoint, not onto an item-level "equip" call.
 *
 * Request shape comes from backend/internal/dto/item_dto.go
 * (EquippedRequest: `{ slot, itemId }`, itemId omitted/null to unequip).
 */

import { apiPut } from "./client";

/**
 * @param {string} slot - e.g. "tops", "bottoms", "dresses" (see
 *   lib/constants.js DOLL_SLOTS for the current frontend's slot names)
 * @param {string|null} [itemId] - omit or pass null to unequip that slot
 */
export function setEquipped(slot, itemId = null) {
  return apiPut("/me/equipped", { slot, itemId });
}
