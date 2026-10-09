import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next marker packages — stubbed so server modules can be unit-tested.
      "server-only": fileURLToPath(new URL("../../test-stubs/empty.ts", import.meta.url)),
      "client-only": fileURLToPath(new URL("../../test-stubs/empty.ts", import.meta.url)),
    },
  },
  test: {
    name: "seq",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
  },
})
