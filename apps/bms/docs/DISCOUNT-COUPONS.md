# Discount coupon management

> **Code:** [src/actions/discount-coupon.actions.ts](../src/actions/discount-coupon.actions.ts) · [src/queries/discount-coupons.ts](../src/queries/discount-coupons.ts) · [src/schemas/discount-coupon.schema.ts](../src/schemas/discount-coupon.schema.ts) · [src/actions/manual-coupon.actions.ts](../src/actions/manual-coupon.actions.ts) · [manual-coupon service](../../../packages/services/src/manual-coupon.ts)
> **Entry points:** `/sales/discount-coupons` · `/sales/discount-coupons/new` · `/sales/discount-coupons/[id]` · `/sales/discount-coupons/redeem`
> **Depends on:** [GENCODE-PACKAGES](GENCODE-PACKAGES.md) · [PARTNER-PLANS-CONTRACTS](PARTNER-PLANS-CONTRACTS.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-07, `218d5aa` plus the Gen2026 implementation in this change. Source, tests, runtime and UI evidence are separated in the [Gen2026 audit](../../../docs/audits/GEN2026-2026-10-07.md).

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

### Manual settlement with Gen2026

The user chose **application by the BMS team after checking external payment or old stock**. `Gen2026` is an active, unrestricted 100% coupon with `redemptionMode=manual`, `duration=once`, no expiry and no usage cap. The migration and local seed provision it without creating a Stripe object. The displayed code retains `Gen2026`; code matching and duplicate checks are case-insensitive.

Only `verifyAdmin`-authorized BMS staff can load options/history or call `applyManualCoupon`. The action derives the operator from the session and plan currency from the locale; the browser cannot supply an actor, price or entitlement. The manual branch requires 100% and one use per sale and never calls a payment gateway. It also supports other manually created 100% coupons with product restrictions, expiry and usage limits. Stripe-mode coupons retain their existing provider workflow; a manual coupon cannot be passed to a Stripe checkout action.

| Sale | Recipient and result | Finite entitlement |
| --- | --- | --- |
| GenCode package | Active Tenant; PAID order with full recorded discount, zero due; one TOPUP grant and exactly the ordered number of new codes | 12 months; existing stock/credits remain; no rollover for this package grant |
| B2B subscription | Active Tenant; ACTIVE contract with `autoRenew=false`; cycle uses the shared snapshot, grant and stock-delta writer | 12 months; an ended manual contract can renew within its grace window using normal rollover; live/pending or Stripe-managed contracts block overlap |
| B2C subscription | Existing active APP_USER identified by email; active AppSale with zero value, no Stripe subscription and `cancelAtPeriodEnd=true` | Selected monthly term is one calendar month; annual term is the catalog's `termLength`; same manual plan extends from its paid-through date; any live Stripe or different plan blocks overlap |

Month-end arithmetic clamps to the destination month's last day. Coupon restrictions are the union of B2B plans, GenCode packages and B2C subscriptions; a restriction in another category must never become a global coupon. B2B/B2C prices must be active/current in the operator's currency. Packages use their stored currency. Unsynchronized products can be sold manually.

The operator supplies a unique sale/stock reference, selects `external_payment` or `legacy_stock`, and checks the confirmation box. External payment requires a positive amount with two decimal places; stock regularization records no new payment. This is staff confirmation, not automatic InfinitePay verification or an InfinitePay API integration. The catalog amount, full discount, zero amount due and separate externally received amount are recorded in currency units. Existing Stripe revenue reports are not a report of external receipts.

`CouponRedemption` and the entitlement commit in one transaction. Coupon and recipient row locks serialize usage caps and grants. A stable request UUID plus payload hash makes a retry return the original result; a different payload conflicts. A normalized source/reference pair is independently unique across coupons and operators. A failed audit insert rolls back the order/cycle/sale, grants, ledger and minted codes. The database enforces full-discount amounts, a unique durable `resultId` and matching result links. Account deletion may detach only a consumer AppSale; it retains the receipt, amount, usage count and original result identity, so it neither blocks account deletion nor permits reuse. Retain this audit and the existing ledger history.

After a partner settlement, BMS invokes the existing `provisionTenantAccess` process so a newly registered OWNER becomes active. A thrown invitation failure produces a successful-sale response with an explicit access follow-up and a link to Customers. It must not invite the operator to repeat the sale. Normal mail delivery still requires Resend; see [PARTNERS](PARTNERS.md) and [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) for the existing resend flow and provider limits.

## Contracts and data

Coupons support percentage or currency-specific fixed amounts, expiry, usage and activation. The schema/SDK mapping determines the Stripe coupon; BMS mutations are privileged. Migration 20260825180000_coupon_tri_currency established the currency-specific shape.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `DiscountCoupon` | `discount_coupons` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `CouponRedemption` | `coupon_redemptions` | [20261007000000_manual_coupon_redemptions](../../../packages/db/prisma/migrations/20261007000000_manual_coupon_redemptions/migration.sql); mode, B2C restrictions and Gen2026 provisioning are in the same migration |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/sales/discount-coupons` | [src/app/(protected)/sales/discount-coupons/page.tsx](../src/app/(protected)/sales/discount-coupons/page.tsx) |
| GET | `/sales/discount-coupons/new` | [src/app/(protected)/sales/discount-coupons/new/page.tsx](../src/app/(protected)/sales/discount-coupons/new/page.tsx) |
| GET | `/sales/discount-coupons/[id]` | [src/app/(protected)/sales/discount-coupons/[id]/page.tsx](../src/app/(protected)/sales/discount-coupons/[id]/page.tsx) |
| GET | `/sales/discount-coupons/redeem` | [src/app/(protected)/sales/discount-coupons/redeem/page.tsx](../src/app/(protected)/sales/discount-coupons/redeem/page.tsx) |

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

### Apply a confirmed external sale or old-stock allocation

1. Deploy the canonical migration before the application release. An already existing code matching Gen2026 is preserved; inspect its mode/terms before rollout. Do not silently overwrite an operator's coupon or leave an existing Stripe promotion active when intentionally migrating that code.
2. In **Vendas → Cupons de Desconto → Aplicar cupom de 100%**, select Gen2026, sale type, recipient and product. Existing package/contract sale forms also offer Gen2026 and prefill this review page.
3. Verify quantity and period, choose payment or stock, and enter the unique reference and actual amount received when applicable. Confirm only after checking the external receipt or old-stock allocation.
4. Expect immediate benefits and a history row with recipient, product, expiry, operator and values. Reload APP/SEQ to see the result. Use the same stock reference for retries; do not invent another receipt to bypass duplicate protection.
5. If the page reports an access-invitation follow-up, inspect the partner's OWNER in Customers and use the existing resend action after correcting mail configuration. If access activation itself failed, retry the original request or investigate the logged provisioning error; a new sale is not the repair.

### Repeat the isolated manual QA

After normal local schema/identity setup, run `pnpm exec tsx scripts/seed-coupon-qa.ts --run=20261007` with the loopback `genealogiq` database and the migration applied. It adds named fixtures without resetting previous redemptions. All fixture identities use the documented public local password. Start `node scripts/local-qa.mjs --port-offset=1000 --host=127.0.0.1` and use ports 4000/4001/4002. Use a new run suffix or new sale references when deliberately creating another sale.

Expect: stock tenant 5 + package quantity 2 = 7 codes and credits; a new B2B plan grants 20 for 12 months; a B2C year grants the configured 128 tree members until the same date next year. Reusing a reference and opening an overlapping B2B contract must fail without another row/grant. USER staff receives 403. The first-access OWNER is inactive before settlement, then can sign in with the fixture password. Mail is disabled, so the invitation warning is expected; actual delivery is n/a. The separate PostgreSQL suite in [TESTING](../../../docs/TESTING.md) exercises concurrent retries, limit races, renewal rollover and atomic rollback in a disposable database.

## Gaps and fixes

### DISCOUNT-COUPONS-G4: Audit foreign key would block consumer account deletion

- **Status:** fixed
- **Found:** 2026-10-07, final Gen2026 schema/lifecycle review.
- **Evidence:** APP account deletion cascades to AppSale; an initial restrictive audit-to-AppSale foreign key would reject that cascade.
- **Impact:** A customer with a manual coupon sale could not complete the existing account deletion flow.
- **Root cause:** Audit identity was coupled to the live sale foreign key instead of being stored durably in the receipt.
- **Resolution:** `resultId` is unique and retained permanently; the optional AppSale link uses `SetNull` on deletion. A real PostgreSQL regression deletes a disposable consumer, verifies its sale is removed while the audit and usage count survive, and rejects reuse of the receipt. The unit retry case still returns the original result without regranting. No account deletion policy or mail flow was changed.

### DISCOUNT-COUPONS-G3: A wide table displaced the application button

- **Status:** fixed
- **Found:** 2026-10-07, final Gen2026 browser capture.
- **Evidence:** At a roughly 1250px desktop viewport the unbounded BMS flex content expanded to the coupon table's minimum width, moving the new application button past the right edge.
- **Impact:** Staff had to scroll the whole page horizontally to reach the application action.
- **Root cause:** The protected layout's content flex item had no `min-w-0`, and the coupon heading/actions did not wrap as a group.
- **Resolution:** This change allows the BMS content to shrink, keeps wide-table scrolling inside the table, and wraps the coupon heading/actions. Final browser evidence and BMS rebuild are recorded in the Gen2026 audit.

### DISCOUNT-COUPONS-G2: Externally settled sales still depended on Stripe

- **Status:** fixed
- **Found:** 2026-10-07, Gen2026 source trace and user clarification.
- **Evidence:** Coupon creation mirrored Stripe; a 100% package checkout still required Stripe, B2B created recurring subscriptions, and BMS had no corresponding B2C release action.
- **Impact:** Confirmed external payments and old stock could not reliably release all three products without a new provider checkout.
- **Root cause:** Discounting was coupled to Stripe checkout rather than an independently authorized settlement.
- **Resolution:** This Gen2026 change adds the privileged manual transaction, audit and review flow. Regression expectations live in `manual-coupon.test.ts`, `manual-coupon.integration.test.ts` and `manual-coupon.actions.test.ts`. The dated audit records real PostgreSQL races/rollback and BMS/APP/SEQ happy and boundary cases; cloud deployment and gateway receipt verification are outside this run.

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
| 2026-10-07 | `218d5aa` + Gen2026 change | Source, deterministic tests, real PostgreSQL and normal Credentials/browser | Manual mode, all three products, stock preservation, duplicate reference, overlapping contract, non-admin 403, finite APP entitlement and new partner access exercised. | [Gen2026 audit](../../../docs/audits/GEN2026-2026-10-07.md) records separate evidence, exact counts and provider/deployment limits. Stripe replay gap G1 remains open. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [GENCODE-PACKAGES](GENCODE-PACKAGES.md) · [PARTNER-PLANS-CONTRACTS](PARTNER-PLANS-CONTRACTS.md)
