# BMS partner email destination — 2026-10-14

## Request and source

Business partners registered in BMS must receive Sequoia access, while final consumers use APP. The user requested environment-based domains and did not have the original email link available.

The session began on `main` at `58d4145`, with a clean working tree. Source changes since onboarding revision `2632307` were checked. The independent B2B sidebar change advanced the shared branch to `1535974` during this work. Other APP/SEQ and disk-audit edits were present during validation and are outside this change.

The traced path is `/customers/new` → `CustomerNewForm` → `createCustomer` → privileged `verifyAdmin` → `getCustomerCreateSchema` → atomic Tenant/OWNER creation → BMS email adapter → shared credential template → Resend. Resend and legacy activation use the same Sequoia URL reader. OWNER is a staff `User`; the consumer branch uses `AppUser` and its separate APP mail adapter. No schema, entitlement, permission or stored identity change was needed.

Before this change, both partner paths already read `SEQUOIA_URL`, but passed it through unchecked. A fixture setting it to `APP_URL` generated an APP link; empty/invalid settings also reached the provider. This reproduces an allowed configuration failure, not the proven historical cause of the user's unavailable message.

`apps/bms/src/lib/email.ts` now requires all three product settings to be absolute HTTP(S) origins. It normalizes whitespace/root slash, rejects embedded credentials, paths, queries and fragments, and rejects a Sequoia origin equal to APP or BMS. It supplies the validated Sequoia origin to both existing partner templates. No domain or fallback URL was added to application code. Invalid configuration fails before transport; the existing action retains committed registration with email pending, or returns resend failure.

## Automated checks

| Check | Observed result | Scope / limit |
| --- | --- | --- |
| New adapter tests against the previous implementation | 21 failed, four passed | Demonstrated missing configuration boundary and root-slash normalization; no external provider call |
| Adapter and customer action tests after the fix | 45 passed | 25 new tests use actual templates with only Resend mocked; 20 existing action tests cover registration/permissions/recovery |
| `pnpm test` | 137 files / 1,299 tests passed; six files / 40 integration tests skipped | Shared working tree at execution time; skipped integrations are not passes |
| `pnpm db:generate` | Passed, once before compile checks | Canonical shared Prisma client; no schema/database migration |
| BMS TypeScript | Passed | `pnpm --filter @genealogiq/bms typecheck` |
| BMS lint | Passed, zero errors / 21 existing warnings | Warnings include existing React Hook Form memoization and unused values |
| BMS isolated production build | Passed | Compilation, TypeScript and 35-page generation completed after an interrupted first attempt; providers disabled, separate `.next-qa-partner-email-build`, no standalone copy or deployed image |
| Documentation / whitespace | Passed | `node scripts/check-docs.mjs` and the owned `git diff --check`; final check repeated after audit/cleanup edits |

Literal expectations cover production-shaped Sequoia credential/setup links, distinct loopback ports, APP consumer/BMS staff preservation, and missing/invalid/colliding Sequoia settings. Expected business outputs are not generated from the tested adapter.

## Local runtime and persistence

The existing loopback PostgreSQL service and documented local administrator were reused. Owned BMS/SEQ launchers used ports 6001/6002 and separate ephemeral normal authentication sessions. A local Resend-compatible server accepted only `seq-routing-…@genealogiq.test` fixture recipients; real provider keys were disabled. Requests used the apps' normal Credentials endpoint and compiled server actions. These are HTTP/runtime observations, not browser UI observations.

| Scenario | Independent expected result | Observed |
| --- | --- | --- |
| New company with zero initial GenCodes | One active OWNER, no APP identity or credit grant; credential link `http://localhost:6002/sign-in` | Passed; database hash matched the captured initial password |
| Duplicate company registration | Rejection and exactly one tenant for the submitted tax ID | Passed |
| Partner resend | Setup link on `http://localhost:6002/reset-password`; hashed staff token valid for 72 hours; current password unchanged | Passed; token points to User with no AppUser reference |
| Rejected mail provider | Successful, single active registration with `emailPending=true` | Passed with a local HTTP 422 rejection |
| Incorrect SEQ password | No authenticated session; protected dashboard redirects to sign-in | Passed; Next streamed its `/sign-in` redirect in HTTP 200 |
| Captured initial password | Normal SEQ Credentials login and dashboard reload | Passed |
| Resent setup link | Password saved, redirect to SEQ `/sign-in?reset=true`, normal login with the new password | Passed; database password verified independently |
| Replay of used setup token | Rejection | Passed |

An initial SEQ dev process exited with a memory allocation error while multiple checks/apps were active. The owned BMS launcher was stopped after its scenarios, then SEQ was restarted and all SEQ scenarios completed. Early HTTP harness assumptions about an unauthenticated null session and Next's streamed redirect were corrected; neither was an application regression.

Ignored local evidence is under `.local-qa/partner-email-2026-10-14/`: test/lint/typecheck/build summaries, mail captures and runtime results. Fixture passwords, setup tokens and session cookies are not included in this audit.

## UI and production limits

Chrome integration returned `Codex auth token is unavailable` before creating the test tab. UI is n/a: reconnect Chrome to Codex, then exercise the company wizard and actual email-link navigation, including rejected/used-link feedback. The in-app browser was not used. HTTP rendering and successful Credentials sessions do not substitute for those visual checks.

Read-only Azure inspection found the subscription Enabled and the current BMS image `462f8a976ee02156f34e989778abdb00313baa57` on revision `ca-genealogiq-bms-prod--0000013`. BMS settings already contained `APP_URL=https://genealogiq.com.br`, `BMS_URL=https://bms.genealogiq.com.br`, `SEQUOIA_URL=https://sequoia.genealogiq.com.br` and the BMS `AUTH_URL`. The current production Sequoia sign-in returned HTTP 200 on its own origin. These current observations do not establish what a past message contained or which environment generated it.

No cloud setting, production account or external email was changed. No push/deployment was performed. A previously delivered email retains its original link; recovery uses the existing resend flow after confirming the serving configuration. Production inbox delivery and the historical message remain unverified.

## Cleanup

Owned BMS/SEQ launchers and the local mail fixture were stopped; the build process completed. No listener remains on the owned 5105/6001/6002 ports. Only this session's 6001/6002 and partner-email-build generated TypeScript includes were removed; other sessions' includes and source edits were preserved. The pre-existing PostgreSQL service and other agents' processes/data were retained. The disposable local partner records remain for audit; there was no ledger grant to remove. Build output and local evidence remain ignored.
