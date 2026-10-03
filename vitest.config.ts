import { defineConfig } from "vitest/config"

// Each app declares its own Vitest project (with its own "@/*" alias pointing at
// that app's src). This lets tests in app/seq/bms resolve "@/..." correctly even
// though all three share the same alias name. See apps/<app>/vitest.config.ts.
export default defineConfig({
  test: {
    // Some pure-core tests import a module that initializes Prisma. Use an
    // unreachable dummy endpoint so plain `pnpm test` needs no local env file
    // and an accidental unmocked query fails instead of touching real data.
    env: { DATABASE_URL: "postgresql://unit:unit@127.0.0.1:1/unit" },
    projects: ["apps/app", "apps/seq", "apps/bms", "packages/core", "packages/auth", "packages/services", "packages/email"],
  },
})
