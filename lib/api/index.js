/**
 * lib/api/index.js
 *
 * Convenience barrel for the API layer. StoreContext (lib/StoreContext.jsx)
 * imports from the individual modules directly rather than this barrel,
 * but it's kept up to date for anything else that wants
 * `import { items, auth } from "@/lib/api"` instead of several separate
 * import lines.
 */

export * as client from "./client";
export * as auth from "./auth";
export * as items from "./items";
export * as outfits from "./outfits";
export * as user from "./user";
export * as mappers from "./mappers";
