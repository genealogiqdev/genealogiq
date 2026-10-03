# Profiles, search and favorites

> **Code:** [src/lib/profile.ts](../src/lib/profile.ts) · [src/lib/public-profile-access.ts](../src/lib/public-profile-access.ts) · [src/queries/profile.ts](../src/queries/profile.ts) · [src/actions/profile.actions.ts](../src/actions/profile.actions.ts) · [src/queries/favorite.ts](../src/queries/favorite.ts) · [src/actions/favorite.actions.ts](../src/actions/favorite.actions.ts) · [src/app/api/search/route.ts](../src/app/api/search/route.ts) · [src/schemas/profile.schema.ts](../src/schemas/profile.schema.ts)
> **Entry points:** `/profile` · `/profile/[id]` · `/profile/[id]/edit` · `/profile/[id]/favorites` · `/api/search`
> **Depends on:** [AUTHENTICATION](../../../docs/AUTHENTICATION.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-03 at `6e06634`, including this task’s uncommitted documentation, launcher and test changes. Source verification is separate from runtime/UI below.

The APP application supplies profiles, search and favorites. getProfileEditSchema requires name/gender/birth date and location; memorial death details become required. PUBLIC_SELECT excludes credential/contact identifiers; EDIT_SELECT serves authorized forms. Favorite has composite primary key (userId,targetId), mapped to app_user_id/app_target_id. Public visibility was added by 20260725000000_app_user_public_profile. /api/search requires authentication, limits each viewer to 120 attempts per hour, requires q length three (one for pet mode), returns at most eight rows, and filters pet mode to accepted guardian-linked pets. The ordinary search still does not filter isPublicProfile.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/lib/profile.ts](../src/lib/profile.ts) `canManageProfile` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/schemas/profile.schema.ts](../src/schemas/profile.schema.ts) `getProfileEditSchema` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/queries/profile.ts](../src/queries/profile.ts) `getProfileById` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/lib/profile.ts](../src/lib/profile.ts) | `canManageProfile` | Shared policy or integration implementation |
| [src/lib/public-profile-access.ts](../src/lib/public-profile-access.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/queries/profile.ts](../src/queries/profile.ts) | `redactLivingProfile`, `getProfileById`, `getProfileForEdit` | Scoped data reads and output shaping |
| [src/actions/profile.actions.ts](../src/actions/profile.actions.ts) | `updateProfile` | Authenticated mutation orchestration |
| [src/queries/favorite.ts](../src/queries/favorite.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/actions/favorite.actions.ts](../src/actions/favorite.actions.ts) | `toggleFavorite` | Authenticated mutation orchestration |
| [src/app/api/search/route.ts](../src/app/api/search/route.ts) | See exports/component in file | HTTP entry and response handling |
| [src/schemas/profile.schema.ts](../src/schemas/profile.schema.ts) | See exports/component in file | Input validation and defaults |

## Rules and why

Anonymous readers of private living profiles and APP_GHOST encounter the sign-in wall; public memorials/pets and opted-in living profiles use previews. redactLivingProfile removes precise details from nonmanagers (profile.test.ts). toggleFavorite rejects self-favorites before DB access (favorite.actions.test.ts).

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

getProfileEditSchema requires name/gender/birth date and location; memorial death details become required. PUBLIC_SELECT excludes credential/contact identifiers; EDIT_SELECT serves authorized forms. Favorite has composite primary key (userId,targetId), mapped to app_user_id/app_target_id. Public visibility was added by 20260725000000_app_user_public_profile. /api/search requires authentication, limits each viewer to 120 attempts per hour, requires q length three (one for pet mode), returns at most eight rows, and filters pet mode to accepted guardian-linked pets. The ordinary search still does not filter isPublicProfile.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `AppUser` | `app_users` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `Favorite` | `app_favorites` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `AppUserGuardian` | `app_user_guardians` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/profile` | [src/app/(public)/profile/page.tsx](../src/app/(public)/profile/page.tsx) |
| GET | `/profile/[id]` | [src/app/(public)/profile/[id]/page.tsx](../src/app/(public)/profile/[id]/page.tsx) |
| GET | `/profile/[id]/edit` | [src/app/(public)/profile/[id]/edit/page.tsx](../src/app/(public)/profile/[id]/edit/page.tsx) |
| GET | `/profile/[id]/favorites` | [src/app/(public)/profile/[id]/favorites/page.tsx](../src/app/(public)/profile/[id]/favorites/page.tsx) |
| GET | `/api/search` | [src/app/api/search/route.ts](../src/app/api/search/route.ts) |

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

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/profile.actions.test.ts](../src/actions/profile.actions.test.ts) · [src/queries/profile.test.ts](../src/queries/profile.test.ts) · [src/lib/public-profile-access.test.ts](../src/lib/public-profile-access.test.ts) · [src/actions/favorite.actions.test.ts](../src/actions/favorite.actions.test.ts) · [src/queries/favorite.test.ts](../src/queries/favorite.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run APP and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Open Rex from /home, remove the favorite, restore it, reload. Expect the button/count to restore and exactly one Favorite row.
2. **Boundary:** Sign out and open /home or a private living root; expect /sign-in and no editable profile.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | pass: Rex favorite removed and restored through the UI; reload showed one favorite. Independent PostgreSQL COUNT(app_favorites) for the fixture viewer/target was 1. | The named scenario passed within the listed limits. Remaining scenarios are n/a until their prerequisites exist. | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · ignored local `.local-qa/2026-10-03/app-favorite-reload.png` |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/app/src/lib/profile.ts apps/app/src/lib/public-profile-access.ts apps/app/src/queries/profile.ts apps/app/src/actions/profile.actions.ts apps/app/src/queries/favorite.ts apps/app/src/actions/favorite.actions.ts apps/app/src/app/api/search/route.ts apps/app/src/schemas/profile.schema.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `PUBLIC-PROFILES-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### PUBLIC-PROFILES-G1: Private profiles appear in authenticated search

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** src/app/api/search/route.ts queries AppUser without filtering isPublicProfile.
- **Impact:** Any signed-in consumer can discover private names and identifiers.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Define discovery policy and add search privacy fixtures before changing it.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | pass: Rex favorite removed and restored through the UI; reload showed one favorite. Independent PostgreSQL COUNT(app_favorites) for the fixture viewer/target was 1. | Only the named exercised behavior is verified. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [AUTHENTICATION](../../../docs/AUTHENTICATION.md)
