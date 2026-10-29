# Family tree and WikiTree import

> **Code:** [src/actions/family-tree.actions.ts](../src/actions/family-tree.actions.ts) · [src/queries/family-tree.ts](../src/queries/family-tree.ts) · [src/components/family-tree/canvas/layout/index.ts](../src/components/family-tree/canvas/layout/index.ts) · [src/components/family-tree/canvas/layout/family-units.ts](../src/components/family-tree/canvas/layout/family-units.ts) · [src/lib/wikitree.ts](../src/lib/wikitree.ts) · [src/lib/wikitree-mapper.ts](../src/lib/wikitree-mapper.ts) · [src/schemas/family-tree.schema.ts](../src/schemas/family-tree.schema.ts)
> **Entry points:** `/profile/[id]/tree` · `/api/wikitree/search` · `/api/wikitree/profile`
> **Depends on:** [PETS](PETS.md) · [MEMORIALS-GUARDIANS](MEMORIALS-GUARDIANS.md) · [MEDIA-STORAGE](../../../docs/MEDIA-STORAGE.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-29 at `f61444c` plus guarded memorial selection/link changes. Source and deterministic checks are separate from the partial runtime/UI evidence in the [guarded memorial audit](../../../docs/audits/APP-TREE-GUARDED-MEMORIALS-2026-10-29.md).

The APP application supplies family tree and wikitree import. Accepted directed relations feed ordered family units and automatic canvas geometry; synthetic duplicate ancestors prevent recursion on pedigree collapse. Ghost creation writes node+relation atomically. TreeNodePosition persists in schema but manual saved canvas positions are no longer used. WikiTree prefills ordinary profile data.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/family-tree.actions.ts](../src/actions/family-tree.actions.ts) `addRelation` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/schemas/family-tree.schema.ts](../src/schemas/family-tree.schema.ts) `getAddRelationSchema` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/queries/family-tree.ts](../src/queries/family-tree.ts) `getFamilyTree` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/family-tree.actions.ts](../src/actions/family-tree.actions.ts) | `addRelation`, `addGhostRelative`, `updateMember`, `acceptFamilyRequest`, `rejectFamilyRequest` | Authenticated mutation orchestration |
| [src/queries/family-tree.ts](../src/queries/family-tree.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/components/family-tree/canvas/layout/index.ts](../src/components/family-tree/canvas/layout/index.ts) | See exports/component in file | Visible interaction and client state |
| [src/components/family-tree/canvas/layout/family-units.ts](../src/components/family-tree/canvas/layout/family-units.ts) | See exports/component in file | Visible interaction and client state |
| [src/lib/wikitree.ts](../src/lib/wikitree.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/lib/wikitree-mapper.ts](../src/lib/wikitree-mapper.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/schemas/family-tree.schema.ts](../src/schemas/family-tree.schema.ts) | See exports/component in file | Input validation and defaults |

## Rules and why

Automatic layout is retained by bf57287; layout/index.test.ts pins geometry and termination. WikiTree mapper omits partial YYYY00 dates rather than inventing values (wikitree-mapper.test.ts). The seed has seven humans and two pets; UI displays four generations, correcting older three-generation guidance.

The [memorial selector](MEMORIALS-GUARDIANS.md) can now reuse a managed `APP_GHOST` person as a public memorial while preserving the same tree node, relationships and content. It requires accepted guardianship in addition to accepted membership in the current user's tree. The selector includes attached managed pets as existing profiles; PetOwnership never joins the other owners' human trees. `getTreeMemberIds` accepts a transaction client so the conversion can recheck the accepted graph inside its serializable transaction. The tree's member count does not increase when an existing person is promoted.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

**Add an existing memorial:** The add-relative dialog includes **Perfis sob minha guarda** beside the Genealogiq search. This lists the signed-in actor's accepted human memorials without requiring a name, with name filtering for additional results. It reuses the memorial's existing ID and content; it does not create another profile, guardianship or memorial quota charge. Pets keep their separate attachment flow.

`addRelation` rechecks the actor's live `ACCEPTED` guardianship before joining an out-of-tree `APP_MEMO`. Managing the tree root alone does not grant this permission. Pending, rejected, revoked or absent guardianship cannot authorize the link; out-of-tree ghosts remain excluded. An authorized memorial relation is immediately `ACCEPTED`, including an optional marriage to an existing parent. Living accounts still require their own consent. Existing duplicate, conflicting-type, ancestry-cycle and in-tree spouse checks apply. Growth counts every newly reachable accepted relative, including links anchored at the root; a plan downgrade does not block relations between existing members.

## Contracts and data

Accepted directed relations feed ordered family units and automatic canvas geometry; synthetic duplicate ancestors prevent recursion on pedigree collapse. Ghost creation writes node+relation atomically. TreeNodePosition persists in schema but manual saved canvas positions are no longer used. WikiTree prefills ordinary profile data.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `AppUser` | `app_users` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `FamilyRelation` | `app_family_relations` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `TreeNodePosition` | `app_tree_node_positions` | [20260724000000_tree_node_positions](../../../packages/db/prisma/migrations/20260724000000_tree_node_positions/migration.sql) |
| `PetOwnership` | `app_pet_ownerships` | [20260922000000_pet_ownerships](../../../packages/db/prisma/migrations/20260922000000_pet_ownerships/migration.sql) |
| `Notification` | `app_notifications` | [20260512000000_notifications_and_tree_request](../../../packages/db/prisma/migrations/20260512000000_notifications_and_tree_request/migration.sql) |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/profile/[id]/tree` | [src/app/(public)/profile/[id]/tree/page.tsx](../src/app/(public)/profile/[id]/tree/page.tsx) |
| GET | `/api/wikitree/search` | [src/app/api/wikitree/search/route.ts](../src/app/api/wikitree/search/route.ts) |
| GET | `/api/wikitree/profile` | [src/app/api/wikitree/profile/route.ts](../src/app/api/wikitree/profile/route.ts) |
| GET | `/api/search?mode=guarded-relative&q=...` | [src/app/api/search/route.ts](../src/app/api/search/route.ts); authenticated, rate limited, actor's accepted `APP_MEMO` profiles only; at most eight name-ordered results, empty/short query allowed |

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

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/family-tree.actions.test.ts](../src/actions/family-tree.actions.test.ts) · [src/queries/family-tree.test.ts](../src/queries/family-tree.test.ts) · [src/components/family-tree/canvas/layout/index.test.ts](../src/components/family-tree/canvas/layout/index.test.ts) · [src/schemas/family-tree.schema.test.ts](../src/schemas/family-tree.schema.test.ts) · [src/lib/wikitree.test.ts](../src/lib/wikitree.test.ts) · [src/lib/wikitree-mapper.test.ts](../src/lib/wikitree-mapper.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run APP and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Open /profile for the local owner, follow its tree; expect seven people and two pets. Zoom/fit, search Rex and inspect tutors Marina Silva and Local Admin; reload preserves graph.
2. **Boundary:** Sign out and visit private owner tree; expect access wall. Local WikiTree-disabled mode must report unavailable; actual import requires upstream network.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.
4. **Existing guarded memorial:** In the owner tree, add a parent/child/spouse/sibling through **Perfis sob minha guarda**. Select a human memorial outside the tree and confirm; expect the same profile ID in the reloaded tree, an accepted relation, no new AppUser/guardian, and no family-request notification. With a disposable fixture, revoke acceptance after selecting but before confirming; expect rejection and no relation. Restore the fixture and retry. At the tree cap, including relatives already attached to the memorial, reject growth while allowing links among existing members. Empty results and failed searches keep Add disabled.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | pass: local tree displayed seven people, four generations and two pets; zoom/fit and Rex search/sheet worked. No WikiTree import or graph mutation was exercised. | The named scenario passed within the listed limits. Remaining scenarios are n/a until their prerequisites exist. | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · ignored local `.local-qa/2026-10-03/app-tree.png` |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/app/src/actions/family-tree.actions.ts apps/app/src/queries/family-tree.ts apps/app/src/components/family-tree/canvas/layout/index.ts apps/app/src/components/family-tree/canvas/layout/family-units.ts apps/app/src/lib/wikitree.ts apps/app/src/lib/wikitree-mapper.ts apps/app/src/schemas/family-tree.schema.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `FAMILY-TREE-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### FAMILY-TREE-G1: Import provenance is not retained

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** WikiTree prefill is saved as ordinary profile fields without durable source attribution.
- **Impact:** Users cannot later distinguish entered data from upstream genealogy claims.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Define provenance storage and record independent upstream fixtures before claiming import auditing.

### FAMILY-TREE-G2: Guarded memorials could not be added to a tree

- **Status:** fixed
- **Found:** 2026-10-29, add-relative request and source trace from `f61444c`.
- **Evidence:** The global search returned `APP_MEMO` profiles, but `addRelation` rejected every out-of-tree endpoint except `APP_USER`, including the actor's own accepted memorials.
- **Impact:** A memorial visible in the guarded-profile list could not be reused in the tree; manually creating another person would duplicate its identity.
- **Root cause:** The outsider permission check did not distinguish accepted memorial guardians from other viewers. The dialog also lacked a direct guarded-profile selector.
- **Resolution:** This change adds the scoped selector and live accepted-guardian check, preserves account consent and graph boundaries, and counts actual added graph members for quota enforcement. Regression coverage: `family-tree.actions.test.ts`, `api/search/route.test.ts`, and `add-relative-dialog.test.tsx`.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | pass: local tree displayed seven people, four generations and two pets; zoom/fit and Rex search/sheet worked. No WikiTree import or graph mutation was exercised. | Only the named exercised behavior is verified. |
| 2026-10-09 | `08b2b1c` + tree profile reuse | Source, unit/DOM and static review | Existing-ID promotion, accepted scope, transactional plan/count/extras, separate pet quotas and refreshed guarded lists; 38 new regression tests passed. [Audit](../../../docs/audits/TREE-MEMORIALS-2026-10-09.md) records build and all check results. | Runtime: PostgreSQL/Docker unavailable. UI/persistence: not exercised; exact remaining scenarios are in the audit. |

| 2026-10-29 | `f61444c` + guarded memorial links | Source, action/route/DOM tests and partial local Chrome QA | 66 focused tests; full suite 1,496 passed / 59 skipped; APP types/lint and i18n passed. New selector and expired-session boundary visible locally. [Audit](../../../docs/audits/APP-TREE-GUARDED-MEMORIALS-2026-10-29.md). | Browser connection/cookie conflicts prevented successful save/reload and revoked-guardian UI verification; these remain pending. |

## Related

2026-10-09 source review at `08b2b1c` plus the shortcut found no intervening changes to the core tree action/query since `6e06634`. Selection/BFS scope and role-only conversion have deterministic coverage; the new manual promotion/reload scenario is tracked separately in the [tree memorial audit](../../../docs/audits/TREE-MEMORIALS-2026-10-09.md).

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [PETS](PETS.md) · [MEMORIALS-GUARDIANS](MEMORIALS-GUARDIANS.md) · [MEDIA-STORAGE](../../../docs/MEDIA-STORAGE.md)
