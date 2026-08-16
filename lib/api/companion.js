/**
 * lib/api/companion.js
 *
 * Maps to backend/internal/handlers/companion_handler.go via
 * backend/internal/routes/routes.go:
 *
 *   POST /api/v1/companion/chat -> CompanionHandler.Chat()
 *
 * That handler proxies to the Gemini API server-side (the API key never
 * touches the browser) and already loads the caller's own wardrobe as
 * context — this client sends the visible conversation plus, when
 * available, the browser's rough geolocation so Bear can ground outfit
 * suggestions in today's actual weather (backend/internal/weather).
 */

import { apiPost } from "./client";

/**
 * Best-effort, one-shot browser geolocation lookup. Resolves to `null`
 * (never rejects) if geolocation isn't available or the person hasn't
 * granted permission — weather is a nice-to-have enrichment for Bear,
 * never something worth blocking or erroring the chat over.
 * @returns {Promise<{ lat: number, lon: number } | null>}
 */
function getRoughLocation() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 4000, maximumAge: 10 * 60 * 1000 } // cached fix up to 10 min old is fine for weather
    );
  });
}

/**
 * @param {string} message - the person's newest message
 * @param {{role: "user"|"assistant", text: string}[]} [history] - prior
 *   turns in the visible conversation, oldest first. Does NOT include
 *   `message` itself — the backend appends that as the final turn.
 * @returns {Promise<{ reply: string }>}
 */
export async function chatWithBear(message, history = []) {
  const location = await getRoughLocation();
  return apiPost("/companion/chat", {
    message,
    history,
    ...(location ? { lat: location.lat, lon: location.lon } : {}),
  });
}
