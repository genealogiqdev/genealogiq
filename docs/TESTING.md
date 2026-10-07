# Tests, fixtures and product verification

> **Code:** [Vitest projects](../vitest.config.ts), [Playwright](../playwright.config.ts), [local launcher](../scripts/local-qa.mjs), app/package specs, [checks](../package.json).
> **Last source verification:** 2026-10-03 at `6e06634` + current docs, launcher and tests.

Run every command below from `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Test/source/runtime/UI layers prove different things; only the exercised layer gets a pass.

## Safe deterministic checks

| Layer | Command | Prerequisite | Latest observed result / scope |
| --- | --- | --- | --- |
| Unit/schema/helper/mock action | `pnpm test` | Installed workspace | 101 files passed, 840 tests passed; one Azurite file/test skipped by default |
| Reviewed APP text recovery | `node --test scripts/azure/tests/repair-app-text.test.cjs` | Node.js >=22; no database | 12 tests cover strict UTF-8 input, intact text/punctuation, allowed targets, read-only preview, atomic stale-row rejection, idempotence and receipt-scoped rollback |
| Single schema | `pnpm check:schema-parity` | Repository files | Pass; one packages/db schema, no app duplicates |
| Migration shape | `pnpm check:migrations` | Repository files | Pass; 74 SQL files uniquely ordered; does not replay DDL |
| Locale key parity | `pnpm check:i18n-parity` | Nine locale JSON files | Pass across APP/BMS/SEQ |
| Locale references | `pnpm check:i18n-keys` | Source and locale files | Zero errors; 79 dynamic calls skipped and one unmapped columns file |
| Documentation contracts | `node scripts/check-docs.mjs` | Guides/feature docs | Verifies indexed files, relative source/doc links, required sections, source references and gap format; ignored .local-qa evidence links are counted separately and optional in a fresh checkout |
| Prisma generation | `pnpm db:generate` | DATABASE_URL, installed Prisma | Run once before compile/schema checks; sequential with other generation |
| TypeScript | `pnpm typecheck` | Generated client | All apps/packages checked; final result in audit |
| ESLint | `pnpm lint` | Installed workspace | Existing warnings retained; final counts in audit |
| Production build | `pnpm build` | Stopped dev servers, generated client, isolated local env | Compile/prerender result recorded in audit; not a production PWA or cloud integration pass |

Root Vitest provides DATABASE_URL=postgresql://unit:unit@127.0.0.1:1/unit. This unreachable endpoint permits imports needing Prisma while ensuring an accidentally unmocked query fails instead of touching real data. The seven project names are app, bms, seq, core, auth, services and email; each app resolves @ to its own src and stubs Next marker imports. Async Server Components and browser interactions require runtime/UI tests rather than pretending these Node specs render the full app.

The 2026-10-03 added specs pin activity viewer scope, daily bearer/independent-step behavior, QR input/429/atomic arguments, company permission/input rejection, cash/installment/trial constraints, checkout tenant/locale/callbacks, dashboard independent aggregate rows, and email escaping/base URL/thrown transport errors. They do not pin a success for missing integrations or bless the recorded permission/provider-error gaps.

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
- **Resolution:** Not fixed. Implement the smallest isolated fixture per feature and preserve independent expected answers; see linked feature gaps.

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

## Related

[AGENTS.md](../AGENTS.md) · [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [OBSERVABILITY](OBSERVABILITY.md) · [GAPS](GAPS.md) · [Dated audit](audits/AGENT-MEMORY-2026-10-03.md)
