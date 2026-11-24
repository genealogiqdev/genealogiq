# Mobile API and bearer sessions

> **Code:** [packages/auth/src/mobile.ts](../packages/auth/src/mobile.ts) · [packages/auth/src/session-token.ts](../packages/auth/src/session-token.ts) · [apps/app/src/mobile/views.ts](../apps/app/src/mobile/views.ts) · [apps/app/src/mobile/actions.ts](../apps/app/src/mobile/actions.ts) · [apps/bms/src/mobile/views.ts](../apps/bms/src/mobile/views.ts) · [apps/bms/src/mobile/actions.ts](../apps/bms/src/mobile/actions.ts) · [apps/seq/src/mobile/views.ts](../apps/seq/src/mobile/views.ts) · [apps/seq/src/mobile/actions.ts](../apps/seq/src/mobile/actions.ts) · [apps/mobile](../apps/mobile/AGENTS.md)
> **Entry points:** `POST /api/mobile/v1/auth/login`, `GET /api/mobile/v1/auth/me`, `GET /api/mobile/v1/views/<name>`, `POST /api/mobile/v1/actions/<name>` in each of APP, BMS and SEQ
> **Depends on:** [AUTHENTICATION](AUTHENTICATION.md) · [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [CONFIGURATION](CONFIGURATION.md) · [TESTING](TESTING.md) · [OBSERVABILITY](OBSERVABILITY.md) · [RUNBOOKS](RUNBOOKS.md)
> **Last verified against code:** 2026-11-23 at `8bde62d` plus this task's uncommitted mobile changes. Source, tests and runtime evidence are recorded separately below.

The Expo app in `apps/mobile` contains all three systems. The web apps have no REST API, so each Next.js app exposes a thin bridge that lets a native client sign in with a bearer token and call the app's existing queries and server actions. No business rule is duplicated: the bridge only authenticates, routes by name and translates thrown navigation into HTTP statuses.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Sign in with email and password | deterministic | [packages/auth/src/mobile.ts](../packages/auth/src/mobile.ts) `createMobileAuth` | A token, its expiry and the principal, or a coded error |
| 2 | Resolve the session for a request | deterministic | [packages/auth/src/mobile.ts](../packages/auth/src/mobile.ts) `withBearer` | Cookie session if present, otherwise the bearer session with a freshly loaded identity row |
| 3 | Route a read or a write by name | deterministic | [packages/auth/src/mobile.ts](../packages/auth/src/mobile.ts) `createViewRoute` | `{data}` or `{result, redirect?}`; coded 4xx errors |
| 4 | Run the page's guard and query, or the server action | deterministic | [apps/app/src/mobile/views.ts](../apps/app/src/mobile/views.ts) `views` | The same data and effects the web produces |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [packages/auth/src/mobile.ts](../packages/auth/src/mobile.ts) | `createMobileAuth`, `createViewRoute`, `createActionRoute`, `mobileErrorResponse` | Shared policy: token issue/read, operation bridge, error translation |
| [packages/auth/src/session-token.ts](../packages/auth/src/session-token.ts) | `buildSessionToken` | Shared policy: the JWT payload shape used by cookie and mobile sessions |
| [apps/app/src/mobile/actions.ts](../apps/app/src/mobile/actions.ts) | `actions`, `publicActions` | Authenticated mutation registry for APP |
| [apps/bms/src/mobile/actions.ts](../apps/bms/src/mobile/actions.ts) | `actions`, `publicActions` | Authenticated mutation registry for BMS |
| [apps/seq/src/mobile/actions.ts](../apps/seq/src/mobile/actions.ts) | `actions`, `publicActions` | Authenticated mutation registry for SEQ |
| [apps/seq/src/mobile/views.ts](../apps/seq/src/mobile/views.ts) | `views`, `publicViews` | Scoped data registry for SEQ (tenant always from the session) |
| [apps/bms/src/mobile/views.ts](../apps/bms/src/mobile/views.ts) | `views`, `publicViews` | Scoped data registry for BMS |

## Rules and why

- **A mobile token is not a cookie.** It is the session JWT encrypted with the app's `AUTH_SECRET` and the salt `<cookie name>.mobile`. A stolen cookie value cannot be replayed as a bearer token, a mobile token cannot be set as a cookie, and one app's token is useless against another app. Each system therefore needs its own sign-in.
- **The bearer path reloads the identity row on every request.** Deactivation, role changes, tenant removal and loss of the per-app gate (APP: `APP_USER`; BMS: staff scope; SEQ: has a tenant) apply immediately. The cookie path still reads the token snapshot; that pre-existing gap stays recorded in [AUTHENTICATION](AUTHENTICATION.md).
- **Sign-in keeps the web limits.** Ten attempts per five minutes per IP, the five-failure / fifteen-minute lockout, and the email-verified requirement. An unknown email and a wrong password are indistinguishable. `wrongSystem` is reported only after the password was correct.
- **Every view applies the guard of the page it mirrors.** Tenant and user ids come from the session, never from parameters. Views and actions require an `Authorization` header unless named in `publicViews` / `publicActions`.
- **The header requirement is the CSRF defence.** The guards would also accept a cookie session, but a custom header cannot be sent cross-site without a CORS preflight these routes never grant.
- **Names are an allowlist.** Lookups use own properties only, so `constructor` or `__proto__` answer 404.
- **Thrown navigation becomes a status.** A redirect to `/sign-in` (optionally with `callbackUrl`) is 401; `forbidden()` is 403; `notFound()` is 404; any other redirect is the action's success path and is returned as `redirect`. Unexpected errors are logged and answered with a generic 500.

## Contracts and data

| Method | Route or command | Router / handler |
| --- | --- | --- |
| POST | `/api/mobile/v1/auth/login` `{email, password}` → `{token, expiresAt, user}` | [apps/app/src/app/api/mobile/v1/auth/login/route.ts](../apps/app/src/app/api/mobile/v1/auth/login/route.ts) (same file in BMS and SEQ) |
| GET | `/api/mobile/v1/auth/me` → `{user, expiresAt}` | [apps/app/src/app/api/mobile/v1/auth/me/route.ts](../apps/app/src/app/api/mobile/v1/auth/me/route.ts) |
| GET | `/api/mobile/v1/views/<name>?<params>` → `{data}` | [apps/app/src/app/api/mobile/v1/views/[name]/route.ts](../apps/app/src/app/api/mobile/v1/views/[name]/route.ts) |
| POST | `/api/mobile/v1/actions/<name>` `{args?, form?}` → `{result, redirect?}` | [apps/app/src/app/api/mobile/v1/actions/[name]/route.ts](../apps/app/src/app/api/mobile/v1/actions/[name]/route.ts) |

Errors are `{ "error": { "code", "values"? } }` with codes `unauthorized`, `forbidden`, `notFound`, `invalidData`, `tooManyRequests`, `accountLocked`, `verifyEmailFirst`, `incorrectCredentials`, `wrongSystem`, `unknownOperation`, `serverError`. Action results are the apps' [ActionResult (`done`/`ok`/`fail`)](../packages/core/src/result.ts) with messages already localised from `Accept-Language`.

Registered operations: APP 38 views (12 public) and 60 actions (4 public); BMS 30 views and 51 actions (3 public); SEQ 28 views and 56 actions (3 public). `login`, `logout` and `setupSystem` are never registered. The typed client contracts are [apps/mobile/src/api/app.ts](../apps/mobile/src/api/app.ts), [bms.ts](../apps/mobile/src/api/bms.ts), [seq.ts](../apps/mobile/src/api/seq.ts) and [scan.ts](../apps/mobile/src/api/scan.ts).

The existing upload, search, WikiTree, suggestion and document-file routes accept the bearer token unchanged because each app's `auth()` is wrapped by `withBearer`.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `DevicePushToken` | `app_device_push_tokens` | [20261122000000_mobile_push_and_genealogy_scan](../packages/db/prisma/migrations/20261122000000_mobile_push_and_genealogy_scan/migration.sql) |
| `RateLimitAttempt` | `rate_limit_attempts` | Pre-existing; sign-in reuses the `signin:ip:<ip>` key |

| Setting | Default | Validation / owner | Consequence |
| --- | --- | --- | --- |
| AUTH_SECRET | required per app | mobile.ts | Signs mobile tokens; rotating it signs every device out of that system |
| EXPO_PUBLIC_APP_URL / EXPO_PUBLIC_BMS_URL / EXPO_PUBLIC_SEQUOIA_URL | local apps in development, production hosts in release | apps/mobile/src/config.ts | Which backend each system talks to; build-time values |
| EXPO_ACCESS_TOKEN | absent | apps/app/src/lib/expo-push.ts | Optional Expo push credential; absent still sends |

## How to test it (AI-runnable)

Run commands from the repository root `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Install workspace dependencies first.

| Layer | Command | Needs | Cost | Proves |
| --- | --- | --- | --- | --- |
| Unit (deterministic) | `pnpm test` | Workspace install | Free, seconds | Token round trip, lockout, rate limit, gate order, salt isolation, error translation, allowlist routing, per-app guard and registry coverage |
| Contract / schema | `pnpm check:schema-parity` and `node scripts/check-migrations.mjs` | Workspace install | Free, seconds | One canonical schema; the additive migration is well-formed |
| Mobile type and bundle | `pnpm --filter @genealogiq/mobile typecheck` then `pnpm --filter @genealogiq/mobile export:check` | Workspace install | Free, minutes | The app compiles and Metro can bundle every route |
| Offline evidence | `node scripts/check-docs.mjs` | Repository docs | Free, seconds | Paths, links, headings, metadata and indexes |
| Manual product QA | `node scripts/local-qa.mjs` → scenarios below | Local PostgreSQL and the three apps | Local/free | Real sign-in, guards and persistence over HTTP |

**Specs:** [packages/auth/src/mobile.test.ts](../packages/auth/src/mobile.test.ts) · [apps/app/src/mobile/registry.test.ts](../apps/app/src/mobile/registry.test.ts) · [apps/bms/src/mobile/registry.test.ts](../apps/bms/src/mobile/registry.test.ts) · [apps/seq/src/mobile/registry.test.ts](../apps/seq/src/mobile/registry.test.ts).

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. Do not generate a golden answer from the function being tested.

**Acceptance:** the happy path returns the stated data and persists the stated change, and every boundary rejects with the stated status without a write.

**Telling failures apart:** a 401 on every request after a launcher restart is expected (ephemeral `AUTH_SECRET`): sign in again. `unknownOperation` means the mobile build is newer than the server. A 500 is a server defect: read the Next terminal for the `[mobile-api]` line.

### Manual scenarios

1. **Happy path:** sign in to each system with the seeded identity; expect a token and the roles `APP_USER`, `SUPER_ADMIN`, `SUPER_ADMIN` (SEQ also returns the tenant). Read `home`, `dashboard` and `dashboard`.
2. **Boundary:** a wrong password answers 401 `incorrectCredentials`; a view without a token, with a garbage token or with another system's token answers 401; an action without the `Authorization` header answers 401; `views/__proto__` answers 404.
3. **Persistence/cleanup:** toggle a favourite twice and re-read `home` between calls: the list changes from one entry to none and back. Register and unregister a device token and count the rows.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-11-23, `8bde62d` + working changes | `node scripts/local-qa.mjs --port-offset=1000 --host=127.0.0.1` (port 3000 was occupied by an unrelated server); seeded identity; requests with curl | All three scenarios matched: tokens issued for the three systems; 401/404 boundaries as listed; favourites 1 → 0 → 1; device token rows 1 → 0; pt-BR and es-MX messages from `Accept-Language` | Pass over HTTP. Not exercised: a non-admin role over HTTP (covered by registry tests), the mobile app on a device or emulator | Recorded in this row; no screenshots |

## Runbooks

### Add or change an operation

1. Read this document and [apps/mobile/AGENTS.md](../apps/mobile/AGENTS.md).
2. Add the view or action to the app's registry. A view must call the same guard as the page it mirrors before any query, and take user and tenant ids from the session.
3. Add it to the typed contract in `apps/mobile/src/api/` and to the registry test's expected lists. Public names need an explicit reason.
4. Run `pnpm test`, the mobile type check and `node scripts/check-docs.mjs`; then the manual scenarios above.

### Release the mobile API to production

The only schema change is the additive migration `20261122000000_mobile_push_and_genealogy_scan` (two new tables). It runs in a named APP production build with `MOBILE_RELEASE_MODE=migrate` and `MOBILE_RELEASE_PROJECT` set to the APP project id, through [scripts/production-mobile-release.mjs](../scripts/production-mobile-release.mjs). The job refuses any other project, environment or database, requires that only this migration is pending, saves and reads back a private row snapshot, runs `prisma migrate deploy`, then checks the new columns, the status enum and a rolled-back write. Ordinary builds skip it. Deploy BMS and SEQ as ordinary builds. Tests: [scripts/tests/production-mobile-release.test.mjs](../scripts/tests/production-mobile-release.test.mjs) (`node --test`).

### Sign every device out of one system

Rotate that app's `AUTH_SECRET`. Mobile tokens and browser cookies for that system stop working; the other two systems are unaffected.

## Gaps and fixes

### MOBILE-API-G1: The mobile app has not been run on a device

- **Status:** open
- **Found:** 2026-11-23, initial implementation.
- **Evidence:** Type check, unit tests and the Android bundle pass; no emulator or device session was available on the build machine.
- **Impact:** Layout, gestures, camera, pickers, uploads, maps, printing and deep links are unverified at runtime.
- **Root cause:** No Android emulator or iOS build environment in this session.
- **Resolution:** Not fixed. Run the app with `pnpm --filter @genealogiq/mobile android` against the local apps and walk each system's screens.

### MOBILE-API-G2: Mobile sessions cannot be revoked individually

- **Status:** open
- **Found:** 2026-11-23, initial implementation.
- **Evidence:** Tokens are stateless and valid for 30 days; `createMobileAuth` has no token list.
- **Impact:** A lost device stays signed in until the account is deactivated, its role changes, or `AUTH_SECRET` rotates. A password change does not end existing sessions (the same holds for browser cookies).
- **Root cause:** Parity with the stateless cookie sessions.
- **Resolution:** Not fixed. A per-user token version checked in `readBearerSession` would allow "sign out everywhere".

### MOBILE-API-G3: Store payment rules are undecided

- **Status:** open
- **Found:** 2026-11-23, initial implementation.
- **Evidence:** Consumer plans and extra units open Stripe checkout in the in-app browser.
- **Impact:** Apple may reject a build that sells a digital subscription outside in-app purchase.
- **Root cause:** Product decision pending.
- **Resolution:** Not fixed. Either hide consumer purchasing on iOS or add in-app purchase before store submission.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-11-23 | `8bde62d` + uncommitted mobile work | Source trace and tests | Source: bridge, three registries, per-app `auth()` wrapping. Tests: `pnpm test` 1,849 passed, 71 skipped | None in tests |
| 2026-11-23 | Same | Local runtime over HTTP | The three manual scenarios above against ports 4000–4002 | Device run remains open (G1) |

## Related

[AUTHENTICATION](AUTHENTICATION.md) · [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [CONFIGURATION](CONFIGURATION.md) · [TESTING](TESTING.md) · [OBSERVABILITY](OBSERVABILITY.md) · [RUNBOOKS](RUNBOOKS.md) · [Mobile guide](../apps/mobile/AGENTS.md) · [GENEALOGY-SCAN](../apps/app/docs/GENEALOGY-SCAN.md)
