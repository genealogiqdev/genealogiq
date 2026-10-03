# Pet profiles and ownership

> **Code:** [src/actions/pet.actions.ts](../src/actions/pet.actions.ts) · [src/queries/pet.ts](../src/queries/pet.ts) · [src/lib/pet-quota.ts](../src/lib/pet-quota.ts) · [src/schemas/pet.schema.ts](../src/schemas/pet.schema.ts)
> **Entry points:** `/profile/[id]/pets` · `/profile/[id]/pets/new` · `/profile/[id]` · `/profile/[id]/tree`
> **Depends on:** [FAMILY-TREE](FAMILY-TREE.md) · [BILLING-QUOTAS](BILLING-QUOTAS.md) · [MEDIA-STORAGE](../../../docs/MEDIA-STORAGE.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-03 at `6e06634`, including this task’s uncommitted documentation, launcher and test changes. Source verification is separate from runtime/UI below.

The APP application supplies pet profiles and ownership. APP_PET profiles have independent quota and multiple authorized human owners. Unique PetOwnership(ownerId,petId) replaces PET_OF FamilyRelation in 20260922000000_pet_ownerships. Pets reuse bio/gallery/documents/places modules.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/pet.actions.ts](../src/actions/pet.actions.ts) `createPet` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/schemas/pet.schema.ts](../src/schemas/pet.schema.ts) `getPetSchema` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/queries/pet.ts](../src/queries/pet.ts) `getPetOwners` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/pet.actions.ts](../src/actions/pet.actions.ts) | `createPet`, `updatePet`, `attachPet`, `detachPet`, `detachPetFromTree`, `deletePet` | Authenticated mutation orchestration |
| [src/queries/pet.ts](../src/queries/pet.ts) | `getPetOwners` | Scoped data reads and output shaping |
| [src/lib/pet-quota.ts](../src/lib/pet-quota.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/schemas/pet.schema.ts](../src/schemas/pet.schema.ts) | See exports/component in file | Input validation and defaults |

## Rules and why

Owner candidates must be manageable human tree members; pet-as-owner and foreign root reject (pet.actions.test.ts). detachPetFromTree removes only this tree’s links and preserves other roots sharing the pet (2b1920f).

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

APP_PET profiles have independent quota and multiple authorized human owners. Unique PetOwnership(ownerId,petId) replaces PET_OF FamilyRelation in 20260922000000_pet_ownerships. Pets reuse bio/gallery/documents/places modules.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `AppUser` | `app_users` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `PetOwnership` | `app_pet_ownerships` | [20260922000000_pet_ownerships](../../../packages/db/prisma/migrations/20260922000000_pet_ownerships/migration.sql) |
| `AppUserGuardian` | `app_user_guardians` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/profile/[id]/pets` | [src/app/(public)/profile/[id]/pets/page.tsx](../src/app/(public)/profile/[id]/pets/page.tsx) |
| GET | `/profile/[id]/pets/new` | [src/app/(public)/profile/[id]/pets/new/page.tsx](../src/app/(public)/profile/[id]/pets/new/page.tsx) |
| GET | `/profile/[id]` | [src/app/(public)/profile/[id]/page.tsx](../src/app/(public)/profile/[id]/page.tsx) |
| GET | `/profile/[id]/tree` | [src/app/(public)/profile/[id]/tree/page.tsx](../src/app/(public)/profile/[id]/tree/page.tsx) |

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

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/pet.actions.test.ts](../src/actions/pet.actions.test.ts) · [src/queries/pet.test.ts](../src/queries/pet.test.ts) · [src/lib/pet-quota.test.ts](../src/lib/pet-quota.test.ts) · [src/schemas/pet.schema.test.ts](../src/schemas/pet.schema.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run APP and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** In local owner tree search Rex, open the sheet and expect Marina Silva and Local Admin as tutors. Open Luna and verify memorial owner Helena.
2. **Boundary:** Try foreign-root ownership or pet-as-owner in deterministic fixtures. Expect rejection without PetOwnership writes.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | pass for read/navigation: Rex sheet showed Marina Silva and Local Admin as tutors. Pet creation, detach and owner mutation were not exercised in the browser. | The named scenario passed within the listed limits. Remaining scenarios are n/a until their prerequisites exist. | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · ignored local `.local-qa/2026-10-03/app-pet-owners.png` |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/app/src/actions/pet.actions.ts apps/app/src/queries/pet.ts apps/app/src/lib/pet-quota.ts apps/app/src/schemas/pet.schema.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `PETS-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

None known from this source/test audit. This is not a claim of complete product/integration coverage.
## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | pass for read/navigation: Rex sheet showed Marina Silva and Local Admin as tutors. Pet creation, detach and owner mutation were not exercised in the browser. | Only the named exercised behavior is verified. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [FAMILY-TREE](FAMILY-TREE.md) · [BILLING-QUOTAS](BILLING-QUOTAS.md) · [MEDIA-STORAGE](../../../docs/MEDIA-STORAGE.md)
