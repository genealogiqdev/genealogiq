import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: {
    // Workspace UI can resolve a different pnpm peer instance of Next in a
    // clean install. Keep its navigation imports on the same mocked instance.
    dedupe: ["next"],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next marker packages — stubbed so server modules can be unit-tested.
      "server-only": fileURLToPath(new URL("../../test-stubs/empty.ts", import.meta.url)),
      "client-only": fileURLToPath(new URL("../../test-stubs/empty.ts", import.meta.url)),
    },
  },
  test: {
    name: "bms",
    include: ["src/**/*.{test,spec}.ts"],
    environment: "node",
    // next-auth's ESM build imports "next/server" without a file extension,
    // which only a bundler resolves; inlining lets Vite handle it in tests.
    server: { deps: { inline: ["next-auth"] } },
  },
})
