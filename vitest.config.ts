import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests target the pure libraries (no DB, no network, no React). We map
 * the `@/` alias so tests import modules exactly as the app does, and scope the
 * run to `src/**` *.test.ts files so Playwright/e2e (if added) stay separate.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
