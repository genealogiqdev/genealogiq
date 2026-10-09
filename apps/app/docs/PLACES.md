# Life places and maps

> **Code:** [src/actions/places.actions.ts](../src/actions/places.actions.ts) · [src/actions/place-qr.actions.ts](../src/actions/place-qr.actions.ts) · [src/components/place-qr-display.tsx](../src/components/place-qr-display.tsx) · [src/queries/places.ts](../src/queries/places.ts) · [src/schemas/place.schema.ts](../src/schemas/place.schema.ts) · [src/lib/geo-quota.ts](../src/lib/geo-quota.ts) · [src/consts/place-categories.ts](../src/consts/place-categories.ts)
> **Entry points:** `/profile/[id]/places` · `/profile/[id]/places/new` · `/profile/[id]/places/[placeId]` · `/profile/[id]/places/[placeId]/edit` · `/profile/[id]/places/map` · `/api/places/upload`
> **Depends on:** [GEOLOCATION](GEOLOCATION.md) · [BILLING-QUOTAS](BILLING-QUOTAS.md) · [MEDIA-STORAGE](../../../docs/MEDIA-STORAGE.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-09 at `77d4bc0` plus the Premium place-download changes. Source verification is separate from tests/runtime/UI below; the new automated specs and interactive scenarios were not run at the user's request.

The APP application supplies life places and maps. GeoPlace owns category/startDate/optional endDate/address/coordinates/images/qrGenerated. Blank endDate parses to null. Creation checks guardian-wide place units; photos share the profile image pool. 20260721000000_geo_places created rows; 20260726000000_geo_place_qr_generated added marker.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/places.actions.ts](../src/actions/places.actions.ts) `savePlace` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/schemas/place.schema.ts](../src/schemas/place.schema.ts) `getPlaceSchema` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/queries/places.ts](../src/queries/places.ts) `getPlacesForMap` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/places.actions.ts](../src/actions/places.actions.ts) | `savePlace`, `markPlaceQrGenerated`, `deletePlace` | Authenticated mutation orchestration |
| [src/actions/place-qr.actions.ts](../src/actions/place-qr.actions.ts) | `downloadPlaceQrCode` | Validates IDs, authenticates the viewer, rechecks live Premium and returns the printable PNG |
| [src/components/place-qr-display.tsx](../src/components/place-qr-display.tsx) | `PlaceQrDisplay` | QR preview plus a prominent localized download button, pending state and failure feedback |
| [src/queries/places.ts](../src/queries/places.ts) | `getPlaceById`, `getPlacesForMap` | Scoped data reads and output shaping |
| [src/schemas/place.schema.ts](../src/schemas/place.schema.ts) | See exports/component in file | Input validation and defaults |
| [src/lib/geo-quota.ts](../src/lib/geo-quota.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/consts/place-categories.ts](../src/consts/place-categories.ts) | See exports/component in file | Shared policy or integration implementation |

## Rules and why

Anonymous detail respects the list’s twelve-place preview slice (ANON_PLACES_LIMIT; places.test.ts). Place count is separate from image count (places.actions.test.ts and geo-quota.test.ts).

On a generated place QR, the detail page shows **Baixar GenCode** directly below the image only when the signed-in viewer's own effective plan has code `PREMIUM`. This covers the same place detail for living profiles, memorials and pets. Download is a read available to Premium viewers under the existing authenticated place visibility rules; it does not require editing rights. A Premium guardian of the viewed profile, a physical GenCode or extra QR units cannot grant download access to a FREE viewer. `getMemorialFeatures(viewerId)` reads the database-backed entitlement, including valid complimentary Premium and trials, and falls back to FREE when the term is no longer live. The action checks it again on every click, so a page opened before expiry cannot authorize a later download by itself.

The existing public QR preview/generation remains separate from this Premium export. The primary download button keeps its text on small screens, disables during the request and reports a translated failure without downloading a file. This request adds no subscription, credit consumption, permanent image upload or new GenCode record.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

GeoPlace owns category/startDate/optional endDate/address/coordinates/images/qrGenerated. Blank endDate parses to null. Creation checks guardian-wide place units; photos share the profile image pool. 20260721000000_geo_places created rows; 20260726000000_geo_place_qr_generated added marker.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

`downloadPlaceQrCode(profileId, placeId)` requires two nonempty string IDs and a verified APP session. It checks the viewer's Premium entitlement before reading `getPlaceById(profileId, placeId)`, which scopes the place to the requested profile; a missing place or `qrGenerated=false` returns `Actions.places.notFound`. Non-Premium requests return `Actions.places.premiumRequired`. Success carries only `{ dataUrl }` in the ActionResult: a 2048 × 2048 PNG with H error correction, a four-module quiet zone and dark modules on white. It encodes `/profile/<stored userId>/places/<stored id>` under `APP_URL` (fallback `https://genealogiq.app`, matching the profile QR page), and the client saves `gencode-<placeId>.png`. Generation is local to the server process through the existing `qrcode` dependency; no provider call or database write is involved.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| `GeoPlace` | `app_geo_places` | [20260721000000_geo_places](../../../packages/db/prisma/migrations/20260721000000_geo_places/migration.sql) |
| `ExtraUnitPurchase` | `app_extra_unit_purchases` | [20260805000000_extra_unit_purchases](../../../packages/db/prisma/migrations/20260805000000_extra_unit_purchases/migration.sql) |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/profile/[id]/places` | [src/app/(public)/profile/[id]/places/page.tsx](../src/app/(public)/profile/[id]/places/page.tsx) |
| GET | `/profile/[id]/places/new` | [src/app/(public)/profile/[id]/places/new/page.tsx](../src/app/(public)/profile/[id]/places/new/page.tsx) |
| GET | `/profile/[id]/places/[placeId]` | [src/app/(public)/profile/[id]/places/[placeId]/page.tsx](../src/app/(public)/profile/[id]/places/[placeId]/page.tsx) |
| GET | `/profile/[id]/places/[placeId]/edit` | [src/app/(public)/profile/[id]/places/[placeId]/edit/page.tsx](../src/app/(public)/profile/[id]/places/[placeId]/edit/page.tsx) |
| GET | `/profile/[id]/places/map` | [src/app/(public)/profile/[id]/places/map/page.tsx](../src/app/(public)/profile/[id]/places/map/page.tsx) |
| POST | `/api/places/upload` | [src/app/api/places/upload/route.ts](../src/app/api/places/upload/route.ts) |

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

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/places.actions.test.ts](../src/actions/places.actions.test.ts) · [src/queries/places.test.ts](../src/queries/places.test.ts) · [src/schemas/place.schema.test.ts](../src/schemas/place.schema.test.ts) · [src/lib/geo-quota.test.ts](../src/lib/geo-quota.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Added 2026-10-09, not executed:** [src/actions/place-qr.actions.test.ts](../src/actions/place-qr.actions.test.ts) specifies the Premium viewer's place URL/PNG output, missing session, FREE/custom-plan rejection even on a Premium profile, entitlement expiry between requests, mismatched/missing place, ungenerated QR, invalid IDs and renderer failure. Future focused command: `pnpm exec vitest run --project app apps/app/src/actions/place-qr.actions.test.ts`. These mocked expectations do not prove QR decoding, download behavior or real subscription expiry.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run APP and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Create a disposable place with start date, blank end date and coordinates. Save/reload detail/list/map; expect one row with null endDate and matching marker.
2. **Boundary:** Blank start date and anonymous edit reject; no new GeoPlace row. External map tiles require network.
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.
4. **Premium download:** As a user with live Premium, open a generated place QR on a memorial and a pet. Expect the primary **Baixar GenCode** button below the QR on desktop/mobile; clicking once saves a 2048 × 2048 PNG. Scan the file and expect that exact place detail, then reload and repeat. The download does not change the place or any entitlement/credit row.
5. **Download boundaries:** An anonymous/FREE/custom-plan viewer has no download button, including on another guardian's Premium memorial. Direct action invocation without a session or without Premium must fail; if Premium expires after rendering, clicking must fail too. A mismatched profile/place ID, missing place or ungenerated QR must produce no file. A renderer/network failure must show an error and leave the button available for retry.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: A disposable feature dataset and the exact happy/boundary interaction have not been exercised. | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |
| 2026-10-09, `77d4bc0` + Premium download | No local app/browser started, per user request | Expected download and permission scenarios are specified above; no runtime/UI observation claimed. | n/a: automated tests and browser checks explicitly omitted for this change. | Source: `downloadPlaceQrCode`, `PlaceDetailPage`, `PlaceQrDisplay`; no owned processes or fixture mutations to clean up. |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 77d4bc0..HEAD -- apps/app/src/actions/places.actions.ts apps/app/src/actions/place-qr.actions.ts apps/app/src/components/place-qr-display.tsx 'apps/app/src/app/(public)/profile/[id]/places/[placeId]/page.tsx' apps/app/src/queries/places.ts apps/app/src/schemas/place.schema.ts apps/app/src/lib/geo-quota.ts apps/app/src/consts/place-categories.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `PLACES-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

For a missing download button, check the **viewer's** effective Subscription code and the AppSale status/end date, then the scoped place's `qrGenerated` flag. For a downloaded QR opening the wrong origin, inspect `APP_URL` using [CONFIGURATION](../../../docs/CONFIGURATION.md) without printing credentials. Existing profile ownership or a displayed QR alone does not prove Premium export entitlement.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

None known from this source/test audit. This is not a claim of complete product/integration coverage.
## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |
| 2026-10-09 | `77d4bc0` + Premium place-download changes | Codex source and diff review | Source: viewer entitlement, Zod ID contract, profile/place scope, PNG generation and localized button/error paths traced. Added independent action specs. Tests: not executed. Runtime/UI: not exercised. | User explicitly waived automated tests and browser testing. No local processes started, fixtures changed, or provider calls made. |
| 2026-10-09 | Same Premium place-download changes | Static checks | APP TypeScript (`tsc --noEmit --incremental false`), ESLint on the four changed TypeScript files, both i18n gates, documentation contracts and diff whitespace checks passed. | Static checks do not establish the unexecuted PNG decoding/download or runtime permission scenarios. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [GEOLOCATION](GEOLOCATION.md) · [BILLING-QUOTAS](BILLING-QUOTAS.md) · [MEDIA-STORAGE](../../../docs/MEDIA-STORAGE.md)
