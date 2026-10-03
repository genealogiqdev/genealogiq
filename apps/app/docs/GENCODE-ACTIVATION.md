# GenCode activation and memorial trial

> **Code:** [src/actions/gencode.actions.ts](../src/actions/gencode.actions.ts) · [src/queries/gencode.ts](../src/queries/gencode.ts) · [src/app/qr/[genCode]/page.tsx](../src/app/qr/[genCode]/page.tsx)
> **Entry points:** `/activate` · `/qr/[genCode]`
> **Depends on:** [PARTNER-CREDITS](../../../docs/PARTNER-CREDITS.md) · [MEMORIALS-GUARDIANS](MEMORIALS-GUARDIANS.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-03 at `6e06634`, including this task’s uncommitted documentation, launcher and test changes. Source verification is separate from runtime/UI below.

The APP application supplies gencode activation and memorial trial. Activation parses a code and memorial fields, checks code availability and canActivate eligibility, and creates the memorial, owner guardianship, code activation and credit consumption inside a transaction. Codes normalize case and hyphens on the public QR resolver.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/gencode.actions.ts](../src/actions/gencode.actions.ts) `activateGenCode` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/actions/gencode.actions.ts](../src/actions/gencode.actions.ts) `activateGenCode` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/queries/gencode.ts](../src/queries/gencode.ts) `getLicenseByGenCode` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/gencode.actions.ts](../src/actions/gencode.actions.ts) | `activateGenCode` | Authenticated mutation orchestration |
| [src/queries/gencode.ts](../src/queries/gencode.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/app/qr/[genCode]/page.tsx](../src/app/qr/[genCode]/page.tsx) | See exports/component in file | Routed product entry |

## Rules and why

Purchased QR activation bypasses the ordinary owned-memorial cap to avoid charging twice (action comment). Trial precedence is minted order snapshot, cycle plan snapshot, then active plan; cdf4dd31 introduced trials. ACTIVATED QR resolves even if the partner annual cycle later expires.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

Activation parses a code and memorial fields, checks code availability and canActivate eligibility, and creates the memorial, owner guardianship, code activation and credit consumption inside a transaction. Codes normalize case and hyphens on the public QR resolver.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `GenCode` | `gencodes` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `QrCode` | `qr_codes` | [20260601000000_qr_code_table](../../../packages/db/prisma/migrations/20260601000000_qr_code_table/migration.sql) |
| `AppUser` | `app_users` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `AppUserGuardian` | `app_user_guardians` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `CreditReservation` | `credit_reservations` | [20260826001000_credit_ledger_and_retire_sale](../../../packages/db/prisma/migrations/20260826001000_credit_ledger_and_retire_sale/migration.sql) |
| `CreditGrant` | `credit_grants` | [20260826001000_credit_ledger_and_retire_sale](../../../packages/db/prisma/migrations/20260826001000_credit_ledger_and_retire_sale/migration.sql) |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/activate` | [src/app/(auth)/activate/page.tsx](../src/app/(auth)/activate/page.tsx) |
| GET | `/qr/[genCode]` | [src/app/qr/[genCode]/page.tsx](../src/app/qr/[genCode]/page.tsx) |

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

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/gencode.actions.test.ts](../src/actions/gencode.actions.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run APP and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Use a synthetic available funded GenCode, activate through /activate, reload the memorial and scan /qr/<code>; expect one activated code, one guardian and one credit event. Requires a funded fixture.
2. **Boundary:** Repeat the same activation and expect rejection without a second memorial/credit charge. A missing/expired code must not create a profile. Requires fixture codes.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: Requires a funded fixture; Requires fixture codes | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/app/src/actions/gencode.actions.ts apps/app/src/queries/gencode.ts apps/app/src/app/qr/[genCode]/page.tsx`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `GENCODE-ACTIVATION-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### GENCODE-ACTIVATION-G1: Activation browser fixture missing

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** The local seed provides partner balances but no isolated available code tied to a replayable activation scenario.
- **Impact:** Atomic persistence and the public QR-to-memorial UI have no product proof from this audit.
- **Root cause:** Missing fixture or direct coverage as described above.
- **Resolution:** Not fixed in this task. Create disposable funded/unfunded/activated code fixtures and independent expected ledger/profile rows.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [PARTNER-CREDITS](../../../docs/PARTNER-CREDITS.md) · [MEMORIALS-GUARDIANS](MEMORIALS-GUARDIANS.md)
