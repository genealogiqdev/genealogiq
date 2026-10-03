# Consumer billing and feature quotas

> **Code:** [src/actions/billing.actions.ts](../src/actions/billing.actions.ts) · [src/actions/extra-units.actions.ts](../src/actions/extra-units.actions.ts) · [src/lib/subscription.ts](../src/lib/subscription.ts) · [src/lib/quota.ts](../src/lib/quota.ts) · [src/lib/plan-quotas.ts](../src/lib/plan-quotas.ts) · [src/lib/extra-units.ts](../src/lib/extra-units.ts) · [src/app/api/stripe/webhook/route.ts](../src/app/api/stripe/webhook/route.ts)
> **Entry points:** `/subscriptions` · `/billing/qr-code` · `/api/stripe/webhook`
> **Depends on:** [PARTNER-CREDITS](../../../docs/PARTNER-CREDITS.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-03 at `6e06634`, including this task’s uncommitted documentation, launcher and test changes. Source verification is separate from runtime/UI below.

The APP application supplies consumer billing and feature quotas. Zod parses checkout/currency inputs; getMemorialFeatures resolves current Subscription quota fields through a live living/guardian AppSale and ranks guardian plans by current USD PlanPrice. Extra-unit limits use purchased ExtraUnitPurchase quantities. Prices are versioned PlanPrice rows; do not trust UI amounts. The FREE fallback must exist. Subscription quota and price-book migrations own the dimensions; exact provenance is in DATABASE.md.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/billing.actions.ts](../src/actions/billing.actions.ts) `createCheckoutSession` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/actions/billing.actions.ts](../src/actions/billing.actions.ts) `changeSubscription` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/app/api/stripe/webhook/route.ts](../src/app/api/stripe/webhook/route.ts) `POST` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/billing.actions.ts](../src/actions/billing.actions.ts) | `createCheckoutSession`, `changeSubscription`, `createPortalSession` | Authenticated mutation orchestration |
| [src/actions/extra-units.actions.ts](../src/actions/extra-units.actions.ts) | `createExtraUnitCheckoutSession` | Authenticated mutation orchestration |
| [src/lib/subscription.ts](../src/lib/subscription.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/lib/quota.ts](../src/lib/quota.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/lib/plan-quotas.ts](../src/lib/plan-quotas.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/lib/extra-units.ts](../src/lib/extra-units.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/app/api/stripe/webhook/route.ts](../src/app/api/stripe/webhook/route.ts) | See exports/component in file | HTTP entry and response handling |

## Rules and why

getFreeQuotas throws when FREE is absent. Living paid sales and eligible guardian/trial memorial entitlements follow subscription.ts; 2498328 removed maxProfiles, e58ca97 allowed existing over-quota media to stay/shrink, 8ee8aa8 introduced price-book behavior. Signed Stripe events are deduplicated; do not infer renewal from the checkout redirect.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

Zod parses checkout/currency inputs; getMemorialFeatures resolves current Subscription quota fields through a live living/guardian AppSale and ranks guardian plans by current USD PlanPrice. Extra-unit limits use purchased ExtraUnitPurchase quantities. Prices are versioned PlanPrice rows; do not trust UI amounts. The FREE fallback must exist. Subscription quota and price-book migrations own the dimensions; exact provenance is in DATABASE.md.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `Subscription` | `subscriptions` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `AppSale` | `app_sales` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `ExtraUnitPrice` | `app_extra_unit_prices` | [20260805000000_extra_unit_purchases](../../../packages/db/prisma/migrations/20260805000000_extra_unit_purchases/migration.sql) |
| `ExtraUnitPurchase` | `app_extra_unit_purchases` | [20260805000000_extra_unit_purchases](../../../packages/db/prisma/migrations/20260805000000_extra_unit_purchases/migration.sql) |
| `StripeEvent` | `stripe_events` | [20260517000000_align_app_sale_stripe](../../../packages/db/prisma/migrations/20260517000000_align_app_sale_stripe/migration.sql) |
| `PlanPrice` | `plan_prices` | [20260825233000_partner_plans_and_cycles](../../../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/subscriptions` | [src/app/(protected)/subscriptions/page.tsx](../src/app/(protected)/subscriptions/page.tsx) |
| GET | `/billing/qr-code` | [src/app/(protected)/billing/qr-code/page.tsx](../src/app/(protected)/billing/qr-code/page.tsx) |
| POST | `/api/stripe/webhook` | [src/app/api/stripe/webhook/route.ts](../src/app/api/stripe/webhook/route.ts) |

| Setting | Default | Validation / owner | Consequence |
| --- | --- | --- | --- |
| Shared settings | See [CONFIGURATION](../../../docs/CONFIGURATION.md) | Consumer modules resolve shared config rather than a feature-specific env schema | Restart/rebuild as documented |

## How to test it (AI-runnable)

Run commands from the repository root `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Install workspace dependencies first.

| Layer | Command | Needs | Cost | Proves |
| --- | --- | --- | --- | --- |
| Unit (deterministic) | `pnpm test` | Workspace install; root Vitest supplies an unreachable dummy DB URL | Free, seconds | Named mocked action/HTTP and policy cases in the specs below |
| Contract / schema | `pnpm check:schema-parity` | Workspace install | Free, seconds | One canonical Prisma schema; feature input constraints are only proven when a schema spec is listed |
| Golden / replay | n/a: no complete recorded-provider replay fixture | Hand-authored recorded responses; cache misses must fail | Not run | Model regression is not applicable; provider/data drift remains an integration limit |
| End-to-end / harness | n/a: no feature-specific isolated browser harness | See prerequisites below | Local/free when prerequisites exist | Requires the described feature scenario |
| Offline evidence | `node scripts/check-docs.mjs` | Repository docs | Free, seconds | Paths, links, headings, metadata and indexes; it cannot verify pixels or business outcomes |
| Manual product QA | `node scripts/local-qa.mjs` → scenarios below | Local PostgreSQL, relevant app; Azurite for media; fixture Credentials identity | Local/free; real providers need test accounts | Visible result plus save/reload or independently checked persisted effect |

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/billing.actions.test.ts](../src/actions/billing.actions.test.ts) · [src/lib/subscription.test.ts](../src/lib/subscription.test.ts) · [src/lib/quota.test.ts](../src/lib/quota.test.ts) · [src/lib/plan-quotas.test.ts](../src/lib/plan-quotas.test.ts) · [src/lib/extra-units.test.ts](../src/lib/extra-units.test.ts) · [src/app/api/stripe/webhook/route.test.ts](../src/app/api/stripe/webhook/route.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run APP and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Open /subscriptions with the seeded Premium consumer and compare displayed plan/quotas to local Subscription and AppSale rows. Complete checkout only with a Stripe test fixture and signed webhook replay.
2. **Boundary:** A FREE consumer at its cap must receive quota rejection with no inserted item; requires a FREE row and capped fixtures. Missing FREE is a setup failure, not a quota pass.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: A disposable feature dataset and the exact happy/boundary interaction have not been exercised. | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/app/src/actions/billing.actions.ts apps/app/src/actions/extra-units.actions.ts apps/app/src/lib/subscription.ts apps/app/src/lib/quota.ts apps/app/src/lib/plan-quotas.ts apps/app/src/lib/extra-units.ts apps/app/src/app/api/stripe/webhook/route.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `BILLING-QUOTAS-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### BILLING-QUOTAS-G1: Extra-unit checkout has no direct deterministic action test

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** extra-units.actions.ts delegates to Stripe; existing extra-units tests cover quota arithmetic rather than the checkout action.
- **Impact:** Checkout argument or ownership regressions can escape the suite.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Mock the SDK and seed explicit price, currency and user expectations for checkout rejection/success.

### BILLING-QUOTAS-G2: Fresh local seed does not create the FREE fallback

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** seed-local.ts creates a Premium sale but getFreeQuotas requires a Subscription with code FREE.
- **Impact:** Fresh free accounts and some guardian fallback paths throw instead of showing free quotas.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Add an idempotent FREE fixture with independent plan expectations; preserve existing database pricing.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [PARTNER-CREDITS](../../../docs/PARTNER-CREDITS.md)
