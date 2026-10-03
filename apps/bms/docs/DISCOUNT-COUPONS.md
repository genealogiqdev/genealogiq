# Discount coupon management

> **Code:** [src/actions/discount-coupon.actions.ts](../src/actions/discount-coupon.actions.ts) · [src/queries/discount-coupons.ts](../src/queries/discount-coupons.ts) · [src/schemas/discount-coupon.schema.ts](../src/schemas/discount-coupon.schema.ts)
> **Entry points:** `/sales/discount-coupons` · `/sales/discount-coupons/new` · `/sales/discount-coupons/[id]`
> **Depends on:** [GENCODE-PACKAGES](GENCODE-PACKAGES.md) · [PARTNER-PLANS-CONTRACTS](PARTNER-PLANS-CONTRACTS.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-03 at `6e06634`, including this task’s uncommitted documentation, launcher and test changes. Source verification is separate from runtime/UI below.

The BMS application supplies discount coupon management. Coupons support percentage or currency-specific fixed amounts, expiry, usage and activation. The schema/SDK mapping determines the Stripe coupon; BMS mutations are privileged. Migration 20260825180000_coupon_tri_currency established the currency-specific shape.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/discount-coupon.actions.ts](../src/actions/discount-coupon.actions.ts) `createDiscountCoupon` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/schemas/discount-coupon.schema.ts](../src/schemas/discount-coupon.schema.ts) `getDiscountCouponSchema` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/queries/discount-coupons.ts](../src/queries/discount-coupons.ts) `getDiscountCoupons` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/discount-coupon.actions.ts](../src/actions/discount-coupon.actions.ts) | `createDiscountCoupon`, `updateDiscountCoupon`, `toggleDiscountCouponActive` | Authenticated mutation orchestration |
| [src/queries/discount-coupons.ts](../src/queries/discount-coupons.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/schemas/discount-coupon.schema.ts](../src/schemas/discount-coupon.schema.ts) | See exports/component in file | Input validation and defaults |

## Rules and why

A coupon must not be presented as valid for a currency with no configured amount. Tests pin permission and schema branches; actual Stripe creation belongs to integration verification. Origin not recorded.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

Coupons support percentage or currency-specific fixed amounts, expiry, usage and activation. The schema/SDK mapping determines the Stripe coupon; BMS mutations are privileged. Migration 20260825180000_coupon_tri_currency established the currency-specific shape.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `DiscountCoupon` | `discount_coupons` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/sales/discount-coupons` | [src/app/(protected)/sales/discount-coupons/page.tsx](../src/app/(protected)/sales/discount-coupons/page.tsx) |
| GET | `/sales/discount-coupons/new` | [src/app/(protected)/sales/discount-coupons/new/page.tsx](../src/app/(protected)/sales/discount-coupons/new/page.tsx) |
| GET | `/sales/discount-coupons/[id]` | [src/app/(protected)/sales/discount-coupons/[id]/page.tsx](../src/app/(protected)/sales/discount-coupons/[id]/page.tsx) |

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
| End-to-end / harness | `pnpm exec playwright test --project=public` | Verified local BMS launcher; installed Chromium | Local/free when prerequisites exist | BMS public sign-in/locale/404 only; it does not prove this feature |
| Offline evidence | `node scripts/check-docs.mjs` | Repository docs | Free, seconds | Paths, links, headings, metadata and indexes; it cannot verify pixels or business outcomes |
| Manual product QA | `node scripts/local-qa.mjs` → scenarios below | Local PostgreSQL, relevant app; Azurite for media; fixture Credentials identity | Local/free; real providers need test accounts | Visible result plus save/reload or independently checked persisted effect |

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/discount-coupon.actions.test.ts](../src/actions/discount-coupon.actions.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run BMS and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Create a disposable coupon through the form, save/reload and verify its amount/currency and Stripe test object. Requires a mocked/replay Stripe coupon fixture.
2. **Boundary:** Submit an invalid amount or use nonprivileged staff; expect form/action rejection and no coupon created.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: Requires a mocked/replay Stripe coupon fixture | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/bms/src/actions/discount-coupon.actions.ts apps/bms/src/queries/discount-coupons.ts apps/bms/src/schemas/discount-coupon.schema.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `DISCOUNT-COUPONS-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### DISCOUNT-COUPONS-G1: Legacy coupon E2E would call live Stripe without an isolated fixture

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** e2e CRUD specs reuse an existing server and create discount coupons; the isolated launcher disables Stripe.
- **Impact:** The current legacy CRUD command cannot establish safe coupon integration coverage.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Provide a test-mode Stripe fixture and constrain the E2E server/database before enabling this scenario.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [GENCODE-PACKAGES](GENCODE-PACKAGES.md) · [PARTNER-PLANS-CONTRACTS](PARTNER-PLANS-CONTRACTS.md)
