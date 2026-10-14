# Consolidated Genealogiq release — 2026-10-14

## Scope and source

The user authorized reviewing today's agent sessions, committing all relevant work on the starting branch and deploying production with verified environment settings. Work stays on `main`, starting at `6fae091`. Six October 14 work chats and the preceding outage chat were read. No other Genealogiq chat was running. The remote main branch was eight commits behind the starting checkout, with no divergent commits.

| Work | Release source |
| --- | --- |
| BMS Clientes B2B sidebar | `1535974` |
| Read-only disk audit and runbook | `0d10009` |
| Validated Sequoia partner credential/setup email destinations | `bb60aa7` |
| Sequoia standalone GenCode packages, quantity and automatic 50-unit discount | `930ad50` |
| Partner customer registration/sale/Premium controls and BMS stock overview | `6fae091` |
| Tomb/memorial-place QR destination | Interrupted uncommitted APP work completed and included in this release |

The QR change shares a category-based destination between preview/export and old printed routes. Memorial and resting-place codes open the profile; other places retain their detail page. Explicit in-app details links preserve editing/export. Profile privacy, anonymous preview limits and live Premium export checks remain. Existing schema, provider boundaries and independent literal tests were reviewed. The installed Next redirect documentation confirms streamed meta redirects. No new database migration is introduced.

## Source and automated checks

Prisma generation passed, followed sequentially by all ten TypeScript tasks. The full suite passed **146 files / 1,359 tests**, with **eight files / 51 opt-in cases skipped**. Lint passed with zero errors and 49 existing warnings. All 78 migration files passed structural validation; canonical schema, nine-locale parity, static translation references and Bicep compilation passed. Translation references retain 95 dynamic-call exclusions and one unmapped columns file. Documentation and whitespace validation are recorded with the release commit.

The first full-suite command used an unsupported pnpm argument form and ran no tests; the corrected `pnpm run test --reporter=dot --maxWorkers=2` passed. Earlier focused QR evidence covers 36 tests and nine independently decoded PNG/SVG/preview outputs. The decoder observed 2047-pixel memorial PNGs and a 2048-pixel school PNG; this audit does not assert every export is exactly 2048 pixels.

Today's earlier package and partner-customer audits record four and seven successful real PostgreSQL cases, respectively, and completed sequential local production builds for all three apps. Those are prior checks of the combined code, not new runs in this chat. The interrupted QR build failed from workstation resource/disk exhaustion; it is not counted as a build pass. Final clean Linux container build/startup evidence is recorded after CI completes.

## Local runtime and UI

This chat started the isolated APP launcher on `127.0.0.1:4400`, with external providers disabled. Seventeen runtime checks passed: normal Credentials sign-in, anonymous and guardian printed-code redirects, the legacy query link, profile rendering/reload, ordinary school details, explicit location/edit/export controls, list links, private-profile protection, out-of-preview details and missing/mismatched places. Independent PostgreSQL comparison confirmed all fourteen fixture places unchanged and zero GenCode or AppSale creation. The launcher was stopped and port 4400 released. Existing shared PostgreSQL/Azurite services remain running; they were not started by this chat.

The original task-owned QR fixtures and ignored evidence remain available. Temporary generated TypeScript includes and formatting were restored after confirming the three changes were solely Next-generated artifacts. Other sessions' ignored builds, databases and private evidence were preserved.

Chrome was explicitly selected, but returned `Codex auth token is unavailable`. The user subsequently explicitly chose **Continue without the visual check**. No browser visual acceptance is claimed. Earlier BMS/SEQ feature HTTP and persistence evidence remains in the [package](SEQ-GENCODE-PACKAGES-2026-10-14.md), [partner access](PARTNER-CUSTOMER-ACCESS-2026-10-14.md) and [partner email](BMS-PARTNER-EMAIL-2026-10-14.md) audits.

## Production configuration preparation

Live ARM reports subscription `c710b26f-e3c7-4a45-9477-eaaf3bdcc329` Enabled, PayAsYouGo, spending limit Off. All three existing `462f8a9` images were Running/Succeeded, confirming control-plane recovery from the prior outage; post-release HTTPS/readiness is verified separately.

All three apps already use `APP_URL=https://genealogiq.com.br`, `BMS_URL=https://bms.genealogiq.com.br`, `SEQUOIA_URL=https://sequoia.genealogiq.com.br` and their corresponding `AUTH_URL`. Four custom-hostname certificate bindings are SniEnabled. Runtime and build media origin is `https://stgenmediaohqluyie.blob.core.windows.net/media`. Local `.env` files were not changed today and retain local development origins; Docker excludes them. The tracked examples now document the current domains and shared Azure database. Authentication, database, email and Stripe credentials remain Key Vault references.

The Stripe API revealed enabled endpoints on the three legacy domains and insufficient event subscriptions. SEQ had no signing secret in either Azure or its local environment. A new live endpoint `we_1UQSrEEgOWciJoSE8V5kCCn7` was prepared at the canonical Sequoia URL, with all nine supported partner/package events and the existing Sequoia API version. Its secret was transferred directly to Key Vault `stripe-webhook-seq`, without printing or saving it locally, and the endpoint was disabled until rollout. A scoped Azure what-if showed only the new Key Vault reference and environment binding (plus the read-only runningStatus display property). The existing managed identity now supplies `STRIPE_WEBHOOK_SECRET=secretref:stripe-webhook-seq`; existing Bicep already declares this optional binding. The ignored enabled-secret inventory was refreshed for future deployments.

Completed endpoint activation, final images, migration and live verification are recorded below. No real checkout or customer email was used as QA. The production package catalog was checked read-only.

## Deployment and remaining evidence

Deployment used the existing immutable-SHA GitHub workflow: five image builds, exactly one migration execution before application image updates, then APP/BMS/SEQ and scheduler/media-job updates. Completed evidence follows. A revision rollback does not roll back the database; the previous image source is `462f8a976ee02156f34e989778abdb00313baa57`.

Real payment settlement, inbox delivery and physical plaque scanning remain distinct integration scenarios. Local HTTP/DOM/decoded-file checks are not represented as Chrome UI acceptance.

## Clean CI correction

Source `557974fb38d345e1317881b8113c1fa3388580e8` was committed and pushed with the eight prior unpushed commits. CI run `38578460934` passed type checking but failed three Premium confirmation DOM tests: the clean pnpm graph resolved the shared UI's Next navigation to a different peer instance from the BMS mock. The matching deployment run `38578460748` was canceled during image builds, before migration/application updates. BMS Vitest now deduplicates Next resolution; no production component behavior or business expectation was changed. Final rerun evidence is recorded below after completion.

Corrected source **bfa4aa7b98d4f7259e8d353db8f741bede4ac07b** was committed and pushed on main. Six local confirmation tests passed. [CI run 38579229840](https://github.com/genealogiqdev/genealogiq/actions/runs/38579229840) completed successfully, including all quality gates and clean Linux production-image/liveness checks for APP, BMS and SEQ. The same-source Azure image what-if showed only the six intended image fields and read-only runningStatus display properties. No resource replacement, database change or unrelated environment/secret/domain change was present.

## Production completion

[Deploy Azure run 38579230208](https://github.com/genealogiqdev/genealogiq/actions/runs/38579230208) **succeeded**. Release image tag: **bfa4aa7b98d4f7259e8d353db8f741bede4ac07b**. CI passed **147 files / 1,360 tests**, including enabled Azurite; 50 opt-in cases remained skipped. Local Azurite also passed its scoped upload, overwrite rejection, promotion/read and owned-object deletion test.

Migration execution **job-genealogiq-migrate-prod-6ieyq0w** succeeded and reported **No pending migrations to apply**. It ran once for this deployment. Earlier execution `bw1nq8o` was explicitly read-only catalog inspection, not another migration: active `GENCODE_VIRTUAL_BRL`, BRL 150.00, minimum 20, product/price IDs present and zero incomplete migration records. Stripe independently confirmed the linked price is active at 15,000 BRL cents and belongs to the stored product.

| App | Active revision | Health / traffic | Custom-origin live / ready |
| --- | --- | --- | --- |
| APP | `ca-genealogiq-app-prod--0000014` | Healthy, Running, 100% | 200 / 200 |
| BMS | `ca-genealogiq-bms-prod--0000014` | Healthy, Running, 100% | 200 / 200 |
| SEQ | `ca-genealogiq-seq-prod--0000015` | Healthy, Running, 100% | 200 / 200 |

Migration, daily scheduler and media migration jobs also use this SHA and have Succeeded provisioning. Today's existing daily execution `job-genealogiq-daily-prod-29865960` succeeded at 06:00 UTC; no extra mail-producing daily run was triggered. PostgreSQL is Ready, public access Disabled, PITR retention 14 days. All eight metric alerts remain enabled. All four managed certificates are Succeeded/SniEnabled. The repository Azure verifier passed generated-domain health and production media-storage checks; historical failed job records were retained.

Seventeen production HTTP result groups passed after the latest revisions became ready: custom-domain health/readiness, three sign-in forms, anonymous protected-route redirects, canonical Credentials callback origins, www liveness, unauthenticated daily-job rejection (401), and the exact reported printed QR. That QR now emits the profile redirect; the destination profile and explicit `?view=details` both return 200. Streaming redirects legitimately begin with HTTP 200 and contain Next's meta redirect; status alone was not used to declare success.

## Stripe production cutover

After the new revisions were ready, APP/BMS existing webhook URLs were updated in place, preserving signing secrets/API versions and adding required events. The new SEQ endpoint was enabled and its legacy endpoint retained disabled, avoiding duplicate active endpoints for the same app.

| App | Active endpoint | Canonical URL | Subscribed events |
| --- | --- | --- | --- |
| APP | `we_1U2M8EEgOWciJoSEzW1EobWS` | `https://genealogiq.com.br/api/stripe/webhook` | Seven consumer checkout/subscription/invoice events |
| BMS | `we_1U8J9FEgOWciJoSENm7uDz5b` | `https://bms.genealogiq.com.br/api/stripe/webhook` | Nine package/subscription/invoice events |
| SEQ | `we_1UQSrEEgOWciJoSE8V5kCCn7` | `https://sequoia.genealogiq.com.br/api/stripe/webhook` | Nine package/subscription/invoice events |

Legacy SEQ endpoint `we_1U2MDEEgOWciJoSEpaW7miXS` remains recoverable at its prior URL. Its signing secret was unavailable; no APP/BMS secret was copied to SEQ. The new secret exists in Key Vault with an Azure reference. Bicep already declares this binding; future deployments must include `stripe-webhook-seq` in discovered enabled-secret names. The ignored local inventory was refreshed.

All three deployed handlers accepted a correctly signed **irrelevant** event with 200 and rejected an invalid signature with 400, before and after deployment. This probe type is outside every business handler and creates no sale, entitlement, payment or email. It verifies the configured signing boundary, not real Stripe settlement/inbox delivery. Canonical auth/media settings remain verified; local `.env` files were neither copied into images nor changed to production databases.

## Final cleanup and limits

No owned local product/build process remains. Shared existing PostgreSQL/Azurite and earlier task fixtures/caches were preserved. No production customer/account/catalog values were rewritten; no real checkout or customer email was used as QA. Visual checking was explicitly waived. Physical scanning, live settlement, OAuth and inbox delivery remain separate unexercised scenarios. Final documentation is committed separately with CI skipped because executable release source is unchanged.
