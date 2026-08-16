import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Base environment stays "node" for the lib/api/__tests__ fetch-mock
// tests (no DOM needed there). lib/__tests__/StoreContext.test.jsx opts
// into jsdom itself via a `// @vitest-environment jsdom` pragma at the
// top of that file — see that file for why (it renders a StoreProvider
// through @testing-library/react, the one new dependency this file
// needed, added in Phase 4.3).
//
// The react plugin gives JSX the automatic runtime (same as Next.js's own
// compiler) so .jsx files don't need a manual `import React` just to
// satisfy the test runner — production files stay untouched.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: [
      "lib/api/__tests__/**/*.test.js",
      "lib/__tests__/**/*.test.jsx",
      // Phase 5 — Smart Garment Engine: pure-logic tests for the pattern
      // math/layer-order/shape-registry (node env, no DOM needed) plus
      // the GarmentRenderer component test (jsdom, opted in per-file the
      // same way lib/__tests__/StoreContext.test.jsx does).
      "lib/doll/__tests__/**/*.test.js",
      "components/doll/__tests__/**/*.test.jsx",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
