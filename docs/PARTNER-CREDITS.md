# Partner credit ledger, cycles and reconciliation

> **Code:** [packages/services/src/credits.ts](../packages/services/src/credits.ts) · [packages/services/src/partner-billing.ts](../packages/services/src/partner-billing.ts) · [packages/services/src/rollover.ts](../packages/services/src/rollover.ts) · [packages/services/src/gencode-package.ts](../packages/services/src/gencode-package.ts) · [packages/services/src/activation-trial.ts](../packages/services/src/activation-trial.ts) · [packages/services/src/reconciliation.ts](../packages/services/src/reconciliation.ts) · [packages/services/src/partner-lifecycle.ts](../packages/services/src/partner-lifecycle.ts) · [packages/services/src/partner-notifications.ts](../packages/services/src/partner-notifications.ts)
> **Entry points:** `BMS GET /api/cron/daily` · `BMS/SEQ POST /api/stripe/webhook` · `APP activateGenCode`
> **Depends on:** [EMAIL-DELIVERY](EMAIL-DELIVERY.md) · [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [CONFIGURATION](CONFIGURATION.md) · [TESTING](TESTING.md) · [OBSERVABILITY](OBSERVABILITY.md) · [RUNBOOKS](RUNBOOKS.md)
> **Last verified against code:** 2026-10-07 at `9253152` plus the Gen2026 changes to the paths named below. Source, tests, runtime and UI are recorded separately; earlier observations remain in the verification log.

This shared module supplies partner credit ledger, cycles and reconciliation. Grant balances, reservations and ledger events change transactionally under row locks. Idempotency keys are unique. HELD reservations consume availability; identified sales create a code-bound COMMITTED grant with its own twelve-month validity. TOPUP orders grant quantity plus bonus for twelve months. Cycle snapshot/rollover/grace rules are persisted, not recalculated from current plans.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [packages/services/src/credits.ts](../packages/services/src/credits.ts) `getCreditBalance` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [packages/services/src/credits.ts](../packages/services/src/credits.ts) `canActivate` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [packages/services/src/partner-notifications.ts](../packages/services/src/partner-notifications.ts) `noticeKey` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [packages/services/src/credits.ts](../packages/services/src/credits.ts) | `getCreditBalance`, `canActivate`, `reserveCreditForSale`, `consumeCreditForActivation` | Shared policy or integration implementation |
| [packages/services/src/partner-billing.ts](../packages/services/src/partner-billing.ts) | `applyPartnerInvoicePaid` | Shared policy or integration implementation |
| [packages/services/src/rollover.ts](../packages/services/src/rollover.ts) | `decideRollover` | Shared policy or integration implementation |
| [packages/services/src/gencode-package.ts](../packages/services/src/gencode-package.ts) | `fulfillGenCodePackageCheckout` | Shared policy or integration implementation |
| [packages/services/src/activation-trial.ts](../packages/services/src/activation-trial.ts) | `grantActivationTrial` | Shared policy or integration implementation |
| [packages/services/src/reconciliation.ts](../packages/services/src/reconciliation.ts) | See exports/component in file | Shared policy or integration implementation |
| [packages/services/src/partner-lifecycle.ts](../packages/services/src/partner-lifecycle.ts) | See exports/component in file | Shared policy or integration implementation |
| [packages/services/src/partner-notifications.ts](../packages/services/src/partner-notifications.ts) | See exports/component in file | Shared policy or integration implementation |

## Rules and why

344d52e established ledger ownership; ea6e3ca made paid invoice cycles explicit; 7f13c0a added capped first-generation rollover and grace. Rollover excludes committed credits. Reconciliation compares ledger sums, stored remainingQty, reservation scope and active code bindings; inspect every critical finding.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

### BMS manual settlement entry

`redeemManualCoupon` now opens [Gen2026 settlements](../apps/bms/docs/DISCOUNT-COUPONS.md) after privileged BMS confirmation. It calls `openPartnerCycle` for an annual plan or `grantGenCodeOrder` for a standalone package inside the same transaction as the coupon audit. These writers are also used by the existing Stripe paths; no separate allowance/rollover algorithm was introduced.

Annual settlement mints only the balance/stock delta, preserves current snapshots and committed credits, and disables automatic renewal. Renewal in a manual contract's grace window retains the existing rollover calculation. A package grants exactly its recorded quantity as TOPUP for 12 months and does not inherit annual rollover. Prior stock and ledger entries are retained.

The opt-in PostgreSQL suite independently expects 5 existing + 2 purchased = 7 codes; concurrent retries create one grant; a usage limit of one admits one competing transaction; an audit-insert failure rolls back all side effects. A 20-credit annual plan renewed under the 30% cap produces 6 rollover + 20 annual credits and 26 codes. This covers real locks/transactions on the manual path. Signed provider replay and the broader reservation/activation/reconciliation sequence in PARTNER-CREDITS-G1 remain open. See [TESTING](TESTING.md) and the [Gen2026 audit](audits/GEN2026-2026-10-07.md).

Grant balances, reservations and ledger events change transactionally under row locks. Idempotency keys are unique. HELD reservations consume availability; identified sales create a code-bound COMMITTED grant with its own twelve-month validity. TOPUP orders grant quantity plus bonus for twelve months. Cycle snapshot/rollover/grace rules are persisted, not recalculated from current plans.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `PartnerSubscription` | `partner_subscriptions` | [20260825233000_partner_plans_and_cycles](../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `SubscriptionCycle` | `subscription_cycles` | [20260825233000_partner_plans_and_cycles](../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `CreditGrant` | `credit_grants` | [20260826001000_credit_ledger_and_retire_sale](../packages/db/prisma/migrations/20260826001000_credit_ledger_and_retire_sale/migration.sql) |
| `CreditTransaction` | `credit_transactions` | [20260826001000_credit_ledger_and_retire_sale](../packages/db/prisma/migrations/20260826001000_credit_ledger_and_retire_sale/migration.sql) |
| `CreditReservation` | `credit_reservations` | [20260826001000_credit_ledger_and_retire_sale](../packages/db/prisma/migrations/20260826001000_credit_ledger_and_retire_sale/migration.sql) |
| `GenCodeOrder` | `gencode_orders` | [20260921000000_gencode_packages](../packages/db/prisma/migrations/20260921000000_gencode_packages/migration.sql) |
| `GenCode` | `gencodes` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `AppSale` | `app_sales` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| See handler | `BMS GET /api/cron/daily` | Entry description; scope/method varies by caller |
| See handler | `BMS/SEQ POST /api/stripe/webhook` | Entry description; scope/method varies by caller |
| See handler | `APP activateGenCode` | Entry description; scope/method varies by caller |

| Setting | Default | Validation / owner | Consequence |
| --- | --- | --- | --- |
| Shared settings | See [CONFIGURATION](CONFIGURATION.md) | Consumer modules resolve shared config rather than a feature-specific env schema | Restart/rebuild as documented |

## How to test it (AI-runnable)

Run commands from the repository root `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Install workspace dependencies first.

| Layer | Command | Needs | Cost | Proves |
| --- | --- | --- | --- | --- |
| Unit (deterministic) | `pnpm test` | Workspace install; root Vitest supplies an unreachable dummy DB URL | Free, seconds | Named deterministic helper/query/schema cases in the specs below |
| Contract / schema | `pnpm check:schema-parity` | Workspace install | Free, seconds | One canonical Prisma schema; feature input constraints are only proven when a schema spec is listed |
| Golden / replay | n/a: no complete recorded-provider replay fixture | Hand-authored recorded responses; cache misses must fail | Not run | Model regression is not applicable; provider/data drift remains an integration limit |
| End-to-end / harness | n/a: no feature-specific isolated browser harness | See prerequisites below | Local/free when prerequisites exist | Requires the described feature scenario |
| Offline evidence | `node scripts/check-docs.mjs` | Repository docs | Free, seconds | Paths, links, headings, metadata and indexes; it cannot verify pixels or business outcomes |
| Manual product QA | `node scripts/local-qa.mjs` → scenarios below | Local PostgreSQL, relevant app; Azurite for media; fixture Credentials identity | Local/free; real providers need test accounts | Visible result plus save/reload or independently checked persisted effect |

**Specs included in the successful 2026-10-03 full-suite run:** [packages/services/src/credits.test.ts](../packages/services/src/credits.test.ts) · [packages/services/src/partner-billing.test.ts](../packages/services/src/partner-billing.test.ts) · [packages/services/src/rollover.test.ts](../packages/services/src/rollover.test.ts) · [packages/services/src/gencode-package.test.ts](../packages/services/src/gencode-package.test.ts) · [packages/services/src/activation-trial.test.ts](../packages/services/src/activation-trial.test.ts) · [packages/services/src/partner-notifications.test.ts](../packages/services/src/partner-notifications.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run the caller app(s) and PostgreSQL; storage scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** On a disposable ledger dataset, grant twenty credits, reserve one, then activate; independently expect one reservation debit, one activation, and no duplicate event after replay. Requires a full ledger fixture beyond mocks.
2. **Boundary:** Attempt an exhausted/expired grant and repeat a paid invoice; expect no overdraw and no second entitlement cycle. Unit fixtures exercise these cases; full runtime replay remains unperformed.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: Requires a full ledger fixture beyond mocks | [Dated audit](audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- packages/services/src/credits.ts packages/services/src/partner-billing.ts packages/services/src/rollover.ts packages/services/src/gencode-package.ts packages/services/src/activation-trial.ts packages/services/src/reconciliation.ts packages/services/src/partner-lifecycle.ts packages/services/src/partner-notifications.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `PARTNER-CREDITS-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### PARTNER-CREDITS-G1: End-to-end ledger/reconciliation fixture missing

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** Unit suites mock transaction DB/provider boundaries; the daily route suite mocks all services. No full signed-event database replay is saved.
- **Impact:** Database locking races and cross-service reconciliation cannot be claimed from helper/action tests.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Provide a two-tenant transactional fixture and deterministic signed invoice/checkout replay, then compare raw ledger/grant/reservation sums.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |
| 2026-10-07 | `218d5aa` + Gen2026 change | Literal unit expectations and seven real PostgreSQL tests | Shared writers, old-stock preservation, renewal/rollover, concurrency, usage cap and atomic audit rollback verified; SEQ displayed funded stock. | [Audit](audits/GEN2026-2026-10-07.md); no signed provider or complete reconciliation replay claim. |

## Related

[LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [CONFIGURATION](CONFIGURATION.md) · [TESTING](TESTING.md) · [OBSERVABILITY](OBSERVABILITY.md) · [RUNBOOKS](RUNBOOKS.md) · [Audit](audits/AGENT-MEMORY-2026-10-03.md) · [EMAIL-DELIVERY](EMAIL-DELIVERY.md)
