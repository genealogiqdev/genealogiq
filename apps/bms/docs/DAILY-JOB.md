# Daily partner lifecycle and reconciliation

> **Code:** [src/app/api/cron/daily/route.ts](../src/app/api/cron/daily/route.ts)
> **Entry points:** `/api/cron/daily`
> **Depends on:** [PARTNER-CREDITS](../../../docs/PARTNER-CREDITS.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [MEDIA-STORAGE](../../../docs/MEDIA-STORAGE.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-09 at `3826319` plus the consolidated release. Earlier source/runtime evidence remains in the verification log.

The BMS application supplies daily partner lifecycle and reconciliation. A configured CRON_SECRET is required; bearer mismatch returns 401, missing configuration returns 500. The handler runs lifecycle sweep, partner notices, trial notices, reconciliation and media-usage refresh independently via Promise.allSettled, then emits per-step results.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/app/api/cron/daily/route.ts](../src/app/api/cron/daily/route.ts) `GET` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/app/api/cron/daily/route.ts](../src/app/api/cron/daily/route.ts) `GET` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/app/api/cron/daily/route.ts](../src/app/api/cron/daily/route.ts) `GET` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/app/api/cron/daily/route.ts](../src/app/api/cron/daily/route.ts) | `GET` | HTTP entry and response handling |

## Rules and why

The outer ok=true means the batch responded; each step may still contain error. Inspect findings individually, especially critical ledger differences. Azure daily scheduling is 06:00 UTC in the deployment scripts; maxDuration is 300 seconds. The new route tests on 2026-10-03 pin fail-closed auth and independent execution after one failure.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

### Consolidated release, 2026-10-09

After the existing lifecycle/notification producers, the authenticated daily endpoint runs runEmailOutbox and reports sent, pending and canceled counts. Each step retains the existing independent failure handling. A retry batch contains at most 100 eligible rows; provider failure releases the lease and defers availability without repeating business actions. Partner renewal and non-Stripe consumer expiry producers queue durable messages before sending. The existing 06:00 UTC schedule is unchanged; no customer mail is triggered as a release smoke test.

A configured CRON_SECRET is required; bearer mismatch returns 401, missing configuration returns 500. The handler runs lifecycle sweep, partner notices, trial notices, reconciliation and media-usage refresh independently via Promise.allSettled, then emits per-step results.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `CreditGrant` | `credit_grants` | [20260826001000_credit_ledger_and_retire_sale](../../../packages/db/prisma/migrations/20260826001000_credit_ledger_and_retire_sale/migration.sql) |
| `SubscriptionCycle` | `subscription_cycles` | [20260825233000_partner_plans_and_cycles](../../../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `PartnerSubscription` | `partner_subscriptions` | [20260825233000_partner_plans_and_cycles](../../../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `AppSale` | `app_sales` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `GenCode` | `gencodes` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `CreditTransaction` | `credit_transactions` | [20260826001000_credit_ledger_and_retire_sale](../../../packages/db/prisma/migrations/20260826001000_credit_ledger_and_retire_sale/migration.sql) |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/api/cron/daily` | [src/app/api/cron/daily/route.ts](../src/app/api/cron/daily/route.ts) |

| Setting | Default | Validation / owner | Consequence |
| --- | --- | --- | --- |
| CRON_SECRET | absent | GET in route.ts | Missing configuration returns 500; wrong bearer returns 401. |

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

**Specs included in the successful 2026-10-03 full-suite run:** [src/app/api/cron/daily/route.test.ts](../src/app/api/cron/daily/route.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run BMS and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Run against a disposable seeded lifecycle database with a temporary CRON_SECRET and mocked mail/storage providers; expect all five result fields and independently checked ledger deltas. Requires a lifecycle fixture; local-qa leaves CRON_SECRET blank.
2. **Boundary:** Send an unsigned GET and expect 401 with no work; when configuration is missing expect 500. Route unit tests exercise both.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: Requires a lifecycle fixture; local-qa leaves CRON_SECRET blank | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/bms/src/app/api/cron/daily/route.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `DAILY-JOB-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### DAILY-JOB-G1: Complete daily lifecycle replay is absent

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** The route specs mock the five services; no complete expired-cycle/trial/storage fixture was exercised.
- **Impact:** A successful route response cannot prove every service or downstream row changed correctly.
- **Root cause:** Missing fixture or direct coverage as described above.
- **Resolution:** Not fixed in this task. Build an isolated expired-cycle dataset and provider replay, then verify per-step rows and reconciliation output.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |
| 2026-10-09 | `3826319` + consolidated release | Source, deterministic and local PostgreSQL checks | Updated contract above; [release audit](../../../docs/audits/PRODUCTION-RELEASE-2026-10-09.md) separates tests, runtime, deployment and cleanup. | Browser automation omitted at the user's request; production inbox delivery is not inferred. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [PARTNER-CREDITS](../../../docs/PARTNER-CREDITS.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [MEDIA-STORAGE](../../../docs/MEDIA-STORAGE.md)
