# Tenant suppliers and categories

> **Code:** [src/actions/supplier.actions.ts](../src/actions/supplier.actions.ts) · [src/actions/supplier-category.actions.ts](../src/actions/supplier-category.actions.ts) · [src/queries/suppliers.ts](../src/queries/suppliers.ts) · [src/queries/supplier-categories.ts](../src/queries/supplier-categories.ts) · [src/schemas/supplier.schema.ts](../src/schemas/supplier.schema.ts)
> **Entry points:** `/suppliers` · `/suppliers/new` · `/suppliers/[id]` · `/categories/suppliers` · `/categories/suppliers/new` · `/categories/suppliers/[id]`
> **Depends on:** [AUTHENTICATION](../../../docs/AUTHENTICATION.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-03 at `6e06634`, including this task’s uncommitted documentation, launcher and test changes. Source verification is separate from runtime/UI below.

The SEQ application supplies tenant suppliers and categories. Supplier fields support company/person identity and tenant-scoped category/address relations. The current Prisma model retains both global taxId @unique and @@unique([tenantId, taxId]). The historical [consolidation record](../../../docs/PHASE-4-DB-CONSOLIDATION.md) explicitly retained both after introspection; the per-tenant index does not remove global uniqueness. Tenant module flags control access to the optional supplier records.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/supplier.actions.ts](../src/actions/supplier.actions.ts) `createSupplier` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/schemas/supplier.schema.ts](../src/schemas/supplier.schema.ts) `getSupplierSchema` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/queries/suppliers.ts](../src/queries/suppliers.ts) `getSuppliers` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/supplier.actions.ts](../src/actions/supplier.actions.ts) | `createSupplier`, `updateSupplier` | Authenticated mutation orchestration |
| [src/actions/supplier-category.actions.ts](../src/actions/supplier-category.actions.ts) | `createSupplierCategory`, `updateSupplierCategory` | Authenticated mutation orchestration |
| [src/queries/suppliers.ts](../src/queries/suppliers.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/queries/supplier-categories.ts](../src/queries/supplier-categories.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/schemas/supplier.schema.ts](../src/schemas/supplier.schema.ts) | See exports/component in file | Input validation and defaults |

## Rules and why

Always pair supplied record/category IDs with verified tenant scope. The present model retains global taxId uniqueness even though a migration also adds a tenant index; do not describe the contract as tenant-only. supplier.actions.test.ts pins selected action/permission cases. The [consolidation record](../../../docs/PHASE-4-DB-CONSOLIDATION.md) explicitly chose to keep both constraints to preserve the introspected database; a business rationale for global uniqueness is not recorded.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

Supplier fields support company/person identity and tenant-scoped category/address relations. The current Prisma model retains both global taxId @unique and @@unique([tenantId, taxId]). The historical [consolidation record](../../../docs/PHASE-4-DB-CONSOLIDATION.md) explicitly retained both after introspection; the per-tenant index does not remove global uniqueness. Tenant module flags control access to the optional supplier records.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `Supplier` | `suppliers` | [20260331160225_add_supplier_model](../../../packages/db/prisma/migrations/20260331160225_add_supplier_model/migration.sql) |
| `SupplierCategory` | `supplier_categories` | [20260403000000_expand_schema_address_categories](../../../packages/db/prisma/migrations/20260403000000_expand_schema_address_categories/migration.sql) |
| `Tenant` | `tenants` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `Address` | `addresses` | [20260403000000_expand_schema_address_categories](../../../packages/db/prisma/migrations/20260403000000_expand_schema_address_categories/migration.sql) |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/suppliers` | [src/app/(protected)/(records)/suppliers/page.tsx](../src/app/(protected)/(records)/suppliers/page.tsx) |
| GET | `/suppliers/new` | [src/app/(protected)/(records)/suppliers/new/page.tsx](../src/app/(protected)/(records)/suppliers/new/page.tsx) |
| GET | `/suppliers/[id]` | [src/app/(protected)/(records)/suppliers/[id]/page.tsx](../src/app/(protected)/(records)/suppliers/[id]/page.tsx) |
| GET | `/categories/suppliers` | [src/app/(protected)/(records)/categories/suppliers/page.tsx](../src/app/(protected)/(records)/categories/suppliers/page.tsx) |
| GET | `/categories/suppliers/new` | [src/app/(protected)/(records)/categories/suppliers/new/page.tsx](../src/app/(protected)/(records)/categories/suppliers/new/page.tsx) |
| GET | `/categories/suppliers/[id]` | [src/app/(protected)/(records)/categories/suppliers/[id]/page.tsx](../src/app/(protected)/(records)/categories/suppliers/[id]/page.tsx) |

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

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/supplier.actions.test.ts](../src/actions/supplier.actions.test.ts) · [src/actions/supplier-category.actions.test.ts](../src/actions/supplier-category.actions.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run SEQ and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** With supplier modules enabled in the local fixture, create a synthetic category/supplier, save/reload, then compare Supplier.tenantId and categoryId. Requires disposable records.
2. **Boundary:** Try a duplicate taxId in the same tenant or category from another tenant; expect rejection and no extra supplier. Requires second tenant fixture for the ownership case.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: Requires disposable records; Requires second tenant fixture for the ownership case | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/seq/src/actions/supplier.actions.ts apps/seq/src/actions/supplier-category.actions.ts apps/seq/src/queries/suppliers.ts apps/seq/src/queries/supplier-categories.ts apps/seq/src/schemas/supplier.schema.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `SUPPLIERS-CATEGORIES-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### SUPPLIERS-CATEGORIES-G1: Supplier browser and module-off fixtures missing

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** Deterministic action specs exist; the audit did not create supplier records or disable modules in product QA.
- **Impact:** Conditional navigation/access and save/reload remain unexercised.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Add a disposable supplier/category fixture plus an otherwise identical tenant with modules disabled.

### SUPPLIERS-CATEGORIES-G2: Supplier taxId remains globally unique despite tenant index

- **Status:** fixed
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** Supplier.taxId is @unique and the schema also has @@unique([tenantId, taxId]); initial audit prose treated this as unexplained divergence.
- **Impact:** Tenant-only uniqueness guidance would mislead future implementations.
- **Root cause:** Initial prose omitted PHASE-4-DB-CONSOLIDATION's explicit decision to retain both constraints after database introspection.
- **Resolution:** 2026-10-03, corrected this documentation against schema.prisma and the historical consolidation table; no database behavior changed. Source comparison pins the documented contract. Two-tenant browser/constraint execution remains unverified under G1. Documentation change is uncommitted.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [AUTHENTICATION](../../../docs/AUTHENTICATION.md)
