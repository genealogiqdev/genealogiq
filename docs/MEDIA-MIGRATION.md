# Resumable legacy-media migration

> **Code:** [packages/services/src/media-migration.ts](../packages/services/src/media-migration.ts) · [packages/services/src/media-migration-helpers.ts](../packages/services/src/media-migration-helpers.ts)
> **Entry points:** `pnpm media:migrate -- --copy|--verify|--rewrite|--all|--rollback|--manifest=<path>`
> **Depends on:** [MEDIA-STORAGE](MEDIA-STORAGE.md) · [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [CONFIGURATION](CONFIGURATION.md) · [TESTING](TESTING.md) · [OBSERVABILITY](OBSERVABILITY.md) · [RUNBOOKS](RUNBOOKS.md)
> **Last verified against code:** 2026-10-03 at `6e06634`, including this task’s uncommitted documentation, launcher and test changes. Source verification is separate from runtime/UI below.

This shared module supplies resumable legacy-media migration. Migration inventories legacy URLs into a durable local/private Azure manifest, copies to stable hashed destinations, verifies integrity, conditionally rewrites references, and can roll back from recorded old values. Inventory writes a manifest: it is not a read-only audit. Only verified copied objects become rewrite candidates.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Load saved manifest and collect current references | external call | [packages/services/src/media-migration.ts](../packages/services/src/media-migration.ts) `main` | Durable inventory |
| 2 | Copy stable destination and verify object integrity | external call | [packages/services/src/media-migration.ts](../packages/services/src/media-migration.ts) `main` | Copied/verified status in manifest |
| 3 | Compare before reference rewrite, or restore recorded old references | external call | [packages/services/src/media-migration.ts](../packages/services/src/media-migration.ts) `main` | Conditional DB change and resumable manifest |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [packages/services/src/media-migration.ts](../packages/services/src/media-migration.ts) | See exports/component in file | Shared policy or integration implementation |
| [packages/services/src/media-migration-helpers.ts](../packages/services/src/media-migration-helpers.ts) | `legacyDestinationName`, `replaceMediaArray`, `isReferencedObjectReadyForRewrite` | Shared policy or integration implementation |

## Rules and why

a165f45 introduced Azure cutover. Integrity and compare-before-write rules prevent rewriting changed data or exposing incomplete copies. The helper tests pin array replacement and readiness. Historical incident figures remain in docs/history rather than being replaced with current run output.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

Migration inventories legacy URLs into a durable local/private Azure manifest, copies to stable hashed destinations, verifies integrity, conditionally rewrites references, and can roll back from recorded old values. Inventory writes a manifest: it is not a read-only audit. Only verified copied objects become rewrite candidates.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `AppUser` | `app_users` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `User` | `users` | [0_init](../packages/db/prisma/migrations/0_init/migration.sql) |
| `BioImage` | `app_bio_images` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `GalleryItem` | `app_gallery_items` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `Tribute` | `app_tributes` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `GeoPlace` | `app_geo_places` | [20260721000000_geo_places](../packages/db/prisma/migrations/20260721000000_geo_places/migration.sql) |
| `Document` | `app_documents` | [20260725010000_app_documents](../packages/db/prisma/migrations/20260725010000_app_documents/migration.sql) |
| `Geolocation` | `app_geolocations` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| See handler | `pnpm media:migrate -- --copy|--verify|--rewrite|--all|--rollback|--manifest=<path>` | Entry description; scope/method varies by caller |

| Setting | Default | Validation / owner | Consequence |
| --- | --- | --- | --- |
| AZURE_STORAGE_MIGRATION_CONTAINER | media-migration | media-storage.ts | Private durable manifest container. |
| MEDIA_MIGRATION_MANIFEST_BLOB | manifests/current.json | media-migration.ts | Overrides the durable manifest key; currently not declared in turbo globalEnv. |

## How to test it (AI-runnable)

Run commands from the repository root `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Install workspace dependencies first.

| Layer | Command | Needs | Cost | Proves |
| --- | --- | --- | --- | --- |
| Unit (deterministic) | `pnpm test` | Workspace install; root Vitest supplies an unreachable dummy DB URL | Free, seconds | Pure array rewrite/readiness/hash helpers; full migration is not covered |
| Contract / schema | `pnpm check:schema-parity` | Workspace install | Free, seconds | One canonical Prisma schema; feature input constraints are only proven when a schema spec is listed |
| Golden / replay | n/a: no complete recorded-provider replay fixture | Hand-authored recorded responses; cache misses must fail | Not run | Model regression is not applicable; provider/data drift remains an integration limit |
| End-to-end / harness | n/a: no feature-specific isolated browser harness | See prerequisites below | Local/free when prerequisites exist | Requires the described feature scenario |
| Offline evidence | `node scripts/check-docs.mjs` | Repository docs | Free, seconds | Paths, links, headings, metadata and indexes; it cannot verify pixels or business outcomes |
| Manual product QA | `node scripts/local-qa.mjs` → scenarios below | Local PostgreSQL, relevant app; Azurite for media; fixture Credentials identity | Local/free; real providers need test accounts | Visible result plus save/reload or independently checked persisted effect |

**Specs included in the successful 2026-10-03 full-suite run:** [packages/services/src/media-migration-helpers.test.ts](../packages/services/src/media-migration-helpers.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run the caller app(s) and PostgreSQL; storage scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** On a disposable DB/storage fixture, inventory, copy, verify, rewrite and reload a profile; compare old/new references and object bytes. Requires legacy source fixtures and a saved manifest.
2. **Boundary:** Interrupt after copy and resume from the same manifest; concurrently change a row and expect conditional rewrite refusal. Requires an isolated migration fixture.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: Requires legacy source fixtures and a saved manifest; Requires an isolated migration fixture | [Dated audit](audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- packages/services/src/media-migration.ts packages/services/src/media-migration-helpers.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `MEDIA-MIGRATION-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### MEDIA-MIGRATION-G1: Full resumable migration fixture absent

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** Only helper tests ran; no legacy source/CDN copy, conditional DB rewrite, rollback or resumed manifest was exercised.
- **Impact:** Helper success does not prove real migration correctness or safe rollback.
- **Root cause:** Missing fixture or direct coverage as described above.
- **Resolution:** Not fixed in this task. Build an isolated legacy-URL/blob dataset and test copy/verify/rewrite/interruption/rollback with hand-authored reference expectations.

### MEDIA-MIGRATION-G2: Manifest override missing from declared environment contract

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** MEDIA_MIGRATION_MANIFEST_BLOB is read in media-migration.ts but absent from turbo.json globalEnv and .env examples.
- **Impact:** A deployment/cache configuration may omit the selected durable manifest key.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Declare and document the setting consistently; verify server-side manifest selection.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |

## Related

[LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [CONFIGURATION](CONFIGURATION.md) · [TESTING](TESTING.md) · [OBSERVABILITY](OBSERVABILITY.md) · [RUNBOOKS](RUNBOOKS.md) · [Audit](audits/AGENT-MEMORY-2026-10-03.md) · [MEDIA-STORAGE](MEDIA-STORAGE.md)
