# E2E (Playwright)

The current public smoke project checks BMS sign-in, pt-BR locale and a missing route at http://localhost:3001. Run it against the identified [local launcher](../docs/LOCAL-DEVELOPMENT.md): start node scripts/local-qa.mjs --app=bms, install the pinned browser if needed with pnpm exec playwright install chromium, then run pnpm exec playwright test --project=public. Three tests passed on 2026-10-03 at 6e06634 plus working changes.

Authenticated CRUD is incomplete: old /packages scenarios are retired, coupon CRUD calls Stripe, seed:e2e does not guard local URLs and Playwright reuse/fallback configuration does not enforce isolation. The previous Neon-development guarantee is not valid. See [TESTING](../docs/TESTING.md) for the permanent gap and fixture requirements. Do not report the public smoke as authenticated CRUD or payment coverage.

The three-app manual baseline uses the guarded seed-local and normal Credentials forms, with exact save/reload and boundary steps in [LOCAL-DEVELOPMENT](../docs/LOCAL-DEVELOPMENT.md). Root/app AGENTS.md and feature docs are the current memory.
