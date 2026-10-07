# Consumer accounts

> **Code:** [src/actions/auth.actions.ts](../src/actions/auth.actions.ts) · [src/auth.ts](../src/auth.ts) · [src/schemas/auth.schema.ts](../src/schemas/auth.schema.ts)
> **Entry points:** `/sign-in` · `/sign-up` · `/forgot-password` · `/reset-password` · `/profile/[id]/edit` · `/verify-email` · `/api/auth/[...nextauth]` · `/api/verify-email`
> **Depends on:** [AUTHENTICATION](../../../docs/AUTHENTICATION.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** Email-change submission rechecked on 2026-10-07 at `218d5aa` plus this fix; other account contracts retain the 2026-10-03 `6e06634` audit. Source verification is separate from runtime/UI below.

The APP application supplies consumer accounts. Zod auth schemas parse account inputs. Verified active APP_USER accounts use app.session-token; Google may create password=null accounts. Token fields are hashed/expiring; nullable password originated in 20260331141146_nullable_password.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/auth.actions.ts](../src/actions/auth.actions.ts) `login` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/schemas/auth.schema.ts](../src/schemas/auth.schema.ts) `getSignUpSchema` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/schemas/auth.schema.ts](../src/schemas/auth.schema.ts) `getSignUpSchema` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/auth.actions.ts](../src/actions/auth.actions.ts) | `login`, `signUp`, `resetPassword`, `changePassword`, `requestEmailChange`, `deleteAccount` | Authenticated mutation orchestration |
| [src/auth.ts](../src/auth.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/schemas/auth.schema.ts](../src/schemas/auth.schema.ts) | See exports/component in file | Input validation and defaults |
| [src/components/auth/change-email-dialog.tsx](../src/components/auth/change-email-dialog.tsx) | `ChangeEmailDialog` | Independent email-change form inside the profile editor |
| [src/components/memorial-edit-form.tsx](../src/components/memorial-edit-form.tsx) | `MemorialEditForm` | Profile editing and the contact section containing the email dialog |

## Rules and why

Shared authorize checks active status, verified email and password lockout; five failures lock for fifteen minutes (packages/auth/src/authorize.test.ts). Password confirmation gates changePassword/requestEmailChange/deleteAccount; origin not recorded.

The email dialog stops its own submit event from bubbling into the profile form. React events follow the component tree even when Dialog renders its content through a portal. Without that boundary, React Hook Form prevents the email action and validates or saves unrelated profile fields. Submitting by button or Enter must leave the profile draft untouched and display errors returned by `requestEmailChange` inside the dialog. Do not prevent the default React form action when isolating this event.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

Zod auth schemas parse account inputs. Verified active APP_USER accounts use app.session-token; Google may create password=null accounts. Token fields are hashed/expiring; nullable password originated in 20260331141146_nullable_password.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

`requestEmailChange` accepts only `newEmail` and `currentPassword` from the dialog. It resolves the account from `verifySession`, trims/validates the email with the shared `ChangeEmailSchema`, enforces five attempts per IP per hour, checks the stored password and rejects the current or an already-used address. Incorrect passwords return `fieldErrors.currentPassword`; current/duplicate addresses return `fieldErrors.newEmail`. It replaces only that account's pending `CHANGE` tokens, stores a SHA-256 token hash expiring in one hour and sends the confirmation link to the proposed address. The current email is unchanged until `/verify-email` applies the new address and consumes the token in a transaction. This fix changes no server authorization, password policy or database schema.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `AppUser` | `app_users` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `EmailToken` | `email_tokens` | [0_init](../../../packages/db/prisma/migrations/0_init/migration.sql) |
| `PasswordResetToken` | `password_reset_tokens` | [0_init](../../../packages/db/prisma/migrations/0_init/migration.sql) |
| `RateLimitAttempt` | `rate_limit_attempts` | [20260520000000_rate_limit_attempts](../../../packages/db/prisma/migrations/20260520000000_rate_limit_attempts/migration.sql) |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/sign-in` | [src/app/(auth)/sign-in/page.tsx](../src/app/(auth)/sign-in/page.tsx) |
| GET | `/sign-up` | [src/app/(auth)/sign-up/page.tsx](../src/app/(auth)/sign-up/page.tsx) |
| GET | `/forgot-password` | [src/app/(auth)/forgot-password/page.tsx](../src/app/(auth)/forgot-password/page.tsx) |
| GET | `/reset-password` | [src/app/(auth)/reset-password/page.tsx](../src/app/(auth)/reset-password/page.tsx) |
| GET | `/profile/[id]/edit` | [src/app/(public)/profile/[id]/edit/page.tsx](../src/app/(public)/profile/[id]/edit/page.tsx) |
| GET | `/verify-email` | [src/app/(auth)/verify-email/page.tsx](../src/app/(auth)/verify-email/page.tsx) |
| GET, POST | `/api/auth/[...nextauth]` | [src/app/api/auth/[...nextauth]/route.ts](../src/app/api/auth/[...nextauth]/route.ts) |
| GET | `/api/verify-email` | [src/app/api/verify-email/route.ts](../src/app/api/verify-email/route.ts) |

| Setting | Default | Validation / owner | Consequence |
| --- | --- | --- | --- |
| Shared settings | See [CONFIGURATION](../../../docs/CONFIGURATION.md) | Consumer modules resolve shared config rather than a feature-specific env schema | Restart/rebuild as documented |

## How to test it (AI-runnable)

Run commands from the repository root `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Install workspace dependencies first.

| Layer | Command | Needs | Cost | Proves |
| --- | --- | --- | --- | --- |
| Unit (deterministic) | `pnpm test` | Workspace install; root Vitest supplies an unreachable dummy DB URL | Free, seconds | Named mocked action/HTTP and policy cases in the specs below |
| Component / submit isolation | `pnpm exec vitest run --project app apps/app/src/components/auth/change-email-dialog.test.tsx` | Workspace install, including APP's happy-dom dev dependency | Free, seconds | Real React action dispatch and Dialog portal; independent email payload, untouched parent form and inline password error with a mocked server action |
| Contract / schema | `pnpm check:schema-parity` | Workspace install | Free, seconds | One canonical Prisma schema; feature input constraints are only proven when a schema spec is listed |
| Golden / replay | n/a: no complete recorded-provider replay fixture | Hand-authored recorded responses; cache misses must fail | Not run | Model regression is not applicable; provider/data drift remains an integration limit |
| End-to-end / harness | n/a: no feature-specific isolated browser harness | See prerequisites below | Local/free when prerequisites exist | Requires the described feature scenario |
| Offline evidence | `node scripts/check-docs.mjs` | Repository docs | Free, seconds | Paths, links, headings, metadata and indexes; it cannot verify pixels or business outcomes |
| Manual product QA | `node scripts/local-qa.mjs` → scenarios below | Local PostgreSQL, relevant app; Azurite for media; fixture Credentials identity | Local/free; real providers need test accounts | Visible result plus save/reload or independently checked persisted effect |

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/auth.actions.test.ts](../src/actions/auth.actions.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**2026-10-07 regression:** [src/components/auth/change-email-dialog.test.tsx](../src/components/auth/change-email-dialog.test.tsx) mounts the actual dialog under a parent form that cancels submission. Both tests failed before the fix because that parent received the event, then passed after the fix. The full suite passed with 842 tests and one explicit Azurite skip. These component tests mock only the server action and translations; local PostgreSQL and mail-fixture evidence is separate below.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run APP and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Sign in at /sign-in using the local identity, open /home and /profile; sign out and revisit /home. Expect authenticated pages then a sign-in redirect.
2. **Boundary:** Use one wrong password. Expect rejection and no authenticated session; avoid repeated attempts that alter lockout.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

For email-change regression QA, use the normal local Credentials account and an isolated mail capture service (a loopback `RESEND_BASE_URL` plus a dummy key in the launcher's child environment; never real delivery credentials). Open `/profile/<local-account-id>/edit`, leave the required birth/gender fields incomplete and edit the first name without saving. In Contact → Change email, submit a different `.test` address with a wrong password: expect the password error inside the dialog, no token and no profile write. Retry with the fixture password using Enter: expect the link-sent message, exactly one pending hashed `CHANGE` token and the old email still stored. Follow the captured confirmation link: expect “E-mail alterado!”, the new stored email and no remaining token. Reload the profile and confirm the unsaved name was not persisted. Restore the original address through the same request/confirmation flow. A loopback mail capture proves the SDK request and account transition, not real Resend acceptance or inbox delivery.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | pass: Credentials sign-in → /home; normal sign-out → protected /home redirected to /sign-in. This does not verify signup/reset/OAuth. | The named scenario passed within the listed limits. Remaining scenarios are n/a until their prerequisites exist. | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |
| 2026-10-07, `218d5aa` + email fix | Local isolation overlay on APP port 3200; normal Credentials sign-in; loopback mail sink on 3105 | Wrong password rejected inline; valid Enter submission generated the confirmation; captured link changed the email and consumed its token; unsaved profile name stayed unchanged. | Real database and browser exercised; real mailbox delivery remains n/a. | [Email-change audit](../../../docs/audits/APP-EMAIL-CHANGE-2026-10-07.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/app/src/actions/auth.actions.ts apps/app/src/auth.ts apps/app/src/schemas/auth.schema.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `ACCOUNTS-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### ACCOUNTS-G1: OAuth-only account management

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** changePassword, requestEmailChange and deleteAccount require a stored password, while Google users may have password=null.
- **Impact:** OAuth-only users cannot complete these operations.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Add a provider reauthentication design and independent tests; current behavior is unchanged.

### ACCOUNTS-G2: Profile form cancels email-change submission

- **Status:** fixed
- **Found:** 2026-10-07, user screenshot and source at `218d5aa`.
- **Evidence:** `ChangeEmailDialog` is rendered below `MemorialEditForm` in the React tree. Its portaled form's submit event reaches the parent's React Hook Form handler. With an incomplete profile, the user sees “Corrija os campos destacados.” behind the dialog and the email action never runs.
- **Impact:** A valid email/password cannot request confirmation; a valid parent form can instead save unrelated pending profile edits.
- **Root cause:** Portals relocate DOM nodes but do not isolate React event propagation. The parent handler calls `preventDefault`, cancelling React's email form action.
- **Resolution:** The dialog form calls `stopPropagation` without cancelling its own action. The real-portal component regression checks isolated submission and the inline password error. Local browser/DB/mail-capture scenarios are recorded in the audit above.
- **Commit:** The commit introducing this entry and `change-email-dialog.test.tsx`, based on `218d5aa`.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | pass: Credentials sign-in → /home; normal sign-out → protected /home redirected to /sign-in. This does not verify signup/reset/OAuth. | Only the named exercised behavior is verified. |
| 2026-10-07 | `218d5aa` + email-change fix | Source trace and real-portal regression | Rechecked history since `6e06634` and the current dialog → profile form → session/schema/action → token → email adapter → confirmation route. Two tests reproduced the cancellation before the fix and passed afterward. Full suite: 842 passed, one opt-in skip. APP typecheck, lint (eight existing warnings) and production build passed; documentation checks passed. | Server contracts unchanged; other concurrent workspace edits are outside this fix. |
| 2026-10-07 | Same email-change fix | Local browser, PostgreSQL and mail sink | Invalid password, valid button/Enter submission, pending token, confirmation/consumption and independent profile persistence checks exercised. | See the dated audit for restoration, process ownership and the real-delivery limitation. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [AUTHENTICATION](../../../docs/AUTHENTICATION.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md)
