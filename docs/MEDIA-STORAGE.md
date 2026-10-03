# Azure media authorization and promotion

> **Code:** [packages/services/src/media-storage.ts](../packages/services/src/media-storage.ts) · [packages/core/src/media-upload.ts](../packages/core/src/media-upload.ts) · [packages/core/src/blob.ts](../packages/core/src/blob.ts)
> **Entry points:** `POST /api/<bio|gallery|tribute|places|geolocation|documents|career|profile>/upload`
> **Depends on:** [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [CONFIGURATION](CONFIGURATION.md) · [TESTING](TESTING.md) · [OBSERVABILITY](OBSERVABILITY.md) · [RUNBOOKS](RUNBOOKS.md)
> **Last verified against code:** 2026-10-03 at `6e06634`, including this task’s uncommitted documentation, launcher and test changes. Source verification is separate from runtime/UI below.

This shared module supplies azure media authorization and promotion. The upload body has authorize/complete stages. Server policy controls path prefix, allowed content type and size; authorize yields a create-only SAS lasting ten minutes for a private staging blob. Completion checks actual bytes/signature, promotes to media and removes staging. Stored-reference authorization permits an unchanged legacy URL but new URLs must match the owner/profile prefix.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Authorize server policy and generate a scoped SAS | deterministic | [packages/services/src/media-storage.ts](../packages/services/src/media-storage.ts) `createAuthorizedUpload` | Create-only staging authorization |
| 2 | PUT bytes directly to Azure/Azurite | external call | [packages/core/src/media-upload.ts](../packages/core/src/media-upload.ts) `uploadMedia` | Staged object |
| 3 | Read signature/size, promote and remove staging | external call | [packages/services/src/media-storage.ts](../packages/services/src/media-storage.ts) `completeMediaUpload` | Verified public reference |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [packages/services/src/media-storage.ts](../packages/services/src/media-storage.ts) | `readMediaUploadBody`, `processMediaUpload`, `createAuthorizedUpload`, `completeMediaUpload`, `deleteUnreferencedMediaUrls`, `isAuthorizedMediaReference`, `getMediaPublicBaseUrl` | Shared policy or integration implementation |
| [packages/core/src/media-upload.ts](../packages/core/src/media-upload.ts) | See exports/component in file | Shared policy or integration implementation |
| [packages/core/src/blob.ts](../packages/core/src/blob.ts) | See exports/component in file | Shared policy or integration implementation |

## Rules and why

a165f45 moved portraits/media to Azure. Overwrite protection, content signatures and prefix authorization are pinned by media tests. The live Azurite test used a hand-written PNG header, confirmed overwrite rejection, read-after-promote success, and 404 after deletion on 2026-10-03. Never delete an object still referenced by another row.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

Production browser PUTs require Blob service CORS for the caller origin.
The `genealogiq.com.br`, `www`, `bms`, and `sequoia` origins are explicitly
allowed alongside legacy/local origins in `infra/modules/platform.bicep`.
The scoped `infra/custom-domain-media-cors.bicep` template preserves other
Blob service properties. CORS permits browser transport only; it does not
replace the create-only scoped SAS or server authorization/signature checks.

The upload body has authorize/complete stages. Server policy controls path prefix, allowed content type and size; authorize yields a create-only SAS lasting ten minutes for a private staging blob. Completion checks actual bytes/signature, promotes to media and removes staging. Stored-reference authorization permits an unchanged legacy URL but new URLs must match the owner/profile prefix.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| None | No feature-owned table; browser/transport state only | Not applicable |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| See handler | `POST /api/<bio|gallery|tribute|places|geolocation|documents|career|profile>/upload` | Entry description; scope/method varies by caller |

| Setting | Default | Validation / owner | Consequence |
| --- | --- | --- | --- |
| AZURE_STORAGE_CONNECTION_STRING | UseDevelopmentStorage=true only in local-qa | media-storage storage configuration | Uses Azurite; production can use account URL and managed identity. |
| AZURE_STORAGE_MEDIA_CONTAINER / AZURE_STORAGE_STAGING_CONTAINER | media / media-staging | media-storage.ts | Selects public target and private staging containers. |
| MEDIA_PUBLIC_BASE_URL / NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL | derived account URL / server fallback | media-storage.ts and packages/core/src/blob.ts | Controls URL validation/rendering; public client value requires rebuild. |

## How to test it (AI-runnable)

Run commands from the repository root `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Install workspace dependencies first.

| Layer | Command | Needs | Cost | Proves |
| --- | --- | --- | --- | --- |
| Unit (deterministic) | `pnpm test` | Workspace install; root Vitest supplies an unreachable dummy DB URL | Free, seconds | Named deterministic helper/query/schema cases in the specs below |
| Contract / schema | `pnpm check:schema-parity` | Workspace install | Free, seconds | One canonical Prisma schema; feature input constraints are only proven when a schema spec is listed |
| Golden / replay | n/a: no complete recorded-provider replay fixture | Hand-authored recorded responses; cache misses must fail | Not run | Model regression is not applicable; provider/data drift remains an integration limit |
| End-to-end / harness | See the enabled Azurite command in [TESTING](TESTING.md) | See prerequisites below | Local/free when prerequisites exist | Real Azure SDK/storage fixture; browser forms remain separate |
| Offline evidence | `node scripts/check-docs.mjs` | Repository docs | Free, seconds | Paths, links, headings, metadata and indexes; it cannot verify pixels or business outcomes |
| Manual product QA | `node scripts/local-qa.mjs` → scenarios below | Local PostgreSQL, relevant app; Azurite for media; fixture Credentials identity | Local/free; real providers need test accounts | Visible result plus save/reload or independently checked persisted effect |

**Specs included in the successful 2026-10-03 full-suite run:** [packages/services/src/media-storage.test.ts](../packages/services/src/media-storage.test.ts) · [packages/services/src/media-storage.integration.test.ts](../packages/services/src/media-storage.integration.test.ts) · [packages/services/src/storage-usage.test.ts](../packages/services/src/storage-usage.test.ts) · [packages/core/src/media-upload.test.ts](../packages/core/src/media-upload.test.ts) · [packages/core/src/blob.test.ts](../packages/core/src/blob.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run the caller app(s) and PostgreSQL; storage scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** With Azurite, authorize a small hand-written PNG, PUT once, complete and read the public object; independently expect 200 and the same byte count. The integration spec is the exact exercised runtime fixture.
2. **Boundary:** Attempt a second PUT to the same authorized key, unauthorized prefix and wrong file signature; expect overwrite/validation rejection. Delete the integration-owned object and independently expect 404.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | pass for the SDK/storage runtime fixture: scoped SAS upload, overwrite rejection, promotion, public 200 and deleted-object 404 in Azurite. Browser upload forms and production managed identity remain n/a. | The named scenario passed within the listed limits. Remaining scenarios are n/a until their prerequisites exist. | [Dated audit](audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- packages/services/src/media-storage.ts packages/core/src/media-upload.ts packages/core/src/blob.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `MEDIA-STORAGE-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### MEDIA-STORAGE-G1: Browser upload fixture not exercised

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** The Azurite API/storage integration passed, but the audit did not upload/save through each app browser form.
- **Impact:** Client progress/error handling and every profile-specific quota gate remain separate product scenarios.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Add small image/PDF fixtures and run the changed form happy and rejected upload paths; retain storage test evidence separately.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | pass for the SDK/storage runtime fixture: scoped SAS upload, overwrite rejection, promotion, public 200 and deleted-object 404 in Azurite. Browser upload forms and production managed identity remain n/a. | Only the named exercised behavior is verified. |
| 2026-10-03 | `7d267f7` + domain configuration changes | Azure CLI and HTTP preflight | `genealogiq-domain-media-cors` succeeded; four new origins returned 200 with matching Allow-Origin for PUT; unrelated origin returned 403 | No production upload/write was exercised; SAS and form validation remain separate scenarios |

## Related

[LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [CONFIGURATION](CONFIGURATION.md) · [TESTING](TESTING.md) · [OBSERVABILITY](OBSERVABILITY.md) · [RUNBOOKS](RUNBOOKS.md) · [Audit](audits/AGENT-MEMORY-2026-10-03.md)
