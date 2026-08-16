/**
 * lib/api/patterns.js
 *
 * Maps to backend/internal/handlers/pattern_handler.go via
 * backend/internal/routes/routes.go:
 *
 *   POST /api/v1/patterns/process -> PatternHandler.Process()
 *
 * That handler is itself a thin proxy to the Python pattern-service (see
 * pattern-service/app/main.py) — this client doesn't know or care that a
 * second service exists behind it, same as items.js doesn't know Postgres
 * exists behind ItemHandler.
 */

import { apiPost } from "./client";

/**
 * Uploads a fabric/pattern photo and gets back a seamlessly-tiling
 * texture + dominant color palette.
 *
 * @param {File} file
 * @returns {Promise<{ tileDataUrl: string, width: number, height: number, palette: string[] }>}
 */
export function processPattern(file) {
  const formData = new FormData();
  formData.append("image", file);
  return apiPost("/patterns/process", formData, { isFormData: true });
}
