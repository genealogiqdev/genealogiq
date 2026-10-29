# Life places and maps

> **Code:** [src/actions/places.actions.ts](../src/actions/places.actions.ts) · [src/actions/place-qr.actions.ts](../src/actions/place-qr.actions.ts) · [src/components/place-qr-display.tsx](../src/components/place-qr-display.tsx) · [src/queries/places.ts](../src/queries/places.ts) · [src/schemas/place.schema.ts](../src/schemas/place.schema.ts) · [src/lib/geo-quota.ts](../src/lib/geo-quota.ts) · [src/consts/place-categories.ts](../src/consts/place-categories.ts)
> **Entry points:** `/profile/[id]/places` · `/profile/[id]/places/new` · `/profile/[id]/places/[placeId]` · `/profile/[id]/places/[placeId]/edit` · `/profile/[id]/places/map` · `/api/places/upload`
> **Depends on:** [GEOLOCATION](GEOLOCATION.md) · [BILLING-QUOTAS](BILLING-QUOTAS.md) · [MEDIA-STORAGE](../../../docs/MEDIA-STORAGE.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-14 at `58d4145` plus the memorial-place GenCode destination changes. Source, automated checks, local HTTP/database evidence and browser limitations are recorded separately below.

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
| [src/actions/place-qr.actions.ts](../src/actions/place-qr.actions.ts) | `downloadPlaceQrCode` | Validates IDs/format, authenticates the viewer, rechecks live Premium and returns PNG or SVG |
| [src/components/place-qr-display.tsx](../src/components/place-qr-display.tsx) | `PlaceQrDisplay` | QR preview with Premium export controls |
| [src/components/gen-code-download-buttons.tsx](../src/components/gen-code-download-buttons.tsx) | `GenCodeDownloadButtons` | Shared visible PNG/SVG buttons, pending state and translated download feedback |
| [src/lib/qr-download.ts](../src/lib/qr-download.ts) | `generateQrDataUrl` | Server-only PNG/vector SVG rendering, also used by [pet profile downloads](PETS.md) |
| [src/lib/place-qr.ts](../src/lib/place-qr.ts) | `getPlaceQrPath`, `isMemorialPlace` | Shared destination for place QR previews, exports and existing memorial plaques |
| [src/queries/places.ts](../src/queries/places.ts) | `getPlaceById`, `getPlacesForMap` | Scoped data reads and output shaping |
| [src/schemas/place.schema.ts](../src/schemas/place.schema.ts) | See exports/component in file | Input validation and defaults |
| [src/lib/geo-quota.ts](../src/lib/geo-quota.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/consts/place-categories.ts](../src/consts/place-categories.ts) | See exports/component in file | Shared policy or integration implementation |

## Rules and why

Anonymous detail respects the list’s twelve-place preview slice (ANON_PLACES_LIMIT; places.test.ts). Place count is separate from image count (places.actions.test.ts and geo-quota.test.ts).

On a generated place QR, the detail page shows **Baixar GenCode** with directly visible **PNG** and **SVG** buttons below the image only when the signed-in viewer's own effective plan has code `PREMIUM`. This covers the same place detail for living profiles, memorials and pets. Download is a read available to Premium viewers under the existing authenticated place visibility rules; it does not require editing rights. A Premium guardian of the viewed profile, a physical GenCode or extra QR units cannot grant download access to a FREE viewer. `getMemorialFeatures(viewerId)` reads the database-backed entitlement, including valid complimentary Premium and trials, and falls back to FREE when the term is no longer live. The action checks it again for either format on every click, so a page opened before expiry cannot authorize a later download by itself.

The existing public QR preview/generation remains separate from this Premium export. Both format buttons keep their labels on small screens, disable during a request and report a translated failure without downloading a file. This request adds no subscription, credit consumption, permanent image upload or new GenCode record. The first implementation in `e80c449` offered PNG only; the follow-up added vector SVG and shared the controls/renderer with direct pet-profile exports. Initially all place exports opened the specific place; the pet-profile export opened the pet itself.

Since 2026-10-14, a place categorized as `resting_place` or `memorial_site` encodes the associated profile root in both its displayed QR and PNG/SVG exports. A scan at a tomb should introduce the deceased. Other life-place categories retain their location destination, including places with no categories. Category order and additional categories do not change the memorial rule.

Previously printed memorial-place QRs contain `/profile/<id>/places/<placeId>`; when the scoped place has `qrGenerated=true`, that bare URL redirects to `/profile/<id>` for anonymous visitors and signed-in guardians alike. Old `/places?place=<placeId>` links still forward through this resolver. The places list explicitly opens `?view=details` to retain the location, its editing link and QR export controls. This parameter is navigation intent, never authorization: the profile privacy guard still runs first, and anonymous location details still require membership in the twelve-place preview. A scan for a generated memorial place outside that slice may redirect to the public profile without exposing the location. Missing/mismatched places retain the anonymous list redirect or authenticated not-found response. Neither navigation nor export changes the persisted place/QR flag or consumes credit.

Since 2026-10-29, a bare legacy place URL whose scoped place is unavailable falls back to the existing `APP_MEMO` profile after the public-profile guard. This covers printed plaques whose location was removed or is absent from recovered data. It does not reconstruct location data or read a place belonging to another profile. Explicit `?view=details`, living/pet profiles and missing/private profiles keep their prior boundaries. Premium remains required for export; reading an existing public memorial from a plaque does not require the visitor to subscribe. See the [legacy plaque follow-up](../../../docs/audits/APP-MEMORIAL-SCAN-2026-10-29.md).

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

## Contracts and data

GeoPlace owns category/startDate/optional endDate/address/coordinates/images/qrGenerated. Blank endDate parses to null. Creation checks guardian-wide place units; photos share the profile image pool. 20260721000000_geo_places created rows; 20260726000000_geo_place_qr_generated added marker.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

`downloadPlaceQrCode(profileId, placeId, format)` requires two nonempty string IDs, format `png` or `svg` (PNG when omitted, preserving the original call contract) and a verified APP session. It checks the viewer's Premium entitlement before reading `getPlaceById(profileId, placeId)`, which scopes the place to the requested profile; a missing place or `qrGenerated=false` returns `Actions.places.notFound`. Non-Premium requests return `Actions.places.premiumRequired`; unsupported formats return `Actions.common.invalidData`. Success carries only `{ dataUrl }` in the ActionResult: a 2048 × 2048 PNG or a vector SVG, both with H error correction, a four-module quiet zone and dark modules on white. `getPlaceQrPath` uses the stored categories and IDs: `/profile/<stored userId>` for `resting_place`/`memorial_site`, otherwise `/profile/<stored userId>/places/<stored id>`. Exports use `APP_URL` (fallback `https://genealogiq.app`); the displayed QR receives the same path from the server and uses the current browser origin. The client saves `gencode-<placeId>.<format>`. SVG is generated with `QRCode.toString({ type: "svg" })`, encoded with the SVG MIME type, and is not a PNG embedded in an SVG wrapper. Generation is local to the server process through the existing `qrcode` dependency; no provider call or database write is involved.

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

The follow-up extends these unexecuted specs with SVG MIME/vector-renderer expectations for the same destination, denied requests in both formats and unsupported-format rejection. PNG remains the omitted-format default.

**2026-10-14 destination regression:** [place-qr.actions.test.ts](../src/actions/place-qr.actions.test.ts) now pins the memorial profile destination for PNG/SVG and preserves other categories plus the existing permission/format boundaries. [place detail entry tests](../src/app/(public)/profile/[id]/places/[placeId]/page.test.tsx) cover printed links, guardian/anonymous readers, explicit details, privacy, preview limits and missing/mismatched places. [place-qr-display.test.tsx](../src/components/place-qr-display.test.tsx) checks that the client uses the server-selected profile path. These tests mock their DB/session or QR renderer boundaries; the entry tests do not claim a full Next.js browser render. The focused run passed all 36 tests.

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
4. **Premium download:** As a user with live Premium, open a generated place QR through the Geolocalizações list on a memorial and a pet. Expect **Baixar GenCode** plus primary **PNG**/**SVG** buttons below the QR on desktop/mobile. Download both; expect a 2048 × 2048 PNG and a vector SVG. Scan each file: `resting_place`/`memorial_site` must open the associated profile; a `school` place must still open its own detail. Reload and repeat. The download does not change the place or any entitlement/credit row.
5. **Download boundaries:** An anonymous/FREE/custom-plan viewer has no format buttons, including on another guardian's Premium memorial. Direct action invocation without a session or without Premium must fail in either format; if Premium expires after rendering, clicking must fail too. A mismatched profile/place ID, missing place, ungenerated QR or unsupported format must produce no file. A renderer/network failure must show an error and leave both buttons available for retry.
6. **Printed plaques:** Open the original bare detail URL and the older `?place=<id>` URL for a generated memorial place, both anonymously and after normal guardian sign-in. Expect the deceased's profile, including for a place outside the anonymous preview. Open the place through the list and expect `?view=details`, location content and permitted editing/export controls. Anonymous `?view=details` outside the preview still goes to the list; a private living profile stays behind sign-in. Repeat the scan and independently confirm that the place IDs, categories, QR flags and timestamps are unchanged.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: A disposable feature dataset and the exact happy/boundary interaction have not been exercised. | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |
| 2026-10-09, `77d4bc0` + Premium download | No local app/browser started, per user request | Expected download and permission scenarios are specified above; no runtime/UI observation claimed. | n/a: automated tests and browser checks explicitly omitted for this change. | Source: `downloadPlaceQrCode`, `PlaceDetailPage`, `PlaceQrDisplay`; no owned processes or fixture mutations to clean up. |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 58d4145..HEAD -- apps/app/src/actions/places.actions.ts apps/app/src/actions/place-qr.actions.ts apps/app/src/lib/qr-download.ts apps/app/src/lib/place-qr.ts apps/app/src/components/gen-code-download-buttons.tsx apps/app/src/components/place-qr-display.tsx apps/app/src/components/places-client.tsx 'apps/app/src/app/(public)/profile/[id]/places' apps/app/src/queries/places.ts apps/app/src/schemas/place.schema.ts apps/app/src/lib/geo-quota.ts apps/app/src/consts/place-categories.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `PLACES-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

For a missing download button, check the **viewer's** effective Subscription code and the AppSale status/end date, then the scoped place's `qrGenerated` flag. For a downloaded QR opening the wrong origin, inspect `APP_URL` using [CONFIGURATION](../../../docs/CONFIGURATION.md) without printing credentials. Existing profile ownership or a displayed QR alone does not prove Premium export entitlement.

For a tomb QR opening a location, decode the actual printed image first. Check the scoped place's stored categories and `qrGenerated`, then compare the root destination from `getPlaceQrPath` with the bare-link redirect and the explicit `?view=details` navigation. Do not redirect every life-place URL or remove the location editing/export flow. Already printed images cannot be changed by generating a new PNG; their original route must continue to resolve.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### PLACES-G1: Tomb GenCodes opened location details instead of the deceased's profile

- **Status:** fixed
- **Found:** 2026-10-14, user report with a screenshot of the location page and a readable GenCode.
- **Evidence:** The supplied image decodes to `/profile/<id>/places/<placeId>`. Both `PlaceQrDisplay` and `downloadPlaceQrCode` previously encoded that detail route for every category.
- **Impact:** Scanning a memorial/tomb plaque showed the location and its QR instead of introducing the deceased.
- **Root cause:** Location navigation and printed-QR destinations shared the same URL without a memorial category rule or an explicit details-navigation path.
- **Resolution:** 2026-10-14, `58d4145` + this change: one shared destination for `memorial_site`/`resting_place`, compatibility redirects for printed links and `?view=details` for the location list. Regression: 36 focused action/entry/client tests; existing privacy, preview and Premium guards retained. Verification evidence is appended below.
### PLACES-G2: Old plaques lose their destination when the scoped place is unavailable

- **Status:** fixed
- **Found:** 2026-10-29, QR decoded from the user's screenshot and its live anonymous redirect inspected.
- **Evidence:** The printed detail URL currently returns the places-list redirect; the resolver cannot find a place under that profile.
- **Impact:** The existing memorial is not the first page shown after scanning that plaque.
- **Root cause:** The previous compatibility redirect requires a surviving generated memorial-place row.
- **Resolution:** Bare links now fall back to the existing human memorial after the profile access guard. Explicit details and non-memorial profiles retain previous behavior. Regression: 41 focused action/entry/client tests; [follow-up audit](../../../docs/audits/APP-MEMORIAL-SCAN-2026-10-29.md) records source, runtime, UI and limitations.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-29 | `f61444c` + legacy plaque fallback | Source, tests, local HTTP and Chrome | 41 focused tests, APP TypeScript and focused lint pass. Anonymous scan opens the memorial; explicit details keeps the list boundary. | [Audit](../../../docs/audits/APP-MEMORIAL-SCAN-2026-10-29.md) records concurrent full-suite failures and authenticated browser limits. |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |
| 2026-10-09 | `77d4bc0` + Premium place-download changes | Codex source and diff review | Source: viewer entitlement, Zod ID contract, profile/place scope, PNG generation and localized button/error paths traced. Added independent action specs. Tests: not executed. Runtime/UI: not exercised. | User explicitly waived automated tests and browser testing. No local processes started, fixtures changed, or provider calls made. |
| 2026-10-09 | Same Premium place-download changes | Static checks | APP TypeScript (`tsc --noEmit --incremental false`), ESLint on the four changed TypeScript files, both i18n gates, documentation contracts and diff whitespace checks passed. | Static checks do not establish the unexecuted PNG decoding/download or runtime permission scenarios. |
| 2026-10-09 | `01201a0` + SVG/PNG and pet downloads | Codex source review | Source: both format buttons use the same live Premium action; vector SVG and PNG retain the place destination and share rendering with pets. Existing action specs extended. | Automated tests and runtime/UI scenarios not executed at the user's request; no local product processes, provider calls or fixture writes. |
| 2026-10-09 | Same SVG/PNG and pet-download changes | Static checks | APP TypeScript (`tsc --noEmit --incremental false`), focused ESLint, both i18n gates, documentation contracts and diff whitespace checks passed. | Automated specs, file decoding/saving and browser permission scenarios remain unexecuted. |

| 2026-10-14 | `bfa4aa7` | Source, local runtime and clean CI | Shared memorial/resting destination and compatibility routes reviewed; 36 focused QR tests, nine earlier decoded files, 17 current HTTP/auth/boundary checks and unchanged fourteen-place persistence snapshot. Full suite and three clean Linux image/liveness checks passed. | Visual QA explicitly waived after Chrome authentication failure; production evidence is in the release audit. |

## Related

The [October 14 consolidated release](../../../docs/audits/PRODUCTION-RELEASE-2026-10-14.md) completes the interrupted QR task. The combined suite passed 1,359 tests; seventeen local HTTP/normal-auth checks passed and fourteen fixture places were independently unchanged. Nine earlier decoded outputs matched their category destinations. The prior disk/resource build failure and unavailable Chrome acceptance remain separately recorded; clean production packaging is checked by the release workflow.

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [GEOLOCATION](GEOLOCATION.md) · [BILLING-QUOTAS](BILLING-QUOTAS.md) · [MEDIA-STORAGE](../../../docs/MEDIA-STORAGE.md)
