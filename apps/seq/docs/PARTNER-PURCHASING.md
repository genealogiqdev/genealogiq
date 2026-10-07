# Partner purchasing and annual subscription

> **Code:** [src/actions/partner-plan.actions.ts](../src/actions/partner-plan.actions.ts) · [src/queries/purchasing.ts](../src/queries/purchasing.ts) · [src/app/api/stripe/webhook/route.ts](../src/app/api/stripe/webhook/route.ts)
> **Entry points:** `/purchasing/plans` · `/api/stripe/webhook`
> **Depends on:** [PARTNER-CREDITS](../../../docs/PARTNER-CREDITS.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-07 at `9253152` plus the Gen2026 changes to the paths named below. Source, tests, runtime and UI are recorded separately; earlier observations remain in the verification log.

The SEQ application supplies partner purchasing and annual subscription. The verified tenant selects an effective plan price and cash/installment payment mode; shared checkout supplies Stripe metadata. Annual plans and standalone package orders have separate entitlement contracts. Webhook events use the shared services, not browser redirects, to grant credits.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/partner-plan.actions.ts](../src/actions/partner-plan.actions.ts) `subscribeToPartnerPlan` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/actions/partner-plan.actions.ts](../src/actions/partner-plan.actions.ts) `subscribeToPartnerPlan` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/queries/purchasing.ts](../src/queries/purchasing.ts) `getPlanOrders` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/partner-plan.actions.ts](../src/actions/partner-plan.actions.ts) | `subscribeToPartnerPlan` | Authenticated mutation orchestration |
| [src/queries/purchasing.ts](../src/queries/purchasing.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/app/api/stripe/webhook/route.ts](../src/app/api/stripe/webhook/route.ts) | See exports/component in file | HTTP entry and response handling |

## Rules and why

One annual cycle spans twelve months even when paid in installments (ea6e3ca). 2c2ceb3 allows standalone package TOPUP purchases without a current annual contract. Do not reinstate the removed digital license/package navigation from 2504132.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

### Plans activated by the BMS team

[Manual Gen2026 settlements](../../bms/docs/DISCOUNT-COUPONS.md) enter the same PartnerSubscription/cycle/credit models read by SEQ. A manually settled annual contract appears active with its finite end date in `/purchasing/plans`, and the resulting funded stock appears in `/inventory/activations`. It has no Stripe subscription and `autoRenew=false`. Only BMS staff can apply the coupon; SEQ does not expose manual redemption. The existing self-service plan catalog still requires Stripe synchronization, so an unsynchronized manual plan can appear in acquisition history without becoming a self-service offer.

Local acceptance signed in as the funded partner and saw the active 07/10/2026–07/10/2027 acquisition and 20 available GenCodes. A separately inactive first-access OWNER could not sign in before BMS settlement, then signed in normally and saw its own 20 codes afterward. SQL independently verified the tenant balances and disabled automatic renewal. See the [Gen2026 audit](../../../docs/audits/GEN2026-2026-10-07.md); no signed Stripe checkout replay was run.

The verified tenant selects an effective plan price and cash/installment payment mode; shared checkout supplies Stripe metadata. Annual plans and standalone package orders have separate entitlement contracts. Webhook events use the shared services, not browser redirects, to grant credits.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `PartnerPlan` | `partner_plans` | [20260825233000_partner_plans_and_cycles](../../../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `PlanPrice` | `plan_prices` | [20260825233000_partner_plans_and_cycles](../../../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `PartnerSubscription` | `partner_subscriptions` | [20260825233000_partner_plans_and_cycles](../../../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `SubscriptionCycle` | `subscription_cycles` | [20260825233000_partner_plans_and_cycles](../../../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `GenCodePackage` | `gencode_packages` | [20260921000000_gencode_packages](../../../packages/db/prisma/migrations/20260921000000_gencode_packages/migration.sql) |
| `GenCodeOrder` | `gencode_orders` | [20260921000000_gencode_packages](../../../packages/db/prisma/migrations/20260921000000_gencode_packages/migration.sql) |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/purchasing/plans` | [src/app/(protected)/purchasing/plans/page.tsx](../src/app/(protected)/purchasing/plans/page.tsx) |
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

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/partner-plan.actions.test.ts](../src/actions/partner-plan.actions.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run SEQ and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Open /purchasing/plans as local tenant staff, choose a disposable test plan and complete signed Stripe replay; verify the cycle/price snapshot and balance. Requires Stripe fixtures.
2. **Boundary:** Reject an inactive/missing plan or invalid payment cadence; duplicate invoice replay must leave one cycle. The current action allows any verified tenant staff, as recorded below.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: Requires Stripe fixtures | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/seq/src/actions/partner-plan.actions.ts apps/seq/src/queries/purchasing.ts apps/seq/src/app/api/stripe/webhook/route.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `PARTNER-PURCHASING-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### PARTNER-PURCHASING-G1: Tenant purchasing is not admin-only

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** subscribeToPartnerPlan calls verifyTenantSession and never verifyAdmin; the page also only verifies tenant membership.
- **Impact:** Any signed-in tenant staff can initiate checkout, despite the older commercial documentation claiming OWNER/ADMIN only.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Decide the intended purchase role policy and align the action/page/docs; add a non-admin role fixture.

### PARTNER-PURCHASING-G2: SEQ webhook and signed purchase replay lack direct coverage

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** The new action spec pins session-derived tenant, lowercase brl currency, callback URLs and invalid cadence/auth rejection. SEQ webhook routing and signed full-path replay remain untested.
- **Impact:** Tenant/currency checkout arguments and SEQ webhook routing can regress independently.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Add mocked action/webhook specs and signed cash/installment replay fixtures before marking purchase integration verified.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |
| 2026-10-07 | `218d5aa` + Gen2026 change | Source trace, BMS/SEQ browser and raw DB rows | Manual contract history, 20 available codes, tenant-specific balances and first-access activation verified. | [Audit](../../../docs/audits/GEN2026-2026-10-07.md); the existing self-service role and signed replay gaps remain open. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [PARTNER-CREDITS](../../../docs/PARTNER-CREDITS.md)
