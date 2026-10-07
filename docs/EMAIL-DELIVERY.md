# Transactional email delivery

> **Code:** [packages/email/src/index.ts](../packages/email/src/index.ts) · [apps/app/src/lib/email.ts](../apps/app/src/lib/email.ts) · [apps/bms/src/lib/email.ts](../apps/bms/src/lib/email.ts) · [apps/seq/src/lib/email.ts](../apps/seq/src/lib/email.ts)
> **Entry points:** `Account/invitation/feedback/lifecycle actions calling email adapters`
> **Depends on:** [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [CONFIGURATION](CONFIGURATION.md) · [TESTING](TESTING.md) · [OBSERVABILITY](OBSERVABILITY.md) · [RUNBOOKS](RUNBOOKS.md)
> **Last verified against code:** 2026-10-07 at `c3fd642` plus the immediate partner onboarding change. Source, tests, local runtime/UI and deployment evidence are separated in the onboarding audit linked below; earlier verification history is preserved.

This shared module supplies transactional email delivery. One lazy Resend client sends English templates from no-reply@rohling.com.br. App adapters supply their own base URL and product context. Feedback values are HTML-escaped; token links contain expiring account tokens and must not be copied into documentation.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [packages/email/src/index.ts](../packages/email/src/index.ts) `sendVerificationEmail` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [packages/email/src/index.ts](../packages/email/src/index.ts) `sendPasswordResetEmail` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [apps/seq/src/lib/email.ts](../apps/seq/src/lib/email.ts) `SEQUOIA` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [packages/email/src/index.ts](../packages/email/src/index.ts) | `sendVerificationEmail`, `sendPasswordResetEmail`, `sendFeedbackEmail`, `sendGenCodeDeliveryEmail`, `sendRenewalReminderEmail` | Shared policy or integration implementation |
| [apps/app/src/lib/email.ts](../apps/app/src/lib/email.ts) | `sendVerificationEmail`, `sendPasswordResetEmail` | Routed product entry |
| [apps/bms/src/lib/email.ts](../apps/bms/src/lib/email.ts) | `sendVerificationEmail`, `sendPasswordResetEmail` | Shared policy or integration implementation |
| [apps/seq/src/lib/email.ts](../apps/seq/src/lib/email.ts) | `sendVerificationEmail`, `sendPasswordResetEmail`, `sendGenCodeDeliveryEmail` | Shared policy or integration implementation |

## Rules and why

Imports work without a Resend key because the client initializes only when sending. Missing key/provider rejection is an integration failure, not proof of delivery. The send helper now rejects a returned Resend error as well as a thrown transport error; EMAIL-DELIVERY-G1 preserves the former ignored-error behavior.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

### Partner registration credentials

[BMS partner registration](../apps/bms/docs/PARTNERS.md) sends `sendPartnerCredentialsEmail` after the account and optional initial GenCodes commit. The message contains the OWNER's login email, generated initial password, Sequoia sign-in URL and exact initial allowance. The password is persisted only as a bcrypt hash and is never returned in an action response or written to logs. Resend acceptance is required for the normal success message; both thrown errors and a resolved `{ error }` response produce an email-pending registration warning. Recovery uses an expiring setup link without changing the existing password or issuing more credits.

The loopback mail fixture captures only `@genealogiq.test` recipients and simulates a provider rejection. Local capture verifies template content and usable credentials; it does not establish production inbox delivery. See [the onboarding audit](audits/PARTNER-ONBOARDING-2026-10-07.md).

One lazy Resend client sends English templates from no-reply@rohling.com.br. App adapters supply their own base URL and product context. Feedback values are HTML-escaped; token links contain expiring account tokens and must not be copied into documentation.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| None | No feature-owned table; browser/transport state only | Not applicable |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| See handler | `Account/invitation/feedback/lifecycle actions calling email adapters` | Entry description; scope/method varies by caller |

| Setting | Default | Validation / owner | Consequence |
| --- | --- | --- | --- |
| RESEND_API_KEY | absent | lazy Resend client in index.ts | Required only on send; local-qa disables mail. |

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

**Specs included in the successful 2026-10-03 full-suite run:** [packages/email/src/index.test.ts](../packages/email/src/index.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run the caller app(s) and PostgreSQL; storage scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Send one synthetic verification/feedback message to a disposable verified test inbox and compare independent recipient, URL base and escaped content. Requires test mail configuration and an inbox.
2. **Boundary:** Return a Resend {data:null,error:...} fixture and expect the transport to fail; onboarding must retain the committed registration and explicitly report pending email delivery.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: Requires test mail configuration and an inbox | [Dated audit](audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Diagnose and refresh a deployed Resend credential

`Missing API key` is raised while constructing the Resend client, before an
email request reaches the provider. It means the serving process has an empty
`RESEND_API_KEY`; it does not establish a Stripe test-mode or unfinished-release
problem. First identify the browser origin and the serving revision. The local
QA launcher deliberately overrides this variable with an empty string even when
`apps/bms/.env` contains a key.

In Azure, verify the subscription and inspect only secret names/references.
The BMS contract is `RESEND_API_KEY=secretref:resend-api-key`, backed by the
versionless `resend-api-key` secret in `kv-gen-ohqluyie` and the existing
`id-genealogiq-prod` managed identity. Compare the explicitly selected local
credential with Key Vault privately; never print either value. If they already
match, retain the existing secret rather than rotate a shared credential.

Preview the BMS revision refresh with the current resource definition read using
the preview template's API version (`2024-03-01`). Review the what-if before
reapplying the existing Key Vault reference and copying the active BMS revision
with `RESEND_API_KEY=secretref:resend-api-key`. Reuse the immutable image and
require the new revision to be ready, healthy and receiving traffic. A secret
reference in ARM alone does not prove the variable reached the running process.

A credential restricted to sending can reject `GET /domains` with
`restricted_api_key`; that response is not an invalid-key diagnosis. An empty
`POST /emails` body has no recipient and cannot send a message. Its
`missing_required_field` response is useful authentication/boundary evidence,
but does not verify sender-domain permission, delivery or inbox receipt. A real
message still requires the authorized recipient and scenario. The
[2026-10-07 audit](audits/RESEND-BMS-2026-10-07.md) records this distinction.

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- packages/email/src/index.ts apps/app/src/lib/email.ts apps/bms/src/lib/email.ts apps/seq/src/lib/email.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `EMAIL-DELIVERY-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### EMAIL-DELIVERY-G1: Resolved provider error is ignored

- **Status:** fixed
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** packages/email/src/index.ts send awaits resend().emails.send without checking the returned error field.
- **Impact:** Callers can report success after Resend rejected the message.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** 2026-10-07 partner onboarding change: `send` checks the resolved Resend error and throws a sanitized failure. The email spec rejects a resolved provider error; BMS action tests preserve the successful registration and report email pending. The original incident above is retained. Actual inbox delivery remains EMAIL-DELIVERY-G2.

### EMAIL-DELIVERY-G2: No recorded email provider delivery fixture

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** The new email Vitest project pins escaping, the verification base URL and thrown transport errors. It does not replay Resend responses or confirm inbox delivery.
- **Impact:** Actual transport rejection/acceptance and inbox routing remain integration dependencies.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Record test provider responses including resolved errors; verify one disposable message recipient and content.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |
| 2026-10-07 | Source `218d5aa`; Azure image `6e06634a752b44bce24825b0aa25baf0b669fa16`; BMS revision `resend-20261007` | Azure CLI, container process and Resend boundary probe | Existing BMS `.env` and Key Vault keys matched privately. Reapplied the existing reference; new revision healthy with 100% traffic and a populated process variable. Empty email request returned HTTP 422 `missing_required_field`. Tests: 840 passed, one opt-in skip. | Authentication/configuration verified; no real message sent, sender permission/inbox delivery and screenshot origin remain unverified. [Audit](audits/RESEND-BMS-2026-10-07.md). |
| 2026-10-07 | Immediate onboarding change after `c3fd642` | Source, deterministic tests, local PostgreSQL and browser | Credential template and resolved provider-error handling; EMAIL-DELIVERY-G1 fixed; 927 deterministic and four enabled onboarding integration tests passed. | [Audit](audits/PARTNER-ONBOARDING-2026-10-07.md); production inbox delivery remains unverified. |

## Related

[LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [CONFIGURATION](CONFIGURATION.md) · [TESTING](TESTING.md) · [OBSERVABILITY](OBSERVABILITY.md) · [RUNBOOKS](RUNBOOKS.md) · [Audit](audits/AGENT-MEMORY-2026-10-03.md)
