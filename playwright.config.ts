import { defineConfig, devices } from "@playwright/test"
import { config as loadEnv } from "dotenv"

// Load explicit overrides for a disposable test environment. This legacy config
// does not validate DB locality and may reuse an existing server; see docs/TESTING.md.
// Next.js's @next/env never overrides values already present in process.env, so
// passing them through `webServer.env` wins over apps/bms/.env.
const e2eEnv = loadEnv({ path: ".env.e2e" }).parsed ?? {}

const PORT = 3001
const baseURL = `http://localhost:${PORT}`
const STORAGE = "e2e/.auth/user.json"

export default defineConfig({
  testDir: "./e2e",
  // Serial: the authenticated CRUD specs share one dev server + the dev DB, so
  // parallel workers contend and make dropdown→navigate steps flaky.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    // Public, read-only pages — no auth needed.
    {
      name: "public",
      testMatch: /.*\.smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Sign the seeded admin in once and persist the session.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // Authenticated CRUD — replays the stored session; runs after setup.
    {
      name: "authenticated",
      testMatch: /.*\.crud\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: STORAGE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm --filter @genealogiq/bms dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Explicit .env.e2e keys override inherited values; missing keys are not isolated.
    env: { ...process.env, ...e2eEnv } as Record<string, string>,
  },
})
