# Partner purchasing, annual plans and GenCode packages

> **Code:** [src/actions/partner-plan.actions.ts](../src/actions/partner-plan.actions.ts) · [src/actions/gencode-package.actions.ts](../src/actions/gencode-package.actions.ts) · [src/queries/purchasing.ts](../src/queries/purchasing.ts) · [src/app/api/stripe/webhook/route.ts](../src/app/api/stripe/webhook/route.ts)
> **Entry points:** `/purchasing/plans` · `/purchasing/packages` · `/api/stripe/webhook`
> **Depends on:** [PARTNER-CREDITS](../../../docs/PARTNER-CREDITS.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-14, starting at `58d4145` plus the standalone package change. Source, tests, runtime and UI limits are separated in the [package audit](../../../docs/audits/SEQ-GENCODE-PACKAGES-2026-10-14.md). Earlier evidence remains below.

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
| [src/actions/gencode-package.actions.ts](../src/actions/gencode-package.actions.ts) | `purchaseGenCodePackage` | Tenant-scoped one-time checkout; only quantity comes from the client |
| [src/schemas/gencode-package.schema.ts](../src/schemas/gencode-package.schema.ts) | `getGenCodePackagePurchaseSchema` | Integer quantity of at least 20 |
| [src/components/purchasing/gencode-package-store.tsx](../src/components/purchasing/gencode-package-store.tsx) | `GenCodePackageStore` | Quantity presets, custom quantity, automatic discount preview and payment feedback |
| [src/queries/purchasing.ts](../src/queries/purchasing.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/app/api/stripe/webhook/route.ts](../src/app/api/stripe/webhook/route.ts) | See exports/component in file | HTTP entry and response handling |

## Rules and why

One annual cycle spans twelve months even when paid in installments (ea6e3ca). 2c2ceb3 allows standalone package TOPUP purchases without a current annual contract. 2504132 removed the former digital-license/package navigation. The 2026-10-14 request adds a new standalone GenCode storefront at `/purchasing/packages`, beside the existing plan entry; the retired digital-license screens and quotas remain historical.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

### Standalone packages in Sequoia, 2026-10-14

The sidebar shows **Pacotes de GenCodes** directly after **Assinar um plano**. The store reads the active `GENCODE_VIRTUAL_BRL` catalog entry, using its BRL unit price and a minimum of at least 20. Presets choose 20 or 50 units; any valid integer above the minimum can be entered. The requested example explicitly totals 50 units at R$6,750, so the 10% discount starts **at 50**, inclusively.

| Quantity | Gross unit price | Automatic discount | Net unit price | Total |
| --- | --- | --- | --- | --- |
| 20 | R$150.00 | None | R$150.00 | R$3,000.00 |
| 49 | R$150.00 | None | R$150.00 | R$7,350.00 |
| 50 | R$150.00 | 10% / R$750.00 | R$135.00 | R$6,750.00 |
| 51 | R$150.00 | 10% / R$765.00 | R$135.00 | R$6,885.00 |

[The shared quote](../../../packages/core/src/gencode-package.ts) calculates in integer cents. A later catalog price is used for new purchases only; order quantity, gross unit price, discount and net total remain snapshots. All three interface languages retain BRL, without currency conversion. Inactive/missing products are unavailable; missing Stripe product/price IDs keep the preview visible and disable purchase.

`purchaseGenCodePackage` validates quantity and derives the product, tenant and operator on the server. It follows the existing tenant-membership policy, including a fresh active-tenant check in the shared checkout service; PARTNER-PURCHASING-G1 remains open. Client-supplied price, tenant, coupon or product identifiers are not used. The shared service also rejects other BMS catalog entries, explicit coupon IDs, fractional/under-minimum quantities and amounts above Stripe's eight-digit limit for self-service.

At 50 or more, [openGenCodePackageCheckout](../../../packages/services/src/gencode-package.ts) snapshots `discountCode=GENCODES10`, then creates a 10% Stripe coupon scoped to the product, one redemption and the checkout's 23-hour expiry. Its request is keyed by order ID. The coupon is applied automatically; no reusable public promotion code or BMS manual `CouponRedemption` is created, and discounts cannot stack. BMS's separately selected coupon behavior is unchanged. Provider failure returns useful feedback and removes any newly created pending order; it never grants credits.

The SEQ webhook now admits its own package completion, asynchronous success/failure and expiry events. It checks the real Stripe signature and `origin=seq` before using the shared fulfillment writer. Payment success atomically records PAID, one 12-month TOPUP grant, exactly the ordered number of GenCodes and one email-outbox receipt. Replays do not mint again. A redirect only reports that confirmation is pending and never grants anything. The tenant's history includes its BMS and SEQ package orders, recorded discounts/totals, payment status and credit expiry. Expired unpaid links are derived from the saved expiry timestamp without changing paid orders.

### Consolidated release, 2026-10-09

The SEQ signed webhook now handles partner invoice payment failures by queuing a scoped notice without opening a cycle or provisioning access. Successful package/invoice receipts and email retry use the shared services and live partner checks. Origin and product metadata still exclude events from other applications from the SEQ fulfilment branch. Full signed-provider/browser replay remains the existing integration gap.

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
| GET | `/purchasing/packages` | [src/app/(protected)/purchasing/packages/page.tsx](../src/app/(protected)/purchasing/packages/page.tsx) |
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

**Package coverage added 2026-10-14:** [action](../src/actions/gencode-package.actions.test.ts), [queries](../src/queries/purchasing.test.ts), [interactive component](../src/components/purchasing/gencode-package-store.test.tsx), [signed route](../src/app/api/stripe/webhook/route.test.ts), [pricing](../../../packages/core/src/gencode-package.test.ts), [shared checkout](../../../packages/services/src/gencode-package.test.ts) and [PostgreSQL integration](../../../packages/services/src/gencode-package.integration.test.ts). The integration uses only a disposable loopback `genealogiq_coupon_qa_*` database through `GENCODE_PACKAGE_TEST_DATABASE_URL`; Stripe transport is synthetic and no email is sent. See [TESTING](../../../docs/TESTING.md) for setup.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run SEQ and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

For packages, use 20 → 50 → 51 → 49 and independently expect R$3,000 → R$6,750 → R$6,885 → R$7,350. The discount must disappear at 49. Empty, fractional and 19-unit input must block purchase. With the ordinary provider-disabled launcher, buying 20/50 returns the payment-unavailable message and creates no order. Reload and verify the tenant's unchanged history. Anonymous navigation must return to sign-in.

With a separately authorized Stripe test fixture, complete payment for 50, verify one PAID order for R$6,750, 50 codes, 50 TOPUP credits and one receipt; replay the event and expect no additional grant. An unpaid/expired session must not grant. Browser/signed-provider completion remains n/a until those prerequisites exist.

The existing annual-plan scenarios remain:

1. **Happy path:** Open /purchasing/plans as local tenant staff, choose a disposable test plan and complete signed Stripe replay; verify the cycle/price snapshot and balance. Requires Stripe fixtures.
2. **Boundary:** Reject an inactive/missing plan or invalid payment cadence; duplicate invoice replay must leave one cycle. The current action allows any verified tenant staff, as recorded below.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: Requires Stripe fixtures | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |
| 2026-10-14, `58d4145` + package change | SEQ launcher on 3002; normal Credentials HTTP login; separate disposable PostgreSQL schema | HTTP render/reload contained both offers/history; 19 rejected; 20/50 provider-disabled attempts left orders unchanged. Real DB tests recorded R$6,750 and exactly 50 credits once. | Runtime/DB pass; Chrome UI and real Stripe/inbox n/a. | [Package audit](../../../docs/audits/SEQ-GENCODE-PACKAGES-2026-10-14.md) |

## Runbooks

### Enable the package storefront

1. Keep the existing canonical BRL package active, with the intended R$150 unit price and minimum 20. Synchronize its product and price through the BMS catalog; this feature does not rewrite existing catalog data or call Stripe during deployment.
2. Configure the SEQ Stripe key and signing secret. The key must permit Checkout and coupon creation. The SEQ webhook subscription must include `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired` in addition to the existing annual-plan events.
3. Verify the 20/50 test-payment amounts and the shared order/credit/outbox rows. Return URLs use the configured `SEQUOIA_URL` and `/purchasing/packages`. No billing provider or production configuration was changed in this code task.

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
- **2026-10-14 partial coverage:** Package actions, tenant-scoped reads and all four package webhook events now have direct specs, including real verification of locally signed payloads. A disposable PostgreSQL replay verifies 50-credit idempotence and price snapshots with a synthetic Stripe transport. Real Stripe Checkout/browser replay, annual cash/installment replay and inbox delivery remain prerequisites; Chrome returned `Codex auth token is unavailable` during this audit.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |
| 2026-10-07 | `218d5aa` + Gen2026 change | Source trace, BMS/SEQ browser and raw DB rows | Manual contract history, 20 available codes, tenant-specific balances and first-access activation verified. | [Audit](../../../docs/audits/GEN2026-2026-10-07.md); the existing self-service role and signed replay gaps remain open. |
| 2026-10-09 | `3826319` + consolidated release | Source, deterministic and local PostgreSQL checks | Updated contract above; [release audit](../../../docs/audits/PRODUCTION-RELEASE-2026-10-09.md) separates tests, runtime, deployment and cleanup. | Browser automation omitted at the user's request; production inbox delivery is not inferred. |
| 2026-10-14 | `58d4145` + standalone package change | Source, 72 focused tests, four PostgreSQL cases and authenticated HTTP | Sidebar/store, 20/50 pricing, automatic coupon, scoped history, payment failure and one-time credit fulfillment verified. | [Package audit](../../../docs/audits/SEQ-GENCODE-PACKAGES-2026-10-14.md) records broad checks and cleanup; Chrome/live Stripe/inbox remain n/a. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [PARTNER-CREDITS](../../../docs/PARTNER-CREDITS.md)
