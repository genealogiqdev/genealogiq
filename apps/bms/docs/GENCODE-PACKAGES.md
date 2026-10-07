# Standalone GenCode package sales

> **Code:** [src/actions/gencode-package.actions.ts](../src/actions/gencode-package.actions.ts) · [src/queries/gencode-packages.ts](../src/queries/gencode-packages.ts) · [src/schemas/gencode-package.schema.ts](../src/schemas/gencode-package.schema.ts)
> **Entry points:** `/gencodes` · `/gencodes/new` · `/payment/gencodes`
> **Depends on:** [PARTNER-CREDITS](../../../docs/PARTNER-CREDITS.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-07 at `2632307` for the immediate partner onboarding change. Source, tests, local runtime/UI and deployment evidence are separated in the onboarding audit linked below; earlier verification history is preserved.

The BMS application supplies standalone gencode package sales. Package inputs validate quantities and currency prices; the send action obtains the package and active partner before shared checkout. The shared order stores bought quantity, bonus, price and trial snapshots and fulfillment state.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/gencode-package.actions.ts](../src/actions/gencode-package.actions.ts) `syncGenCodePackageWithStripe` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/schemas/gencode-package.schema.ts](../src/schemas/gencode-package.schema.ts) `getGenCodePackageOrderSchema` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/queries/gencode-packages.ts](../src/queries/gencode-packages.ts) `getGenCodePackages` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/gencode-package.actions.ts](../src/actions/gencode-package.actions.ts) | `syncGenCodePackageWithStripe`, `sendGenCodePackageLink` | Authenticated mutation orchestration |
| [src/queries/gencode-packages.ts](../src/queries/gencode-packages.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/schemas/gencode-package.schema.ts](../src/schemas/gencode-package.schema.ts) | See exports/component in file | Input validation and defaults |

## Rules and why

2c2ceb3 added standalone package purchasing: an active partner may buy without an annual contract. A package produces TOPUP credits for twelve months and minted codes; duplicate Stripe fulfillment must not mint twice (gencode-package.test.ts). Checkout lifetime is 23 hours in gencode-package.ts.

`sendGenCodePackageLink` opens the Stripe checkout before sending its email.
A missing Resend key can therefore report a link-generation failure after the
checkout step has run. Identify the serving origin/revision before retrying;
the local QA launcher disables mail even with a populated BMS `.env`. The
[email runbook](../../../docs/EMAIL-DELIVERY.md#diagnose-and-refresh-a-deployed-resend-credential)
separates missing runtime configuration, provider rejection and actual delivery.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

New partners can receive an initial allowance directly at [registration](PARTNERS.md), without this package-sale workflow. These grants have no GenCodeOrder and do not count as package sales. Purchase fulfillment still activates legacy inactive OWNERs; newly registered active OWNERs keep their existing credentials.

### Full discount after external payment or old-stock confirmation

`Gen2026` is applied through the [manual coupon workflow](DISCOUNT-COUPONS.md). `/gencodes/new` offers active products without Stripe IDs for this mode, previews quantity × unit price with a full discount, then passes the selected tenant/package/quantity to the final BMS review. The existing paid Stripe-link path still requires synchronization.

The authorized transaction creates a PAID order with its catalog unit-price snapshot, full `discountAmount`, `totalAmount=0`, paid time and 12-month credit expiry. `grantGenCodeOrder` is the shared fulfillment writer for this path and Stripe fulfillment: one TOPUP grant, one idempotent GRANT ledger row and exactly the purchased number of codes. Package grants remain outside annual rollover. Existing stock is preserved; old-stock regularization allocates the entered quantity in addition to existing units, rather than deleting/recreating stock. `CouponRedemption` records the confirmed source, unique reference, actual external amount (if any), operator and result atomically. New partner access is provisioned after settlement; invitation errors cannot turn the committed sale into a failed sale.

Local acceptance uses the [coupon fixture](../../../scripts/seed-coupon-qa.ts): the stock customer starts with five codes/credits, applies quantity two at R$50 (R$100 discount, zero due), and ends with seven. A duplicate reference must leave that result unchanged. The normal order form was also checked with quantity three and preserved that value on the review page without committing a second order. Test/provider distinctions and cleanup are recorded in the [Gen2026 audit](../../../docs/audits/GEN2026-2026-10-07.md).

Package inputs validate quantities and currency prices; the send action obtains the package and active partner before shared checkout. The shared order stores bought quantity, bonus, price and trial snapshots and fulfillment state.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `GenCodePackage` | `gencode_packages` | [20260921000000_gencode_packages](../../../packages/db/prisma/migrations/20260921000000_gencode_packages/migration.sql) |
| `GenCodeOrder` | `gencode_orders` | [20260921000000_gencode_packages](../../../packages/db/prisma/migrations/20260921000000_gencode_packages/migration.sql) |
| `Tenant` | `tenants` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `CreditGrant` | `credit_grants` | [20260826001000_credit_ledger_and_retire_sale](../../../packages/db/prisma/migrations/20260826001000_credit_ledger_and_retire_sale/migration.sql) |
| `GenCode` | `gencodes` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/gencodes` | [src/app/(protected)/gencodes/page.tsx](../src/app/(protected)/gencodes/page.tsx) |
| GET | `/gencodes/new` | [src/app/(protected)/gencodes/new/page.tsx](../src/app/(protected)/gencodes/new/page.tsx) |
| GET | `/payment/gencodes` | [src/app/(landingpage)/payment/gencodes/page.tsx](../src/app/(landingpage)/payment/gencodes/page.tsx) |

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

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/gencode-package.actions.test.ts](../src/actions/gencode-package.actions.test.ts) · [src/schemas/gencode-package.schema.test.ts](../src/schemas/gencode-package.schema.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run BMS and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** For a synthetic active partner without a contract, create a package link and complete Stripe test payment; verify PAID order, one TOPUP grant and quantity plus bonus minted codes. Requires Stripe test fixtures.
2. **Boundary:** Repeat the checkout-completed event and verify unchanged row counts; an inactive partner must receive rejection.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: Requires Stripe test fixtures | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/bms/src/actions/gencode-package.actions.ts apps/bms/src/queries/gencode-packages.ts apps/bms/src/schemas/gencode-package.schema.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `GENCODE-PACKAGES-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### GENCODE-PACKAGES-G1: Package checkout has no signed full-path replay fixture

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** Action/schema and shared service specs exist; the audit did not create a checkout or deliver a package email.
- **Impact:** Webhook signature, Stripe metadata and email delivery are not proven by unit results.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Record signed test events and known order/grant/code expectations; a replay cache miss must fail.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |
| 2026-10-07 | `218d5aa` + Gen2026 change | Source, tests, PostgreSQL and BMS browser | Shared fulfillment retained; real manual order gave 5 + 2 = 7 stock/credits, duplicate rejected, order-form prefill verified. | [Audit](../../../docs/audits/GEN2026-2026-10-07.md); signed Stripe checkout/mail replay remains outside this evidence. |
| 2026-10-07 | Source `218d5aa`; existing Azure BMS image `6e06634a752b44bce24825b0aa25baf0b669fa16`; refreshed revision `resend-20261007` | Source trace, Azure CLI/container and local browser | Rechecked route/admin/schema/tenant/checkout/email boundaries. BMS Resend reference reapplied and new revision healthy with 100% traffic. All three deployed apps returned live/ready HTTP 200; 840 unit tests passed. Local BMS company save/reload, SQL persistence, restoration and anonymous redirect passed on port 3101. | Full checkout/email/webhook scenario n/a: no authorized message or payment generated. Screenshot origin unanswered. Local APP/SEQ baseline interrupted by dependency-resolution failures during concurrent workspace changes. [Audit](../../../docs/audits/RESEND-BMS-2026-10-07.md). |
| 2026-10-07 | `2632307` | Source, deterministic tests, local PostgreSQL and browser | Registration allowances have no package order; existing package fulfillment preserved; 927 deterministic and four enabled onboarding integration tests passed. | [Audit](../../../docs/audits/PARTNER-ONBOARDING-2026-10-07.md); production inbox delivery remains unverified. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [PARTNER-CREDITS](../../../docs/PARTNER-CREDITS.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md)
