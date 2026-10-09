# Memorials and co-guardians

> **Code:** [src/actions/memorial.actions.ts](../src/actions/memorial.actions.ts) · [src/actions/guardian.actions.ts](../src/actions/guardian.actions.ts) · [src/queries/memorial.ts](../src/queries/memorial.ts) · [src/lib/profile.ts](../src/lib/profile.ts) · [src/lib/memorial-quota.ts](../src/lib/memorial-quota.ts) · [src/schemas/memorial.schema.ts](../src/schemas/memorial.schema.ts) · [src/schemas/guardian.schema.ts](../src/schemas/guardian.schema.ts)
> **Entry points:** `/profile/[id]/memorialized` · `/profile/[id]/memorialized/new` · `/profile/[id]/memorialized/from-tree` · `/profile/[id]/edit`
> **Depends on:** [BILLING-QUOTAS](BILLING-QUOTAS.md) · [AUTHENTICATION](../../../docs/AUTHENTICATION.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-09 at `08b2b1c` plus the tree-to-memorial shortcut and combined guarded-profile lists. Source, tests and runtime/UI are recorded separately in the [tree memorial audit](../../../docs/audits/TREE-MEMORIALS-2026-10-09.md).

The APP application supplies memorials and co-guardians. APP_MEMO profiles use accepted co-guardianship. AppUserGuardian unique(appUserId,guardianId) stores PENDING/ACCEPTED/REJECTED/requestedById (20260516000000_co_guardianship). Direct creation validates capacity, then writes the profile and first guardian separately. The tree shortcut reuses an existing profile with a transactional role change.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/memorial.actions.ts](../src/actions/memorial.actions.ts) `createMemorial` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/schemas/memorial.schema.ts](../src/schemas/memorial.schema.ts) `getMemorialSchema` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/queries/memorial.ts](../src/queries/memorial.ts) `getMemorialsByCreatorId` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/memorial.actions.ts](../src/actions/memorial.actions.ts) | `createMemorial`, `updateMemorial`, `deleteMemorial` | Authenticated mutation orchestration |
| [src/actions/guardian.actions.ts](../src/actions/guardian.actions.ts) | `requestGuardianship`, `approveGuardianship`, `rejectGuardianship` | Authenticated mutation orchestration |
| [src/queries/memorial.ts](../src/queries/memorial.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/lib/profile.ts](../src/lib/profile.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/lib/memorial-quota.ts](../src/lib/memorial-quota.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/schemas/memorial.schema.ts](../src/schemas/memorial.schema.ts) | See exports/component in file | Input validation and defaults |
| [src/schemas/guardian.schema.ts](../src/schemas/guardian.schema.ts) | See exports/component in file | Input validation and defaults |
| [src/actions/tree-memorial.actions.ts](../src/actions/tree-memorial.actions.ts) | `addMemorialFromTree` | Scoped, quota-checked promotion of an existing tree profile |
| [src/queries/tree-memorial.ts](../src/queries/tree-memorial.ts) | `getTreeMemorialCandidates`, `getTreeMemorialScope` | Accepted tree membership plus accepted guardianship; pets join through human owners only |
| [src/components/tree-memorial-picker.tsx](../src/components/tree-memorial-picker.tsx) | `TreeMemorialPicker` | Search, person/pet filters, public-memorial confirmation and upgrade dialog |

## Rules and why

Owner/manager authorization is checked server-side on every mutation. Per-guardian memorial capacity replaced removed maxProfiles/bulk-sale binding (2498328, a0aa99b). Origin of individual edit-form choices is not recorded.

**Memorial QR allowance:** The standard FREE plan permits one human memorial but includes no memorial QR export. PREMIUM's human memorial exports use `memorialsMax` (normally five), independently of the personal `qrCodeMax`. [qr-quota.ts](../src/lib/qr-quota.ts) resolves the viewing guardian's live plan and accepted human profiles, then uses the [shared policy](../../../packages/core/src/memorial-qr.ts) also used by SEQ. Oldest-first allocation has a stable ID tie-break; activated plaques consume no included slot and purchased QR units remain available. Unknown/non-accepted profiles are never unlocked by spare capacity. The locked memorial dialog explains that Premium increases memorial QR access; the personal QR wording remains separate.

**Novo → Selecionar da árvore** reuses an `APP_GHOST` person as an `APP_MEMO` without another AppUser, guardian or relation. Confirmation explicitly explains that the profile becomes a public memorial. Only `role` changes: names, dates (including unknown/null dates), photos, biography and other content keep their existing IDs and values. Real `APP_USER` accounts cannot be converted through this shortcut.

Tree membership is not permission to assume guardianship. The selector and mutation require the actor's `ACCEPTED` guardianship of the selected profile, and membership in the actor's accepted human graph or a pet attached to that graph. Pending relations/guardianships and a pet's co-owners cannot expand this scope. The action rechecks scope inside its transaction; it does not trust the earlier page or a submitted guardian ID.

`getGuardedProfilesByGuardianId` supplies human memorials and managed pets to `/home`, the profile preview and the guarded-profile list. Existing pets/memorials already consume their respective quota and are labeled **Já está sob sua guarda** in the picker with **Ver perfil**. They are not recreated or charged another slot, including after a plan downgrade. The original memorial-only reader/count remain separate so pets do not consume `memorialsMax`.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

APP_MEMO profiles use accepted co-guardianship. AppUserGuardian unique(appUserId,guardianId) stores PENDING/ACCEPTED/REJECTED/requestedById (20260516000000_co_guardianship).

`getMemorialFromTreeSchema` accepts only the existing profile ID; identity fields are not resubmitted. A promotion checks each accepted guardian's current plan plus purchased memorial extras. The profile's global role would affect all of their counts, so another guardian at capacity blocks promotion without exposing their identity or allowance. The acting guardian's cap returns a failed ActionResult with `quota: { limit, tier }`, which opens the existing `LimitReachedDialog` and subscription options. Rejection leaves the tree profile unchanged.

The role update and memorial count reads use a serializable transaction, with up to three retries on Prisma `P2034`. A competing shortcut request must recheck capacity; resubmitting an already converted profile succeeds as `alreadyAdded` without another write. This concurrency boundary covers the new shortcut, not the older direct-create/guardian-approval writers. Plan, accepted-guardian, count and purchased-extra readers share the transaction client, including FREE fallback; quota validation does not acquire a second database connection from inside the transaction. Default callers keep the existing request-scoped behavior. Success invalidates home, profile/guarded-list/tree pages and the converted profile's content routes. No email, checkout, new entitlement or provider operation is involved.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `AppUser` | `app_users` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `AppUserGuardian` | `app_user_guardians` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `Notification` | `app_notifications` | [20260512000000_notifications_and_tree_request](../../../packages/db/prisma/migrations/20260512000000_notifications_and_tree_request/migration.sql) |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/profile/[id]/memorialized` | [src/app/(public)/profile/[id]/memorialized/page.tsx](../src/app/(public)/profile/[id]/memorialized/page.tsx) |
| GET | `/profile/[id]/memorialized/new` | [src/app/(public)/profile/[id]/memorialized/new/page.tsx](../src/app/(public)/profile/[id]/memorialized/new/page.tsx) |
| GET | `/profile/[id]/memorialized/from-tree` | [src/app/(public)/profile/[id]/memorialized/from-tree/page.tsx](../src/app/(public)/profile/[id]/memorialized/from-tree/page.tsx); own-account route only |
| GET | `/profile/[id]/edit` | [src/app/(public)/profile/[id]/edit/page.tsx](../src/app/(public)/profile/[id]/edit/page.tsx) |

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

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/memorial.actions.test.ts](../src/actions/memorial.actions.test.ts) · [src/actions/guardian.actions.test.ts](../src/actions/guardian.actions.test.ts) · [src/lib/memorial-quota.test.ts](../src/lib/memorial-quota.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Tree shortcut regression:** [action](../src/actions/tree-memorial.actions.test.ts), [selection query](../src/queries/tree-memorial.test.ts), [guarded lists/counts](../src/queries/memorial.test.ts), [transaction quota](../src/lib/memorial-quota-transaction.test.ts), [transactional plan/extras](../src/lib/subscription-transaction.test.ts) and [picker/home DOM](../src/components/tree-memorial-picker.test.tsx) specs cover existing-ID promotion, malformed input, scope and co-guardian rejection, cap/retry/idempotence, pet reuse, accent-insensitive search, confirmation, cancellation, upgrade links and retry after transport failure. DOM tests exercise the real dialogs but are not Chrome or database persistence evidence.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run APP and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** From /home open Helena memorial, edit a harmless nickname, save/reload, compare the row and restore the original.
2. **Boundary:** Anonymous edit and PENDING guardian mutation must reject without a changed AppUser row.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.
4. **Tree reuse:** Sign in normally, open **Perfis sob minha guarda → Gerenciar perfis → Novo → Selecionar da árvore**. Search a managed pet (including an unaccented search for Banzé); expect its existing profile link and no add operation. Select a disposable managed human tree member, confirm the public memorial transition, and expect one guarded-list card with the same profile URL after reload.
5. **Limit and permission:** With a disposable guardian at its plan's memorial cap, attempt another tree promotion. Expect the limit dialog with subscription options and an unchanged `APP_GHOST` row. A pending/foreign guardian or a detached tree member must not be convertible; an `APP_USER` account never appears as a conversion candidate. Repeated submission of the same successful selection must not add another slot or profile.
6. **Persistence:** Compare the original and final AppUser ID, names/dates/avatar, Bio/content references, FamilyRelation, AppUserGuardian and PetOwnership rows. Only the selected human's role (and normal updatedAt) changes. Check pets in the guarded home/profile/list views and separate memorial/pet counts. Restore the disposable fixture role after QA; do not delete a real profile to undo this test.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: A disposable feature dataset and the exact happy/boundary interaction have not been exercised. | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/app/src/actions/memorial.actions.ts apps/app/src/actions/guardian.actions.ts apps/app/src/queries/memorial.ts apps/app/src/lib/profile.ts apps/app/src/lib/memorial-quota.ts apps/app/src/schemas/memorial.schema.ts apps/app/src/schemas/guardian.schema.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `MEMORIALS-GUARDIANS-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### MEMORIALS-GUARDIANS-G3: Personal QR allowance blocked Premium memorials

- **Status:** fixed
- **Found:** 2026-10-09, SEQ memorial-plan/download follow-up.
- **Evidence:** The old rank combined the guardian's personal profile and memorials while both standard plans had `qrCodeMax=1`. Premium's `memorialsMax=5` did not grant its five human QR exports; a sufficiently old Free memorial could take the personal slot.
- **Impact:** QR access disagreed with the stated Free/Premium memorial contract.
- **Root cause:** One personal QR count was reused as the memorial allowance.
- **Resolution:** This change based on `08b2b1c` separates the personal allowance from accepted human memorial ranks and shares the policy with SEQ. [qr-quota.test.ts](../src/lib/qr-quota.test.ts), [memorial-quota.test.ts](../src/lib/memorial-quota.test.ts) and the shared core regression pin Free 1, Premium 5, sixth-slot rejection, non-guardian rejection and purchased rights. [Audit and remaining product prerequisites](../../../docs/audits/SEQ-MEMORIALS-2026-10-09.md).

### MEMORIALS-GUARDIANS-G2: Tree profiles could not be reused from the memorial list

- **Status:** fixed
- **Found:** 2026-10-09, user report of recreating Banzé after adding the pet to the tree.
- **Evidence:** The list's New menu only linked to blank person/pet forms, and `getMemorialsByCreatorId` excluded `APP_PET` from all guarded-profile views.
- **Impact:** Existing pets were missing under care; human tree entries required duplicate memorial entry.
- **Root cause:** Memorial-only list projection and no existing-profile transition.
- **Resolution:** This tree-memorial change adds the scoped selector, in-place human promotion, combined guarded views, and current quota/upgrade feedback. The six new regression specs above pass; local Chrome/database verification remains explicitly pending in the dated audit because PostgreSQL/Docker was unavailable. Commit is identified by this change's audit history.

### MEMORIALS-GUARDIANS-G1: Guard helper accepts unexpected status

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** canManageProfile in src/lib/profile.ts accepts any provided guardian status except PENDING/REJECTED, whereas old docs required exactly ACCEPTED.
- **Impact:** Loosely typed callers could unintentionally grant access if an unexpected status appears.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Tighten the explicit-status guard with deliberate legacy-shape support and regression tests.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |
| 2026-10-09 | `08b2b1c` + tree profile reuse | Source, unit/DOM and static review | Existing-ID promotion, accepted scope, transactional plan/count/extras, separate pet quotas and refreshed guarded lists; 38 new regression tests passed. [Audit](../../../docs/audits/TREE-MEMORIALS-2026-10-09.md) records build and all check results. | Runtime: PostgreSQL/Docker unavailable. UI/persistence: not exercised; exact remaining scenarios are in the audit. |
| 2026-10-09 | `08b2b1c` + shared memorial QR follow-up | Source and automated checks | Free 1/Premium 5 creation boundaries, independent Premium memorial QR capacity, personal QR preservation, accepted-only scope and purchased rights are covered in the 77 focused passes. APP types/build/lint passed. | Runtime/UI n/a: local database and Chrome authentication unavailable. [SEQ memorial audit](../../../docs/audits/SEQ-MEMORIALS-2026-10-09.md) separates full-suite failures, decoding and cleanup. |

## Related

The [SEQ memorial-plan audit](../../../docs/audits/SEQ-MEMORIALS-2026-10-09.md) records the shared QR rule, focused automated results, real export decoding and the blocked local database/Chrome session. It does not claim new browser evidence for this APP route.

The [2026-10-09 tree memorial audit](../../../docs/audits/TREE-MEMORIALS-2026-10-09.md) records source, actual checks, runtime/UI prerequisites and process cleanup separately.

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [BILLING-QUOTAS](BILLING-QUOTAS.md) · [AUTHENTICATION](../../../docs/AUTHENTICATION.md)
