# Tenant consumers, categories and memorial records

> **Code:** [src/actions/customer.actions.ts](../src/actions/customer.actions.ts) · [src/actions/customer-category.actions.ts](../src/actions/customer-category.actions.ts) · [src/actions/deceased.actions.ts](../src/actions/deceased.actions.ts) · [src/queries/customers.ts](../src/queries/customers.ts) · [src/queries/deceased.ts](../src/queries/deceased.ts) · [src/queries/customer-categories.ts](../src/queries/customer-categories.ts)
> **Entry points:** `/customers` · `/customers/new` · `/customers/[id]` · `/categories/customers` · `/categories/customers/new` · `/categories/customers/[id]` · `/memorialized/[id]`
> **Depends on:** [AUTHENTICATION](../../../docs/AUTHENTICATION.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-03 at `6e06634`, including this task’s uncommitted documentation, launcher and test changes. Source verification is separate from runtime/UI below.

The SEQ application supplies tenant consumers, categories and memorial records. Tenant-owned consumer rows use AppUser.tenantId and are AppUser records, separate from BMS Tenant partners. Category and memorial forms use Zod schemas and scoped DAL access. Human death/birth/location fields and guardian links follow the AppUser model.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/customer.actions.ts](../src/actions/customer.actions.ts) `createCustomer` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/actions/customer.actions.ts](../src/actions/customer.actions.ts) `updateCustomer` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/queries/customers.ts](../src/queries/customers.ts) `getCustomers` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/customer.actions.ts](../src/actions/customer.actions.ts) | `createCustomer`, `updateCustomer` | Authenticated mutation orchestration |
| [src/actions/customer-category.actions.ts](../src/actions/customer-category.actions.ts) | See exports/component in file | Authenticated mutation orchestration |
| [src/actions/deceased.actions.ts](../src/actions/deceased.actions.ts) | `updateDeceased`, `addGuardian` | Authenticated mutation orchestration |
| [src/queries/customers.ts](../src/queries/customers.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/queries/deceased.ts](../src/queries/deceased.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/queries/customer-categories.ts](../src/queries/customer-categories.ts) | See exports/component in file | Scoped data reads and output shaping |

## Rules and why

Use customerId from the verified tenant session for every consumer/category query. The action suites pin role, input and ownership boundaries; preserving typed memorials avoids reviving digital-license paths removed in 2504132.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

Tenant-owned consumer rows use AppUser.tenantId and are AppUser records, separate from BMS Tenant partners. Category and memorial forms use Zod schemas and scoped DAL access. Human death/birth/location fields and guardian links follow the AppUser model.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `AppUser` | `app_users` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `AppUserCategory` | `app_user_categories` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `AppUserGuardian` | `app_user_guardians` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `Address` | `addresses` | [20260403000000_expand_schema_address_categories](../../../packages/db/prisma/migrations/20260403000000_expand_schema_address_categories/migration.sql) |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/customers` | [src/app/(protected)/(records)/customers/page.tsx](../src/app/(protected)/(records)/customers/page.tsx) |
| GET | `/customers/new` | [src/app/(protected)/(records)/customers/new/page.tsx](../src/app/(protected)/(records)/customers/new/page.tsx) |
| GET | `/customers/[id]` | [src/app/(protected)/(records)/customers/[id]/page.tsx](../src/app/(protected)/(records)/customers/[id]/page.tsx) |
| GET | `/categories/customers` | [src/app/(protected)/(records)/categories/customers/page.tsx](../src/app/(protected)/(records)/categories/customers/page.tsx) |
| GET | `/categories/customers/new` | [src/app/(protected)/(records)/categories/customers/new/page.tsx](../src/app/(protected)/(records)/categories/customers/new/page.tsx) |
| GET | `/categories/customers/[id]` | [src/app/(protected)/(records)/categories/customers/[id]/page.tsx](../src/app/(protected)/(records)/categories/customers/[id]/page.tsx) |
| GET | `/memorialized/[id]` | [src/app/(protected)/(records)/memorialized/[id]/page.tsx](../src/app/(protected)/(records)/memorialized/[id]/page.tsx) |

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

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/customer.actions.test.ts](../src/actions/customer.actions.test.ts) · [src/actions/customer-category.actions.test.ts](../src/actions/customer-category.actions.test.ts) · [src/actions/deceased.actions.test.ts](../src/actions/deceased.actions.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run SEQ and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Create a synthetic consumer/category in the local tenant, save/reload and compare AppUser.tenantId and category relation; edit a memorial and verify guardian linkage. Requires disposable records.
2. **Boundary:** A different tenant must not read/update the record by URL; invalid dates must reject without a row change. Requires second tenant fixture.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: Requires disposable records; Requires second tenant fixture | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/seq/src/actions/customer.actions.ts apps/seq/src/actions/customer-category.actions.ts apps/seq/src/actions/deceased.actions.ts apps/seq/src/queries/customers.ts apps/seq/src/queries/deceased.ts apps/seq/src/queries/customer-categories.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `CUSTOMERS-MEMORIALS-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### CUSTOMERS-MEMORIALS-G1: Consumer creation mail and cross-tenant browser fixture missing

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** Unit actions use mocked DB/email; the company baseline does not exercise consumer invitations or second-tenant IDs.
- **Impact:** A successful local company edit is not proof of customer or memorial isolation.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Add disposable consumer/invitation and two-tenant fixtures, then exercise save/reload and forbidden access.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [AUTHENTICATION](../../../docs/AUTHENTICATION.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md)
