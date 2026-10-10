# Partner registry and invitations

> **Code:** [src/actions/customer.actions.ts](../src/actions/customer.actions.ts) · [src/queries/customers.ts](../src/queries/customers.ts) · [src/schemas/customer.schema.ts](../src/schemas/customer.schema.ts)
> **Entry points:** `/customers` · `/customers/new` · `/customers/[id]` · `/api/entity-name`
> **Depends on:** [AUTHENTICATION](../../../docs/AUTHENTICATION.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-07 at `2632307` for the immediate partner onboarding change. Source, tests, local runtime/UI and deployment evidence are separated in the onboarding audit linked below; earlier verification history is preserved.

The BMS application supplies partner registry and invitations. Customer forms describe a partner tenant and its contact/address fields; creation/invitation establishes SEQ staff access. Mutations check privileged BMS roles; taxId/email uniqueness is enforced by the Prisma schema and translated to form errors.

The `/customers` header includes **Clientes finais** for administrators, linking to the [global APP customer directory](CONSUMERS.md) at `/consumers`. That directory includes independent accounts and the customers of every SEQ partner. The partner table continues to represent Tenant records.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/customer.actions.ts](../src/actions/customer.actions.ts) `createCustomer` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/schemas/customer.schema.ts](../src/schemas/customer.schema.ts) `getCustomerSchema` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/queries/customers.ts](../src/queries/customers.ts) `getCustomers` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/customer.actions.ts](../src/actions/customer.actions.ts) | `createCustomer`, `updateCustomer`, `deleteCustomer`, `resendCustomerEmail`, `toggleCustomerActive` | Authenticated mutation orchestration |
| [src/queries/customers.ts](../src/queries/customers.ts) | See exports/component in file | Scoped data reads and output shaping |
| [src/schemas/customer.schema.ts](../src/schemas/customer.schema.ts) | See exports/component in file | Input validation and defaults |

## Rules and why

BMS customer means the partner Tenant; SEQ customer means the consumer AppUser. Mixing these changes both scope and billing ownership. customer.actions.test.ts covers permission and validation errors; 1125e1a separated the private shared database.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

### Final-consumer selection in the new-customer wizard

`/customers/new` includes **Guardião / Usuário Final** in **Segmento Genealogiq**. This selects the [consumer registration](CONSUMERS.md) contract: a person with App access and a complimentary Premium year. Steps 4 and 5 describe the App administrator/guardian and Premium permissions. Business tax identifiers, address, initial GenCodes and Sequoia module flags are absent from this branch. It calls `registerConsumer`, never `createCustomer`; no Tenant or staff User is created. The UI-only `FINAL_CONSUMER` value is deliberately excluded from `PARTNER_SEGMENTS`, so the partner action also rejects a forged submission.

The five partner segments retain their company/individual inputs, OWNER access, optional initial GenCodes and Sequoia modules. Switching the selector back to a partner segment restores the partner form. The common [stepper](../src/components/customers/customer-registration-steps.tsx) presents the correct product for each branch; the [segment selector](../src/components/customers/customer-segment-select.tsx) is only a registration choice, not an authorization boundary.

### Immediate access and initial GenCodes

New registration creates an active OWNER with a cryptographically generated password, persisted only as a bcrypt hash. The administrator email defaults to the partner contact email in the wizard and remains editable. After the transaction commits, `sendPartnerCredentialsEmail` sends that OWNER's email, initial password and SEQ sign-in URL. Access is independent of purchasing and also works with zero credits. Existing inactive accounts are not changed retroactively.

The administrator step accepts `initialGenCodes`, an integer from 0 to 10,000, default 0. `grantInitialGenCodes` in [partner-onboarding.ts](../../../packages/services/src/partner-onboarding.ts) writes a standalone TOPUP grant, one immutable GRANT transaction with the operator and registration reason, and exactly that many AVAILABLE codes. The credits expire after 12 calendar months and do not roll over. No order, coupon, subscription, charge or premium B2C trial is created. The tenant, OWNER, balance, ledger and codes share one transaction; zero skips all credit/code writes. Existing tenant taxId and OWNER email uniqueness prevent duplicate registrations. Credit history blocks deletion; use deactivation to preserve it.

Mail is outside the database transaction. A provider rejection leaves a successful registration with an explicit email-pending warning. Do not register again. Customers → Reenviar e-mail sends an expiring password-setup link to an active OWNER, including one whose initial password already exists; it does not overwrite the current hash, mint credits or repeat the registration. The original generated password is never retrievable from the database. The shared transport now rejects Resend's returned `error` as well as thrown errors.

### Historical payment-gated registration (superseded)

### Access after a manual settlement

Before immediate onboarding, registration stored the partner's OWNER inactive, without a password or invitation token. In addition to a verified Stripe payment, the [Gen2026 BMS action](DISCOUNT-COUPONS.md) calls `provisionTenantAccess` after an audited manual package/B2B settlement. This compatibility path still enables an existing inactive OWNER, creates a 72-hour password-setup token and invokes the existing welcome-mail adapter. An already active owner is left alone. A coupon does not create a second staff identity or change the customer's tenant.

A thrown provisioning/invitation error is reported as follow-up on a successful sale. The staff can inspect Customers and use `resendCustomerEmail` after fixing mail configuration; no second sale should be entered. The existing mail transport's reported-error and inbox-delivery gaps remain documented in [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md).

The [Gen2026 audit](../../../docs/audits/GEN2026-2026-10-07.md) verifies an inactive OWNER's login rejection before settlement and successful normal SEQ login with 20 funded codes afterward. The fixture supplies a known local password solely for QA. Real invitation delivery/password setup remains n/a with Resend disabled; this does not close PARTNERS-G1.

Customer forms describe a partner tenant and its contact/address fields; creation/invitation establishes SEQ staff access. Mutations check privileged BMS roles; taxId/email uniqueness is enforced by the Prisma schema and translated to form errors.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `Tenant` | `tenants` | Existing/introspected baseline; creation SQL not recorded in the current migration tree |
| `User` | `users` | [0_init](../../../packages/db/prisma/migrations/0_init/migration.sql) |
| `Address` | `addresses` | [20260403000000_expand_schema_address_categories](../../../packages/db/prisma/migrations/20260403000000_expand_schema_address_categories/migration.sql) |
| `EmailToken` | `email_tokens` | [0_init](../../../packages/db/prisma/migrations/0_init/migration.sql) |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/customers` | [src/app/(protected)/(records)/customers/page.tsx](../src/app/(protected)/(records)/customers/page.tsx) |
| GET | `/customers/new` | [src/app/(protected)/(records)/customers/new/page.tsx](../src/app/(protected)/(records)/customers/new/page.tsx) |
| GET | `/customers/[id]` | [src/app/(protected)/(records)/customers/[id]/page.tsx](../src/app/(protected)/(records)/customers/[id]/page.tsx) |
| GET | `/api/entity-name` | [src/app/api/entity-name/route.ts](../src/app/api/entity-name/route.ts) |

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

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/customer.actions.test.ts](../src/actions/customer.actions.test.ts) · [src/queries/redaction.test.ts](../src/queries/redaction.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run BMS and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

Current onboarding acceptance: create a partner with three initial GenCodes and capture its credential email in the loopback mail fixture; sign in to SEQ with the generated password, reload inventory and verify three funded codes with no order/contract. Create another with zero and verify access with empty inventory. Reject a negative/fractional quantity; simulate rejected mail, retain one registration/grant, and recover through the existing resend action. PostgreSQL tests also consume three credits, reject a fourth, verify rollback and reject a duplicate grant. Source/tests/runtime/UI evidence is appended in [the onboarding audit](../../../docs/audits/PARTNER-ONBOARDING-2026-10-07.md).

1. **Happy path:** Create a synthetic partner with a disposable invitation email, save and reload /customers/<id>; verify the Tenant and invited User share the intended tenant. Requires a test mail recipient.
2. **Boundary:** Submit a duplicate taxId or use an unprivileged viewer; expect a translated error with no second partner row. Requires role/duplicate fixtures.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: Requires a test mail recipient; Requires role/duplicate fixtures | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/bms/src/actions/customer.actions.ts apps/bms/src/queries/customers.ts apps/bms/src/schemas/customer.schema.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `PARTNERS-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### PARTNERS-G2: New customer wizard omitted the B2C segment

- **Status:** fixed
- **Found:** 2026-10-09, screenshot and request for App-only internal registration of a guardian/end user.
- **Evidence:** `/customers/new` offered only five partner segments; steps 4/5 always described Sequoia. Independent registration existed only in the separate consumer flow.
- **Impact:** Staff could not choose the intended B2C account from the new-customer wizard and could mistake the partner's Sequoia access for App access.
- **Root cause:** The entry rendered only `CustomerNewForm`'s partner contract, even after direct consumer registration was introduced.
- **Resolution:** The B2C wizard change adds **Guardião / Usuário Final**, reuses `ConsumerForm`/`registerConsumer` and changes the fourth/fifth steps to App/Premium while preserving partner behavior. Literal stepper and action tests cover the product labels and rejection of B2C data by the partner action. Source, checks, runtime/UI and cleanup are recorded in the [B2C wizard audit](../../../docs/audits/BMS-B2C-WIZARD-2026-10-09.md).

### PARTNERS-G1: Invitation delivery fixture unavailable

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** The local baseline tests company editing, not the BMS partner invite-to-SEQ sign-in flow; mail adapters are mocked.
- **Impact:** The invited contact cannot be assumed to receive or accept a usable setup token.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Add a recorded mail/token fixture and two-party sign-in scenario.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |
| 2026-10-07 | `218d5aa` + Gen2026 change | Action tests, real local state and SEQ browser | Coupon settlement now provisions first access; inactive OWNER rejected before, active OWNER signed in after; invitation-failure follow-up remained visible without repeating the sale. | [Audit](../../../docs/audits/GEN2026-2026-10-07.md); real mail delivery/password setup still requires its fixture. |
| 2026-10-07 | `2632307` | Source, deterministic tests, local PostgreSQL and browser | Immediate active credentials, optional audited initial allowance, resend recovery and deletion guard; 927 deterministic and four enabled onboarding integration tests passed. | [Audit](../../../docs/audits/PARTNER-ONBOARDING-2026-10-07.md); production inbox delivery remains unverified. |
| 2026-10-09 | Global APP directory change | Source review | Added the administrator shortcut from `/customers` to `/consumers`, using the translated APP directory title and a wrapping header. | Automated tests and runtime/browser checks omitted at the user's request; no partner mutation changed or process started. |
| 2026-10-09 | `3826319` + consolidated release | Completion of interrupted wizard/revocation/expiry chats | Final deterministic and local PostgreSQL checks plus release evidence in the [consolidated audit](../../../docs/audits/PRODUCTION-RELEASE-2026-10-09.md). | Browser automated QA waived; production inbox acceptance remains separate. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [AUTHENTICATION](../../../docs/AUTHENTICATION.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md)
