# Back-office accounts, staff and company

> **Code:** [src/actions/auth.ts](../src/actions/auth.ts) · [src/actions/user.actions.ts](../src/actions/user.actions.ts) · [src/actions/company.actions.ts](../src/actions/company.actions.ts) · [src/auth.ts](../src/auth.ts) · [src/lib/dal.ts](../src/lib/dal.ts) · [src/schemas/user.schema.ts](../src/schemas/user.schema.ts)
> **Entry points:** `/setup` · `/sign-in` · `/profile` · `/system/users` · `/system/users/new` · `/system/users/[id]` · `/system/company` · `/api/auth/[...nextauth]`
> **Depends on:** [AUTHENTICATION](../../../docs/AUTHENTICATION.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-03 at `6e06634`, including this task’s uncommitted documentation, launcher and test changes. Source verification is separate from runtime/UI below.

The BMS application supplies back-office accounts, staff and company. BMS credentials use bms.session-token and BMS roles. setupSystem initializes an empty system; normal staff mutations require DAL authorization from the session role. Company uses taxId LOCAL-COMPANY-001 in the local fixture; staff belong to the back office rather than an APP consumer.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/auth.ts](../src/actions/auth.ts) `login` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/schemas/user.schema.ts](../src/schemas/user.schema.ts) `getUserSchema` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/schemas/user.schema.ts](../src/schemas/user.schema.ts) `getUserSchema` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/auth.ts](../src/actions/auth.ts) | `login`, `setupSystem` | Authenticated mutation orchestration |
| [src/actions/user.actions.ts](../src/actions/user.actions.ts) | `createUser`, `updateUser` | Authenticated mutation orchestration |
| [src/actions/company.actions.ts](../src/actions/company.actions.ts) | `updateCompany` | Authenticated mutation orchestration |
| [src/auth.ts](../src/auth.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/lib/dal.ts](../src/lib/dal.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/schemas/user.schema.ts](../src/schemas/user.schema.ts) | See exports/component in file | Input validation and defaults |

## Rules and why

Use verifyAdmin before staff mutations; an authenticated BMS viewer alone is insufficient (user.actions.test.ts). Keep normal form submit/reload semantics. Auth lockout/session policy is shared with AUTHENTICATION; origin not recorded.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

BMS credentials use bms.session-token and BMS roles. setupSystem initializes an empty system; normal staff mutations require DAL authorization from the session role. Company uses taxId LOCAL-COMPANY-001 in the local fixture; staff belong to the back office rather than an APP consumer.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `User` | `users` | [0_init](../../../packages/db/prisma/migrations/0_init/migration.sql) |
| `Company` | `companies` | [20260401234340_add_company](../../../packages/db/prisma/migrations/20260401234340_add_company/migration.sql) |
| `EmailToken` | `email_tokens` | [0_init](../../../packages/db/prisma/migrations/0_init/migration.sql) |
| `PasswordResetToken` | `password_reset_tokens` | [0_init](../../../packages/db/prisma/migrations/0_init/migration.sql) |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/setup` | [src/app/(auth)/setup/page.tsx](../src/app/(auth)/setup/page.tsx) |
| GET | `/sign-in` | [src/app/(auth)/sign-in/page.tsx](../src/app/(auth)/sign-in/page.tsx) |
| GET | `/profile` | [src/app/(protected)/profile/page.tsx](../src/app/(protected)/profile/page.tsx) |
| GET | `/system/users` | [src/app/(protected)/system/users/page.tsx](../src/app/(protected)/system/users/page.tsx) |
| GET | `/system/users/new` | [src/app/(protected)/system/users/new/page.tsx](../src/app/(protected)/system/users/new/page.tsx) |
| GET | `/system/users/[id]` | [src/app/(protected)/system/users/[id]/page.tsx](../src/app/(protected)/system/users/[id]/page.tsx) |
| GET | `/system/company` | [src/app/(protected)/system/company/page.tsx](../src/app/(protected)/system/company/page.tsx) |
| GET, POST | `/api/auth/[...nextauth]` | [src/app/api/auth/[...nextauth]/route.ts](../src/app/api/auth/[...nextauth]/route.ts) |

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

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/user.actions.test.ts](../src/actions/user.actions.test.ts) · [src/actions/company.actions.test.ts](../src/actions/company.actions.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run BMS and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Sign in as the local BMS administrator; open /system/company, change trade name to Genealogiq Local QA 2026-10-03, save, reload, compare the Company row, then restore Genealogiq Local and save.
2. **Boundary:** Sign out and open /system/company; expect /sign-in and no editable company form.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | pass: company trade name saved as Genealogiq Local QA 2026-10-03, persisted after reload, and restored to Genealogiq Local. After sign-out /system/company redirected to sign-in. PostgreSQL confirmed the restored value. | The named scenario passed within the listed limits. Remaining scenarios are n/a until their prerequisites exist. | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · ignored local `.local-qa/2026-10-03/bms-save-reload.png` |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/bms/src/actions/auth.ts apps/bms/src/actions/user.actions.ts apps/bms/src/actions/company.actions.ts apps/bms/src/auth.ts apps/bms/src/lib/dal.ts apps/bms/src/schemas/user.schema.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `ACCOUNTS-STAFF-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### ACCOUNTS-STAFF-G1: Initial setup lacks a deterministic fixture

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** The new company boundary spec verifies administrator rejection/invalid input; auth.ts setupSystem still has no disposable empty-system spec.
- **Impact:** Initial setup cannot be reproduced without changing the existing singleton company/staff state.
- **Root cause:** Missing fixture or direct coverage as described above.
- **Resolution:** Not fixed in this task. Add an isolated empty-system fixture and mock welcome transport; retain company source/test/UI evidence separately.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | pass: company trade name saved as Genealogiq Local QA 2026-10-03, persisted after reload, and restored to Genealogiq Local. After sign-out /system/company redirected to sign-in. PostgreSQL confirmed the restored value. | Only the named exercised behavior is verified. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [AUTHENTICATION](../../../docs/AUTHENTICATION.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md)
