# Shared authentication, sessions and tenant authorization

> **Code:** [packages/auth/src/node.ts](../packages/auth/src/node.ts) · [packages/auth/src/edge.ts](../packages/auth/src/edge.ts) · [packages/auth/src/dal.ts](../packages/auth/src/dal.ts) · [packages/auth/src/authorize.ts](../packages/auth/src/authorize.ts) · [packages/auth/src/google.ts](../packages/auth/src/google.ts) · [packages/auth/src/lockout.ts](../packages/auth/src/lockout.ts) · [packages/auth/src/login.ts](../packages/auth/src/login.ts) · [packages/auth/src/authz.ts](../packages/auth/src/authz.ts)
> **Entry points:** `/api/auth/[...nextauth]`
> **Depends on:** [EMAIL-DELIVERY](EMAIL-DELIVERY.md) · [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [CONFIGURATION](CONFIGURATION.md) · [TESTING](TESTING.md) · [OBSERVABILITY](OBSERVABILITY.md) · [RUNBOOKS](RUNBOOKS.md)
> **Last verified against code:** 2026-10-03 at `6e06634`, including this task’s uncommitted documentation, launcher and test changes. Source verification is separate from runtime/UI below.

This shared module supplies shared authentication, sessions and tenant authorization. NextAuth creates a separate HTTP-only, SameSite=Lax cookie per app; JWT maxAge is 30 days. Node resolves credentials/OAuth identity; edge verifies sessions and redirects. createTenantDal reads tenant scope from session.user.customerId and returns the verified scope as top-level session.customerId. Google may create APP accounts but BMS/SEQ require an invited existing identity.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [packages/auth/src/node.ts](../packages/auth/src/node.ts) `createAuth` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [packages/auth/src/node.ts](../packages/auth/src/node.ts) `createAuth` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [packages/auth/src/authz.ts](../packages/auth/src/authz.ts) `ForbiddenError` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [packages/auth/src/node.ts](../packages/auth/src/node.ts) | `createAuth`, `buildSessionToken` | Shared policy or integration implementation |
| [packages/auth/src/edge.ts](../packages/auth/src/edge.ts) | `createEdgeAuthConfig` | Shared policy or integration implementation |
| [packages/auth/src/dal.ts](../packages/auth/src/dal.ts) | `createDal`, `createTenantDal` | Shared policy or integration implementation |
| [packages/auth/src/authorize.ts](../packages/auth/src/authorize.ts) | `authorizeUser` | Shared policy or integration implementation |
| [packages/auth/src/google.ts](../packages/auth/src/google.ts) | See exports/component in file | Shared policy or integration implementation |
| [packages/auth/src/lockout.ts](../packages/auth/src/lockout.ts) | See exports/component in file | Shared policy or integration implementation |
| [packages/auth/src/login.ts](../packages/auth/src/login.ts) | See exports/component in file | Shared policy or integration implementation |
| [packages/auth/src/authz.ts](../packages/auth/src/authz.ts) | See exports/component in file | Shared policy or integration implementation |

## Rules and why

Five password failures lock for fifteen minutes; login-IP limit is ten in five minutes (authorize/lockout tests and login.ts). Google identity requires verified email and normalized linking (a287674). Token role is a snapshot; privilege-sensitive mutations use the DAL, which checks the session role rather than reloading live user state.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

BMS now applies `isBmsStaff` as the shared Credentials/Google extra gate: tenant-owned staff cannot sign into BMS except the platform `SUPER_ADMIN` role, which tenant user forms cannot assign. Internal staff have `tenantId=null`. The [direct consumer workflow](../apps/bms/docs/CONSUMERS.md) also reloads current activation, role and tenant scope through `verifyConsumerAdmin` on every directory/mutation request; this rejects earlier tenant sessions and revoked operators for that feature. This narrower live check does not resolve AUTHENTICATION-G1 for all other existing routes.

NextAuth creates a separate HTTP-only, SameSite=Lax cookie per app; JWT maxAge is 30 days. Node resolves credentials/OAuth identity; edge verifies sessions and redirects. createTenantDal reads tenant scope from session.user.customerId and returns the verified scope as top-level session.customerId. Google may create APP accounts but BMS/SEQ require an invited existing identity.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `User` | `users` | [0_init](../packages/db/prisma/migrations/0_init/migration.sql) |
| `AppUser` | `app_users` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `EmailToken` | `email_tokens` | [0_init](../packages/db/prisma/migrations/0_init/migration.sql) |
| `PasswordResetToken` | `password_reset_tokens` | [0_init](../packages/db/prisma/migrations/0_init/migration.sql) |
| `RateLimitAttempt` | `rate_limit_attempts` | [20260520000000_rate_limit_attempts](../packages/db/prisma/migrations/20260520000000_rate_limit_attempts/migration.sql) |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| See handler | `/api/auth/[...nextauth]` | Entry description; scope/method varies by caller |

| Setting | Default | Validation / owner | Consequence |
| --- | --- | --- | --- |
| AUTH_SECRET | required outside the ephemeral launcher | createAuth / NextAuth | Signs each app session; changing it invalidates existing cookies. |
| AUTH_URL / AUTH_TRUST_HOST | app-local URL / false unless configured | NextAuth | Canonical localhost origin is required for cookies during local QA. |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | absent | googleCredentialsFromEnv | Provider only exists when both values are configured; local-qa disables it. |

Production canonical `AUTH_URL` values are `https://genealogiq.com.br`,
`https://bms.genealogiq.com.br`, and `https://sequoia.genealogiq.com.br`.
The APP `www` alias uses the apex callback origin. The DNS-gated
[cutover runbook](AZURE-DEPLOYMENT.md#dns-and-managed-tls) waits for managed TLS
and latest-revision readiness; external Google OAuth redirects require separate
provider configuration. [Live evidence](audits/AZURE-DOMAINS-2026-10-03.md)
verified Credentials callback origins and anonymous sign-in walls, not a
production login or Google authorization.

## How to test it (AI-runnable)

Run commands from the repository root `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Install workspace dependencies first.

| Layer | Command | Needs | Cost | Proves |
| --- | --- | --- | --- | --- |
| Unit (deterministic) | `pnpm test` | Workspace install; root Vitest supplies an unreachable dummy DB URL | Free, seconds | Named deterministic helper/query/schema cases in the specs below |
| Contract / schema | `pnpm check:schema-parity` | Workspace install | Free, seconds | One canonical Prisma schema; feature input constraints are only proven when a schema spec is listed |
| Golden / replay | n/a: no complete recorded-provider replay fixture | Hand-authored recorded responses; cache misses must fail | Not run | Model regression is not applicable; provider/data drift remains an integration limit |
| End-to-end / harness | n/a: no feature-specific isolated browser harness | See prerequisites below | Local/free when prerequisites exist | Requires the described feature scenario |
| Offline evidence | `node scripts/check-docs.mjs` | Repository docs | Free, seconds | Paths, links, headings, metadata and indexes; it cannot verify pixels or business outcomes |
| Manual product QA | `node scripts/local-qa.mjs` → scenarios below | Local PostgreSQL, relevant app; Azurite for media; fixture Credentials identity | Local/free; real providers need test accounts | Visible result plus save/reload or independently checked persisted effect |

**Specs included in the successful 2026-10-03 full-suite run:** [packages/auth/src/authorize.test.ts](../packages/auth/src/authorize.test.ts) · [packages/auth/src/authz.test.ts](../packages/auth/src/authz.test.ts) · [packages/auth/src/google.test.ts](../packages/auth/src/google.test.ts) · [packages/auth/src/lockout.test.ts](../packages/auth/src/lockout.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run the caller app(s) and PostgreSQL; storage scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Start all apps using local-qa, sign in separately at canonical localhost ports with the local fixture; save/reload an authorized field and then sign out. Expect separate cookie names and persisted scope.
2. **Boundary:** Open protected routes without each app cookie; expect a sign-in wall. One wrong password must not create a session.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | pass for the baseline: independent Credentials sign-in in all three apps, one scoped save/reload per staff app, and anonymous protected-route checks. OAuth, reset email, cross-tenant IDs and active-session revocation were not exercised. | The named scenario passed within the listed limits. Remaining scenarios are n/a until their prerequisites exist. | [Dated audit](audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- packages/auth/src/node.ts packages/auth/src/edge.ts packages/auth/src/dal.ts packages/auth/src/authorize.ts packages/auth/src/google.ts packages/auth/src/lockout.ts packages/auth/src/login.ts packages/auth/src/authz.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `AUTHENTICATION-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### AUTHENTICATION-G1: Session role revocation is not immediate

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** JWT carries a role/tenant snapshot and edge checks do not reload live user activation/role on every request.
- **Impact:** A revoked user can keep a session until a live DAL check or expiry; claims about immediate revocation are incorrect.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Define revocation/session version semantics and add active-session revocation tests.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | pass for the baseline: independent Credentials sign-in in all three apps, one scoped save/reload per staff app, and anonymous protected-route checks. OAuth, reset email, cross-tenant IDs and active-session revocation were not exercised. | Only the named exercised behavior is verified. |
| 2026-10-03 | `7d267f7` + domain configuration | Azure CLI, HTTP and production browser | Latest revisions ready; Credentials callbacks use the three new canonical origins, www uses apex; anonymous protected routes render sign-in on the new domains. [Cutover audit](audits/AZURE-DOMAINS-2026-10-03.md) | Google was absent from live provider discovery; production sign-in/OAuth and tenant mutations remain unverified. |
| 2026-10-07 | `b8afb94` + consumer platform scope | Source, tests and local Credentials/browser | BMS uses the shared extra gate for Credentials/Google; new consumer reads/actions also reload activation, role and tenant. Normal browser denied tenant OWNER sign-in and returned 403 for non-admin consumer access. | [Consumer audit](audits/CONSUMER-ACCESS-2026-10-07.md); Google and historical role revocation elsewhere remain unverified/open. |

## Related

[LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [CONFIGURATION](CONFIGURATION.md) · [TESTING](TESTING.md) · [OBSERVABILITY](OBSERVABILITY.md) · [RUNBOOKS](RUNBOOKS.md) · [Audit](audits/AGENT-MEMORY-2026-10-03.md) · [EMAIL-DELIVERY](EMAIL-DELIVERY.md)
