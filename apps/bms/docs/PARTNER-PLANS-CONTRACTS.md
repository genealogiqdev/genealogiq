# Partner plans and annual contracts

> **Code:** [src/actions/partner-plan.actions.ts](../src/actions/partner-plan.actions.ts) · [src/queries/partner-plans.ts](../src/queries/partner-plans.ts) · [src/queries/partner-subscriptions.ts](../src/queries/partner-subscriptions.ts) · [src/schemas/partner-plan.schema.ts](../src/schemas/partner-plan.schema.ts)
> **Entry points:** `/plans` · `/plans/new` · `/plans/[id]` · `/sales/contracts` · `/sales/contracts/new` · `/sales/contracts/[id]`
> **Depends on:** [PARTNER-CREDITS](../../../docs/PARTNER-CREDITS.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-07 at `9253152` plus the Gen2026 changes to the paths named below. Source, tests, runtime and UI are recorded separately; earlier observations remain in the verification log.

The BMS application supplies partner plans and annual contracts. Plan forms version allowance, trial and pricing. Contracts bind Tenant, PartnerPlan and effective PlanPrice; a paid Stripe invoice creates the cycle with plan/price snapshots. Annual cash and installment options represent one twelve-month entitlement cycle.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/partner-plan.actions.ts](../src/actions/partner-plan.actions.ts) `sendPartnerPlanLink` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/schemas/partner-plan.schema.ts](../src/schemas/partner-plan.schema.ts) `getPartnerPlanSchema` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/queries/partner-plans.ts](../src/queries/partner-plans.ts) `getPartnerPlans` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/partner-plan.actions.ts](../src/actions/partner-plan.actions.ts) | `sendPartnerPlanLink`, `createPartnerPlan`, `updatePartnerPlan`, `togglePartnerPlanActive`, `syncPartnerPlan` | Authenticated mutation orchestration |
| [src/queries/partner-plans.ts](../src/queries/partner-plans.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/queries/partner-subscriptions.ts](../src/queries/partner-subscriptions.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/schemas/partner-plan.schema.ts](../src/schemas/partner-plan.schema.ts) | See exports/component in file | Input validation and defaults |

## Rules and why

ea6e3ca made invoice-paid cycles explicit; 7f13c0a added rollover/grace. Plan changes do not rewrite a bought cycle snapshot. Do not use an installment webhook to grant another full allowance unless a new cycle is due (partner-billing.test.ts).

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

### Contracts settled with a manual 100% coupon

The BMS sale form offers Gen2026 and routes to the [manual review](DISCOUNT-COUPONS.md), preserving the selected partner and plan. Active plans with a current price may use this mode before Stripe synchronization. Staff confirms the external receipt/old stock; the server resolves price, tenant and plan again. No checkout or recurring Stripe subscription is created.

The manual service creates an ACTIVE contract with `autoRenew=false` and a 12-month cycle through `openPartnerCycle`. The existing plan/price snapshots, allowance, grace, founder latch, rollover and stock-delta rules are shared with paid-invoice fulfillment. An ended manual contract in grace can renew in the same contract. Live cycles, pending purchases and Stripe-managed contracts reject an overlapping manual period. R$1,000 catalog value with a full discount records zero charged here; an independently entered R$900 external receipt remains in the coupon audit and price snapshot, not Stripe revenue.

Acceptance: the isolated 20-credit plan opens one cycle and exposes 20 available GenCodes in SEQ. In the PostgreSQL renewal fixture, 20 unused annual credits renew under the 30% cap into 6 rollover + 20 annual credits; stock becomes 26, not 40. Browser QA also rejects another period for a still-active contract and checks the existing BMS sale form's manual review entry. A new OWNER is provisioned using the existing first-payment access process. See the [Gen2026 audit](../../../docs/audits/GEN2026-2026-10-07.md).

Plan forms version allowance, trial and pricing. Contracts bind Tenant, PartnerPlan and effective PlanPrice; a paid Stripe invoice creates the cycle with plan/price snapshots. Annual cash and installment options represent one twelve-month entitlement cycle.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `PartnerPlan` | `partner_plans` | [20260825233000_partner_plans_and_cycles](../../../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `PlanPrice` | `plan_prices` | [20260825233000_partner_plans_and_cycles](../../../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `PartnerSubscription` | `partner_subscriptions` | [20260825233000_partner_plans_and_cycles](../../../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `SubscriptionCycle` | `subscription_cycles` | [20260825233000_partner_plans_and_cycles](../../../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/plans` | [src/app/(protected)/plans/page.tsx](../src/app/(protected)/plans/page.tsx) |
| GET | `/plans/new` | [src/app/(protected)/plans/new/page.tsx](../src/app/(protected)/plans/new/page.tsx) |
| GET | `/plans/[id]` | [src/app/(protected)/plans/[id]/page.tsx](../src/app/(protected)/plans/[id]/page.tsx) |
| GET | `/sales/contracts` | [src/app/(protected)/sales/contracts/page.tsx](../src/app/(protected)/sales/contracts/page.tsx) |
| GET | `/sales/contracts/new` | [src/app/(protected)/sales/contracts/new/page.tsx](../src/app/(protected)/sales/contracts/new/page.tsx) |
| GET | `/sales/contracts/[id]` | [src/app/(protected)/sales/contracts/[id]/page.tsx](../src/app/(protected)/sales/contracts/[id]/page.tsx) |

| Setting | Default | Validation / owner | Consequence |
| --- | --- | --- | --- |
| Shared settings | See [CONFIGURATION](../../../docs/CONFIGURATION.md) | Consumer modules resolve shared config rather than a feature-specific env schema | Restart/rebuild as documented |

## How to test it (AI-runnable)

Run commands from the repository root `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Install workspace dependencies first.

| Layer | Command | Needs | Cost | Proves |
| --- | --- | --- | --- | --- |
| Unit (deterministic) | `pnpm test` | Workspace install; root Vitest supplies an unreachable dummy DB URL | Free, seconds | Schema price/cadence/trial constraints; BMS action/checkout is not covered |
| Contract / schema | `pnpm check:schema-parity` | Workspace install | Free, seconds | One canonical Prisma schema; feature input constraints are only proven when a schema spec is listed |
| Golden / replay | n/a: no complete recorded-provider replay fixture | Hand-authored recorded responses; cache misses must fail | Not run | Model regression is not applicable; provider/data drift remains an integration limit |
| End-to-end / harness | `pnpm exec playwright test --project=public` | Verified local BMS launcher; installed Chromium | Local/free when prerequisites exist | BMS public sign-in/locale/404 only; it does not prove this feature |
| Offline evidence | `node scripts/check-docs.mjs` | Repository docs | Free, seconds | Paths, links, headings, metadata and indexes; it cannot verify pixels or business outcomes |
| Manual product QA | `node scripts/local-qa.mjs` → scenarios below | Local PostgreSQL, relevant app; Azurite for media; fixture Credentials identity | Local/free; real providers need test accounts | Visible result plus save/reload or independently checked persisted effect |

**Specs included in the successful 2026-10-03 full-suite run:** [src/schemas/partner-plan.schema.test.ts](../src/schemas/partner-plan.schema.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run BMS and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Create/version a synthetic plan, issue a test contract link and replay a signed paid invoice; verify exactly one cycle and allowance grant. Requires Stripe fixtures and a test tenant.
2. **Boundary:** Repeat the invoice and expect no second cycle/grant; attempt a plan mutation as non-admin and expect rejection. Requires direct action and webhook fixtures.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: Requires Stripe fixtures and a test tenant; Requires direct action and webhook fixtures | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/bms/src/actions/partner-plan.actions.ts apps/bms/src/queries/partner-plans.ts apps/bms/src/queries/partner-subscriptions.ts apps/bms/src/schemas/partner-plan.schema.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `PARTNER-PLANS-CONTRACTS-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### PARTNER-PLANS-CONTRACTS-G1: Partner checkout callback points to a removed route

- **Status:** fixed
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** sendPartnerPlanLink builds successUrl/cancelUrl and revalidates /sales/manual-sales; the current router uses /sales/contracts.
- **Impact:** A completed or canceled checkout can return the partner/operator to a missing page.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** 2026-10-07, this Gen2026 change points success/cancel callbacks and revalidation to `/sales/contracts`, with the correct local BMS fallback on port 3001. `partner-plan.actions.test.ts` pins the literal configured/fallback URLs, role boundary and coupon restriction behavior. The original removed-route evidence above is retained; actual signed Stripe return remains an integration prerequisite.

### PARTNER-PLANS-CONTRACTS-G2: Plan CRUD/contract actions have no direct deterministic specs

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** The new partner plan schema spec pins cash/installment/trial constraints. partner-plan.actions.ts still has no action test; shared partner-billing tests cover downstream lifecycle only.
- **Impact:** Form validation, role gates and checkout snapshot arguments may regress independently.
- **Root cause:** Missing fixture or direct coverage as described above.
- **Resolution:** Not fixed in this task. Add mocked action tests with hand-authored plan/price snapshots; provide signed invoice replay fixtures.

  2026-10-07 partial resolution: five direct checkout-action tests now cover callbacks, permission and manual/B2C coupon rejection. Catalog CRUD and signed provider replay are still open; this gap is not marked fully fixed.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |
| 2026-10-07 | `218d5aa` + Gen2026 change | Source, deterministic and real DB tests, BMS/SEQ browser | Finite manual B2B cycle, allowance/stock, grace renewal/rollover, overlap rejection and new OWNER access exercised; checkout callbacks corrected. | [Audit](../../../docs/audits/GEN2026-2026-10-07.md) separates UI/persistence from mocked Stripe and disabled invitation transport. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [PARTNER-CREDITS](../../../docs/PARTNER-CREDITS.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md)
