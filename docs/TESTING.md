# Tests, fixtures and product verification

> **Code:** [Vitest projects](../vitest.config.ts), [Playwright](../playwright.config.ts), [local launcher](../scripts/local-qa.mjs), app/package specs, [checks](../package.json).
> **Last source verification:** 2026-10-09 at `462f8a9`; final local and cloud results are in the consolidated release audit. Earlier observations remain in the verification log.

Run every command below from `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Test/source/runtime/UI layers prove different things; only the exercised layer gets a pass.

## Safe deterministic checks

| Layer | Command | Prerequisite | Latest observed result / scope |
| --- | --- | --- | --- |
| Unit/schema/helper/mock action | `pnpm test` | Installed workspace | 2026-10-07 consumer access: 111 files / 969 tests passed; four opt-in integration files / 22 tests skipped |
| Reviewed APP text recovery | `node --test scripts/azure/tests/repair-app-text.test.cjs` | Node.js >=22; no database | 12 tests cover strict UTF-8 input, intact text/punctuation, allowed targets, read-only preview, atomic stale-row rejection, idempotence and receipt-scoped rollback |
| Single schema | `pnpm check:schema-parity` | Repository files | Pass; one packages/db schema, no app duplicates |
| Migration shape | `pnpm check:migrations` | Repository files | Pass; 76 SQL files uniquely ordered; does not replay DDL |
| Locale key parity | `pnpm check:i18n-parity` | Nine locale JSON files | Pass across APP/BMS/SEQ |
| Locale references | `pnpm check:i18n-keys` | Source and locale files | Zero errors; 84 dynamic calls skipped and one unmapped columns file |
| Documentation contracts | `node scripts/check-docs.mjs` | Guides/feature docs | Verifies indexed files, relative source/doc links, required sections, source references and gap format; ignored .local-qa evidence links are counted separately and optional in a fresh checkout |
| Prisma generation | `pnpm db:generate` | DATABASE_URL, installed Prisma | Run once before compile/schema checks; sequential with other generation |
| TypeScript | `pnpm typecheck` | Generated client | All apps/packages checked; final result in audit |
| ESLint | `pnpm lint` | Installed workspace | Existing warnings retained; final counts in audit |
| Production build | `pnpm build` | Stopped dev servers, generated client, isolated local env | Compile/prerender result recorded in audit; not a production PWA or cloud integration pass |

Root Vitest provides DATABASE_URL=postgresql://unit:unit@127.0.0.1:1/unit. This unreachable endpoint permits imports needing Prisma while ensuring an accidentally unmocked query fails instead of touching real data. The seven project names are app, bms, seq, core, auth, services and email; each app resolves @ to its own src and stubs Next marker imports. Async Server Components and browser interactions require runtime/UI tests rather than pretending these Node specs render the full app.

The 2026-10-03 added specs pin activity viewer scope, daily bearer/independent-step behavior, QR input/429/atomic arguments, company permission/input rejection, cash/installment/trial constraints, checkout tenant/locale/callbacks, dashboard independent aggregate rows, and email escaping/base URL/thrown transport errors. They do not pin a success for missing integrations or bless the recorded permission/provider-error gaps.

## Consolidated release checks, 2026-10-09

[email-outbox.integration.test.ts](../packages/services/src/email-outbox.integration.test.ts) opts in with EMAIL_OUTBOX_TEST_DATABASE_URL and enforces the same loopback / genealogiq_coupon_qa_* database guard. Apply the exact revocation and email-outbox SQL migrations to a disposable local copy before running it. Six real PostgreSQL cases exercise immutable receipts, concurrent workers, provider-failure retry, transactional rollback, changed email and undo/resale suppression. The transport is a synthetic mock; no actual recipient is emailed. Run it with the existing consumer grant/revocation and manual-coupon integration suites using --no-file-parallelism because the tests add temporary failure constraints to that disposable database.

The [release audit](audits/PRODUCTION-RELEASE-2026-10-09.md) records final suite, generation, typecheck, lint, guards, production builds and local HTTP evidence. Browser automated QA was explicitly waived for this release. A successful build/health endpoint is not recorded as feature UI verification. Production images and data repair have their own evidence after deployment.

## Real local manual-coupon transactions

Consumer Premium revocation adds [consumer-revoke.integration.test.ts](../packages/services/src/consumer-revoke.integration.test.ts), using the same guarded `CONSUMER_ACCESS_TEST_DATABASE_URL` disposable loopback copy. Apply `20261009010000_consumer_access_revocation` to that copy and run `pnpm exec vitest run --project services packages/services/src/consumer-access.integration.test.ts packages/services/src/consumer-revoke.integration.test.ts`. Revocation cases verify paid/FREE fallback, preserved audit/identity, the canceled legacy test sale, concurrent operators, fresh and stale requests, recipient/payment boundaries and rollback after a failing audit update. The failure CHECK is added only in the disposable database. [Revocation audit](audits/CONSUMER-REVOCATION-2026-10-09.md).

For the 2099/2100 expiry regression, the consumer integration suite now has 11 cases, including exact migration-origin replacement, real paid-through preservation and rollback. In the same disposable loopback database, run `node --test scripts/azure/tests/repair-premium-test-expiry.integration.test.cjs` with `CONSUMER_ACCESS_TEST_DATABASE_URL`. Four scenarios (five Node entries including the parent) check read-only preview, actual date/audit correction, tenant/payment/lookalike exclusion, stale-preview rejection, complete rollback and leap-day clamping. The script adds a temporary failure CHECK only to that disposable database. [Expiry audit](audits/CONSUMER-EXPIRY-2026-10-08.md).

The [direct consumer integration suite](../packages/services/src/consumer-access.integration.test.ts) uses the same disposable loopback-copy preparation, with `CONSUMER_ACCESS_TEST_DATABASE_URL` instead of the coupon variable. Apply the consumer access migration to that copy, then run `pnpm exec vitest run --project services packages/services/src/consumer-access.integration.test.ts`. Nine cases cover finite Premium without purchases, concurrency, existing-account preservation, partner/Stripe rejection, final-audit rollback, deletion retention and renewal after expiry. The suite temporarily adds a failure constraint to its disposable database; never target the normal local database. Source, test, runtime and UI results are retained in the [consumer access audit](audits/CONSUMER-ACCESS-2026-10-07.md).

[manual-coupon.integration.test.ts](../packages/services/src/manual-coupon.integration.test.ts) opts in only with `MANUAL_COUPON_TEST_DATABASE_URL`. It rejects non-loopback hosts and database names outside `genealogiq_coupon_qa_*` before connecting. Use a disposable copy of the already migrated **local** schema with Gen2026 provisioned by the migration. Do not point it at the normal local database or a deployed database. The legacy empty-database migration limitation in [DATABASE](DATABASE.md) still applies.

One repeatable preparation is to dump the known loopback local database with `pg_dump` inside the identified `genealogiq-postgres` container, create a uniquely named `genealogiq_coupon_qa_*` database in that same container, and restore the dump there. Keep the dump inside the container or use byte-preserving file transport; do not stream binary dumps through Windows PowerShell text pipelines. Confirm the new database name and Gen2026's manual mode before running. This uses local fixtures only and must not restore over an existing database.

In a dedicated terminal, with the explicit URL of that disposable database:

```powershell
$env:MANUAL_COUPON_TEST_DATABASE_URL = 'postgresql://genealogiq:genealogiq@127.0.0.1:5432/genealogiq_coupon_qa_<unique_run>'
pnpm exec vitest run --project services packages/services/src/manual-coupon.integration.test.ts
```

The eight real PostgreSQL cases independently expect: old stock 5 + 2 = 7 under simultaneous retry; one duplicate-reference rejection; annual renewal with 6 rollover + 20 annual credits = 26; a finite zero-due B2C sale; exactly one winner at a one-use coupon cap; rejection of overlapping Stripe entitlement; rejection of malformed manual coupon terms by the SQL constraint; complete rollback when the audit insert fails; and consumer account deletion with the receipt, usage count and retry identity retained. Some tests assert multiple outcomes. The suite creates unique fixture records and disconnects; drop only its identified disposable database afterward. It never calls Stripe. The [2026-10-07 audit](audits/GEN2026-2026-10-07.md) records eight passes against the replayed final migration, separately from the default suite and browser acceptance.

## Real local Azure storage integration

Start compose and run this in a dedicated PowerShell terminal so the opt-in environment does not accidentally apply to a later whole suite:

```powershell
pnpm db:up
$env:RUN_AZURITE_TESTS = "true"
$env:AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true"
$env:MEDIA_PUBLIC_BASE_URL = "http://127.0.0.1:10000/devstoreaccount1/media"
pnpm exec vitest run --project services packages/services/src/media-storage.integration.test.ts
```

Observed: one test passed. It uses a hand-authored twelve-byte PNG signature, creates a unique integration prefix, rejects overwrite through a create-only SAS, promotes the blob, independently expects public read 200, deletes its own object and independently expects 404. It does not demonstrate image decoding, every browser upload form, production managed identity or private-document authorization.

## Public browser smoke

1. Start the verified local BMS launcher in another terminal: `node scripts/local-qa.mjs --app=bms` (or the all-app baseline).
2. Install the pinned browser if absent: `pnpm exec playwright install chromium`.
3. Run `pnpm exec playwright test --project=public`.

Observed: three public smoke tests passed (sign-in form, pt-BR locale and unknown route). playwright.config.ts currently reuses an existing BMS listener at localhost:3001 outside CI. Use only the identified local launcher; the legacy fallback dev command and .env.e2e do not enforce database/provider isolation by themselves. The smoke result proves those public pages, not privileged CRUD or payments.

Authenticated CRUD is currently incomplete: e2e/packages.crud.spec.ts references retired /packages routes/translation namespaces, and coupon CRUD calls Stripe. The seed:e2e helper only checks DATABASE_URL presence, not locality. Do not claim a safe all-project run until [TESTING-G1](#testing-g1-legacy-authenticated-e2e-is-not-isolated-or-current) is fixed. The full three-app manual baseline uses the guarded seed-local path instead.

## Independent expected answers and replay

Use literal expect blocks and hand-authored fixture rows/cases. Reference values must not be generated from the tested feature's output. Saved provider replay has no complete current fixture; a new replay must fail on a cache miss rather than fetch a live response and declare it the answer. Preserve provider failures and dataset versions. No LLM inference/model test exists in this repository; data/provider drift remains a distinct diagnosis.

For dashboard/report scenarios independently aggregate raw row counts and money by currency before comparing UI output. For ledger scenarios compare grant.remainingQty, ledger transaction sums, reservations and activated-code bindings. For uploads compare actual bytes/read status, not just a returned URL. For editing verify save/reload and scoped DB rows. These checks prevent a rendered total or happy response from serving as its own oracle.

## Failure classification and evidence

| Observation | Classification | Action |
| --- | --- | --- |
| Missing DB/client/browser/test key/fixture | Prerequisite missing, n/a | Name exact missing service/data and remaining scenario |
| Mocked literal expectation changed | Code regression or intentionally revised contract | Trace change; update expectation only with independent rationale |
| Unit passes, provider response differs | Integration/provider/data regression | Save sanitized response/fixture version and diagnose transport |
| Readiness passes, UI save/reload fails | Product failure | Inspect action/query/scoped rows; open feature gap |
| Default Azurite skip | Opt-in integration not run | Run enabled command or report n/a; do not count skip as pass |
| Lint warnings/dynamic key skips | Known limited check | Retain warning/skip counts; do not call the check exhaustive |

Store raw local logs/screenshots/session evidence under ignored .local-qa; track a sanitized dated expected/observed summary. Append verification rows in feature docs and use permanent gap IDs. [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) defines the baseline UI/auth/persistence/cleanup sequence.

## Gaps and fixes

### TESTING-G1: Legacy authenticated E2E is not isolated or current

- **Status:** open
- **Found:** 2026-10-03, harness/source audit.
- **Evidence:** Playwright can reuse an arbitrary existing BMS server; .env.e2e absence falls back to ordinary env; seed:e2e checks only URL presence; package CRUD targets removed /packages; coupon CRUD calls Stripe.
- **Impact:** An all-project run can fail for stale routes or touch an unintended database/provider. Public smoke on the identified local launcher is narrower evidence.
- **Root cause:** Legacy harness assumptions predate local isolation and catalog route retirement.
- **Resolution:** Not fixed. Add fail-closed isolated server/DB/provider configuration, replace retired package scenarios and provision signed provider replay before enabling authenticated CRUD.

### TESTING-G2: No complete provider/database replay harness

- **Status:** open
- **Found:** 2026-10-03, feature inventory.
- **Evidence:** App/unit specs mock Prisma/SDK services; full Stripe, mail, ledger, media migration and two-tenant browser fixtures are absent.
- **Impact:** Unit success cannot prove locking races, signed event routing, provider delivery or cross-user product flows.
- **Root cause:** Test fixture coverage is incomplete.
- **Resolution:** Partially covered on 2026-10-07 by eight real manual-coupon transaction tests (locking, idempotency, rollover, entitlement, rollback and consumer deletion) and BMS/APP/SEQ browser scenarios. The complete signed Stripe/mail/media and daily-job replay remains absent; this gap stays open. Implement the smallest isolated fixture per remaining feature and preserve independent expected answers.

### TESTING-G3: Prisma imports failed without a test database URL

- **Status:** fixed
- **Found:** 2026-10-03, initial deterministic suite execution.
- **Evidence:** Two suites failed during Prisma-dependent imports when DATABASE_URL was absent.
- **Impact:** The documented plain pnpm test command was not self-contained.
- **Root cause:** Import-time client construction required a URL despite mocked query boundaries.
- **Resolution:** 2026-10-03, root vitest.config.ts supplies an unreachable loopback unit URL; the full suite passed with 840 tests and one explicit integration skip. Configuration is uncommitted.

### TESTING-G4: Several entry contracts had no direct deterministic coverage

- **Status:** fixed
- **Found:** 2026-10-03, feature inventory.
- **Evidence:** Activity actions, QR route, daily job route, company boundary, partner plan schema, SEQ checkout/dashboard and email transport lacked the added direct cases.
- **Impact:** Helper-only coverage did not establish those entry contracts.
- **Root cause:** Missing specs in those layers.
- **Resolution:** 2026-10-03, added eight spec files with 22 literal-expectation tests and the email Vitest project. Tests cover only their named cases; remaining provider/query/browser gaps stay open in feature docs. A new dashboard test's bigint literals were changed to BigInt(...) for the existing ES2017 TypeScript target; typecheck then passed. Changes are uncommitted.

## Verification log

| Date | Revision | Scope | Evidence / limits |
| --- | --- | --- | --- |
| 2026-10-03 | 6e06634 + new specs/config | Source and tests | pnpm test: 840 passed, one opt-in skip. New checkout test initially expected uppercase currency; corrected from the independent currencyForLocale contract to lowercase brl, then full suite passed. |
| 2026-10-03 | Same | Runtime/browser | Enabled Azurite one pass; public Playwright three passes. Manual baseline recorded separately; full integration/CRUD scenarios remain incomplete. |
| 2026-10-03 | 0353683 + final documentation/pointer changes | Final documentation check | node scripts/check-docs.mjs passed: four guides, 39 features, 2206 local source/doc links, 161 named references; 12 ignored local evidence links are optional. Final pnpm test: 840 passed, one opt-in skip. Schema/migration/i18n gates and git diff --check passed. |
| 2026-10-07 | 218d5aa + text repair/tests and concurrent working changes | APP text regression | Full pnpm test: 104 files / 894 tests passed, two integration files / six tests skipped. Focused document specs: 24 passed. Separate recovery command: 12 passed. Real local DB and browser evidence is recorded in [the text audit](audits/APP-TEXT-ENCODING-2026-10-07.md); these results do not establish production recovery. |
| 2026-10-07 | `9253152` + initial Gen2026 change | Initial deterministic and database validation | `pnpm test`: 905 passed, eight opt-in skips; separately enabled manual PostgreSQL suite: seven passed. Sequential typecheck passed 11 tasks; lint passed with 0 errors and 51 warnings. Schema/migration/nine-locale checks passed, with 83 dynamic references skipped. |
| 2026-10-07 | Same change plus audit retention and layout correction | Final regression validation | `pnpm test`: 906 passed, nine opt-in skips; separately enabled manual PostgreSQL suite: eight passed (40 combined with the 32 service unit cases). Builds, runtime/UI, cleanup and provider limits are recorded in the [Gen2026 audit](audits/GEN2026-2026-10-07.md). |
| 2026-10-07 | `b8afb94` + direct consumer access | Deterministic, local database and manual UI | Full suite: 969 passed / 22 opt-in skips; separately enabled consumer PostgreSQL suite: nine passed. Typecheck: 11 tasks passed. Final checks and normal BMS/APP happy, duplicate, mail failure/retry, existing-period and permission scenarios are recorded in the [consumer audit](audits/CONSUMER-ACCESS-2026-10-07.md). |

## Related

[AGENTS.md](../AGENTS.md) · [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [OBSERVABILITY](OBSERVABILITY.md) · [GAPS](GAPS.md) · [Dated audit](audits/AGENT-MEMORY-2026-10-03.md)
