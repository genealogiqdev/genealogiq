# Gap index and pending decisions

> **Source verification:** Original inventory at `6e06634` (2026-10-03), with targeted Gen2026 resolutions at `9253152` plus this change (2026-10-07). Detailed permanent entries live in the linked feature docs; this index does not replace their history.

## Issues affecting confidentiality, authority or business outcomes

| Feature / gap | Evidence and impact | Next action |
| --- | --- | --- |
| [DOCUMENTS-G1](../apps/app/docs/DOCUMENTS.md) | Private document is hidden from the list but its public media URL remains readable. | Read evidence/resolution in the permanent entry; policy fixes are not made by this documentation task |
| [PUBLIC-PROFILES-G1](../apps/app/docs/PUBLIC-PROFILES.md) | Authenticated search does not filter private living profiles. | Read evidence/resolution in the permanent entry; policy fixes are not made by this documentation task |
| [AUTHENTICATION-G1](AUTHENTICATION.md) | Session role/tenant claims are not immediately revoked by a live user-state check. | Read evidence/resolution in the permanent entry; policy fixes are not made by this documentation task |
| [PARTNER-PURCHASING-G1](../apps/seq/docs/PARTNER-PURCHASING.md) | Current checkout uses tenant membership, while older docs claimed an admin-only role policy. | Read evidence/resolution in the permanent entry; policy fixes are not made by this documentation task |
| [EMAIL-DELIVERY-G1](EMAIL-DELIVERY.md) | Fixed 2026-10-07: resolved Resend errors now throw; onboarding reports committed registration with email pending. | Real inbox delivery remains EMAIL-DELIVERY-G2 |
| [PARTNER-PLANS-CONTRACTS-G1](../apps/bms/docs/PARTNER-PLANS-CONTRACTS.md) | Fixed 2026-10-07: callbacks now target /sales/contracts and the fallback BMS origin. | Literal action tests pass; signed Stripe return remains a provider scenario |
| [REPORTING-G1](../apps/bms/docs/REPORTING.md) | Dashboard aggregates money without preserving currency partition. | Read evidence/resolution in the permanent entry; policy fixes are not made by this documentation task |
| [REPORTING-G2](../apps/bms/docs/REPORTING.md) | Trial conversion is counted without attribution to the trial cohort. | Read evidence/resolution in the permanent entry; policy fixes are not made by this documentation task |
| [BILLING-QUOTAS-G2](../apps/app/docs/BILLING-QUOTAS.md) | Fixed 2026-10-07: guarded seed now creates a missing FREE fallback without changing existing settings. | Local APP rendered the expected free limits; keep the original incident in the feature log |
| [ACCOUNTS-G1](../apps/app/docs/ACCOUNTS.md) | OAuth-only password=null users cannot use password-gated account management. | Read evidence/resolution in the permanent entry; policy fixes are not made by this documentation task |
| [MEMORIALS-GUARDIANS-G1](../apps/app/docs/MEMORIALS-GUARDIANS.md) | Guard helper allows unexpected non-PENDING/non-REJECTED status strings. | Read evidence/resolution in the permanent entry; policy fixes are not made by this documentation task |

The subsequent 0353683 marketing source check also records [MARKETING-FEEDBACK-G2](../apps/app/docs/MARKETING-FEEDBACK.md): the affiliate calculator/photo changes need their own deterministic/browser evidence.

## All feature gaps

Entries include fixed history; the linked **Status** is authoritative. SUPPLIERS-CATEGORIES-G2 was resolved by recovering the documented decision to retain both uniqueness constraints.

| App / feature | Permanent entry | Evidence / remaining prerequisite |
| --- | --- | --- |
| APP / ACCOUNTS | [ACCOUNTS-G1: OAuth-only account management](../apps/app/docs/ACCOUNTS.md) | changePassword, requestEmailChange and deleteAccount require a stored password, while Google users may have password=null. |
| APP / ACCOUNTS | [ACCOUNTS-G2: Profile form cancels email-change submission](../apps/app/docs/ACCOUNTS.md) | Fixed: the email dialog isolates submit propagation; real-portal regression and local browser/database/mail-capture evidence recorded on 2026-10-07. |
| APP / PUBLIC-PROFILES | [PUBLIC-PROFILES-G1: Private profiles appear in authenticated search](../apps/app/docs/PUBLIC-PROFILES.md) | src/app/api/search/route.ts queries AppUser without filtering isPublicProfile. |
| APP / MEMORIALS-GUARDIANS | [MEMORIALS-GUARDIANS-G1: Guard helper accepts unexpected status](../apps/app/docs/MEMORIALS-GUARDIANS.md) | canManageProfile in src/lib/profile.ts accepts any provided guardian status except PENDING/REJECTED, whereas old docs required exactly ACCEPTED. |
| APP / FAMILY-TREE | [FAMILY-TREE-G1: Import provenance is not retained](../apps/app/docs/FAMILY-TREE.md) | WikiTree prefill is saved as ordinary profile fields without durable source attribution. |
| APP / GALLERY | [GALLERY-G1: Browser codec behavior has no runtime fixture](../apps/app/docs/GALLERY.md) | video-transcode.ts uses browser ffmpeg; server quota tests do not exercise codecs/memory. |
| APP / DOCUMENTS | [DOCUMENTS-G1: Private document bytes use a public object](../apps/app/docs/DOCUMENTS.md) | isPublic filters the document query, but media-storage promotes every document into the public media container. |
| APP / stored text | [DOCUMENTS-G2](../apps/app/docs/DOCUMENTS.md) · [DATABASE-G2](DATABASE.md) | Approved recovery applied to 67 of the 72 audited fields; all document values are restored. Seven fields retain unknown characters: five untouched values and two partially repaired biographies. |
| APP / TRIBUTES | [TRIBUTES-G1: Two-person moderation QA fixture missing](../apps/app/docs/TRIBUTES.md) | The seed has one consumer identity and the existing tribute action tests do not exercise complete author-to-guardian delivery. |
| APP / MESSAGES | [MESSAGES-G1: Activity query lacks deterministic fixture coverage](../apps/app/docs/MESSAGES.md) | notifications.ts ordering/enrichment and deleted actor cases have no query spec; the new tests cover the action boundary only. |
| APP / BILLING-QUOTAS | [BILLING-QUOTAS-G1: Extra-unit checkout has no direct deterministic action test](../apps/app/docs/BILLING-QUOTAS.md) | extra-units.actions.ts delegates to Stripe; existing extra-units tests cover quota arithmetic rather than the checkout action. |
| APP / BILLING-QUOTAS | [BILLING-QUOTAS-G2: Fresh local seed does not create the FREE fallback](../apps/app/docs/BILLING-QUOTAS.md) | Fixed: seed-local.ts and coupon QA fixture create the missing FREE row; original settings are retained. |
| APP / BILLING-QUOTAS | [BILLING-QUOTAS-G3: Custom manual plan absent from the grid](../apps/app/docs/BILLING-QUOTAS.md) | Fixed: account-specific query includes the held manual plan; query tests and APP browser reload show its quotas and finite term. |
| APP / GENCODE-ACTIVATION | [GENCODE-ACTIVATION-G1: Activation browser fixture missing](../apps/app/docs/GENCODE-ACTIVATION.md) | The local seed provides partner balances but no isolated available code tied to a replayable activation scenario. |
| APP / QR-ANALYTICS | [QR-ANALYTICS-G1: Scan browser/persistence fixture missing](../apps/app/docs/QR-ANALYTICS.md) | The new route spec pins malformed input, missing QR, 429 Retry-After and scan/counter transaction arguments. It uses mocked Prisma; the baseline has no activated QR. |
| APP / PWA | [PWA-G1: Production installation and worker QA not exercised](../apps/app/docs/PWA.md) | The audit used next dev, where service workers are intentionally unregistered; pure install helpers passed. |
| APP / WEB-PUSH | [WEB-PUSH-G1: Real push transport is not exercised](../apps/app/docs/WEB-PUSH.md) | local-qa disables VAPID; tests mock endpoint/transport responses. |
| APP / MARKETING-FEEDBACK | [MARKETING-FEEDBACK-G1: Feedback delivery and Turnstile lack provider replay evidence](../apps/app/docs/MARKETING-FEEDBACK.md) | Tests stub the email/verification boundaries; local-qa disables real mail and Turnstile. |
| BMS / ACCOUNTS-STAFF | [ACCOUNTS-STAFF-G1: Initial setup lacks a deterministic fixture](../apps/bms/docs/ACCOUNTS-STAFF.md) | The new company boundary spec verifies administrator rejection/invalid input; auth.ts setupSystem still has no disposable empty-system spec. |
| BMS / PARTNERS | [PARTNERS-G1: Invitation delivery fixture unavailable](../apps/bms/docs/PARTNERS.md) | Manual settlement now verifies inactive-to-active OWNER access and an invitation-failure warning. Actual delivery and password setup remain untested with Resend disabled. |
| BMS / CONSUMERS | [CONSUMERS-G1: No direct independent customer gift flow](../apps/bms/docs/CONSUMERS.md) | Fixed: platform-only registration grants a finite Premium year without a tenant or purchase; local database/browser and duplicate/mail-retry evidence recorded in the consumer audit. |
| BMS / CONSUMERS | [CONSUMERS-G2: External mailbox and Google delivery path not exercised](../apps/bms/docs/CONSUMERS.md) | Local capture, initial password login and existing-account preservation passed; real inbox placement and a Google fixture remain integration prerequisites. |
| BMS / CONSUMERS | [CONSUMERS-G4: BMS directory omitted partner customers](../apps/bms/docs/CONSUMERS.md) | Fixed 2026-10-09: all APP_USER accounts are visible to platform administrators, including partner and inactive accounts; status/company search and company/date display added. Source reviewed; automated and browser tests omitted at the user's request. |
| BMS / PARTNER-PLANS-CONTRACTS | [PARTNER-PLANS-CONTRACTS-G1: Partner checkout callback points to a removed route](../apps/bms/docs/PARTNER-PLANS-CONTRACTS.md) | Fixed: configured/fallback URLs and revalidation use /sales/contracts; literal regression tests cover the action. |
| BMS / PARTNER-PLANS-CONTRACTS | [PARTNER-PLANS-CONTRACTS-G2: Plan CRUD/contract actions have no direct deterministic specs](../apps/bms/docs/PARTNER-PLANS-CONTRACTS.md) | Partially covered: five checkout action tests plus manual settlement action/service tests. Plan CRUD and signed provider replay remain outside this evidence. |
| BMS / GENCODE-PACKAGES | [GENCODE-PACKAGES-G1: Package checkout has no signed full-path replay fixture](../apps/bms/docs/GENCODE-PACKAGES.md) | Action/schema and shared service specs exist; the audit did not create a checkout or deliver a package email. |
| BMS / CONSUMER-PRICING | [CONSUMER-PRICING-G1: Pricing actions have only helper coverage](../apps/bms/docs/CONSUMER-PRICING.md) | subscription.actions.ts and extra-unit-price.actions.ts have no direct action specs; price-book.test.ts exercises formatting/conversion. |
| BMS / DISCOUNT-COUPONS | [DISCOUNT-COUPONS-G1: Legacy coupon E2E would call live Stripe without an isolated fixture](../apps/bms/docs/DISCOUNT-COUPONS.md) | e2e CRUD specs reuse an existing server and create discount coupons; the isolated launcher disables Stripe. |
| BMS / DISCOUNT-COUPONS | [DISCOUNT-COUPONS-G2: External settlement depended on Stripe](../apps/bms/docs/DISCOUNT-COUPONS.md) | Fixed: BMS-only Gen2026 review, atomic receipt/entitlement and three sale types; real PostgreSQL concurrency/rollback and browser acceptance recorded. |
| BMS / DISCOUNT-COUPONS | [DISCOUNT-COUPONS-G3: Wide table displaced the application button](../apps/bms/docs/DISCOUNT-COUPONS.md) | Fixed: BMS content can shrink and coupon actions wrap; table overflow stays within the table. |
| BMS / DISCOUNT-COUPONS | [DISCOUNT-COUPONS-G4: Audit foreign key blocked consumer deletion](../apps/bms/docs/DISCOUNT-COUPONS.md) | Fixed: durable result identity survives optional AppSale detachment; real PostgreSQL deletion/retry/receipt-reuse regression passes. |
| BMS / REPORTING | [REPORTING-G1: Dashboard combines currencies](../apps/bms/docs/REPORTING.md) | dashboard.ts sums paid amounts without partitioning currency, while the report has currency-specific results. |
| BMS / REPORTING | [REPORTING-G2: Trial conversion is not attributed to a trial cohort](../apps/bms/docs/REPORTING.md) | getTrialConversion counts paid subscriptions without a join from each trial memorial to its conversion event. |
| BMS / REPORTING | [REPORTING-G3: Dashboard query lacks direct deterministic coverage](../apps/bms/docs/REPORTING.md) | reports.test.ts covers pure folds and selected report behavior; dashboard.ts has no direct query fixture. |
| BMS / DAILY-JOB | [DAILY-JOB-G1: Complete daily lifecycle replay is absent](../apps/bms/docs/DAILY-JOB.md) | The route specs mock the five services; no complete expired-cycle/trial/storage fixture was exercised. |
| BMS / SUPPORT-FEEDBACK | [SUPPORT-FEEDBACK-G1: Support transport has no replay fixture](../apps/bms/docs/SUPPORT-FEEDBACK.md) | The BMS action specs mock email; local-qa disables Resend. |
| SEQ / ACCOUNTS-STAFF | [ACCOUNTS-STAFF-G1: Cross-tenant staff browser fixture missing](../apps/seq/docs/ACCOUNTS-STAFF.md) | The seed has one interactive tenant identity; action tests mock scope, while manual QA verified only that tenant and the anonymous wall. |
| SEQ / CUSTOMERS-MEMORIALS | [CUSTOMERS-MEMORIALS-G1: Consumer creation mail and cross-tenant browser fixture missing](../apps/seq/docs/CUSTOMERS-MEMORIALS.md) | Unit actions use mocked DB/email; the company baseline does not exercise consumer invitations or second-tenant IDs. |
| SEQ / CUSTOMERS-MEMORIALS | [CUSTOMERS-MEMORIALS-G2: QR download returns not found](../apps/seq/docs/CUSTOMERS-MEMORIALS.md) | Fixed: Baixar opens PNG/SVG presets for the scoped customer's accepted guardianships, including tenantless profiles; query/DOM regression tests cover the change. Authenticated product QA remains pending. |
| SEQ / SUPPLIERS-CATEGORIES | [SUPPLIERS-CATEGORIES-G1: Supplier browser and module-off fixtures missing](../apps/seq/docs/SUPPLIERS-CATEGORIES.md) | Deterministic action specs exist; the audit did not create supplier records or disable modules in product QA. |
| SEQ / SUPPLIERS-CATEGORIES | [SUPPLIERS-CATEGORIES-G2: Supplier taxId remains globally unique despite tenant index](../apps/seq/docs/SUPPLIERS-CATEGORIES.md) | Supplier.taxId is @unique in the current schema. The named per-tenant migration adds (tenant_id,tax_id) uniqueness but does not remove the global constraint. |
| SEQ / GENCODE-OPERATIONS | [GENCODE-OPERATIONS-G1: Inventory browser fixture lacks funded codes](../apps/seq/docs/GENCODE-OPERATIONS.md) | The local baseline used company editing; code action tests mock the shared credit service. |
| SEQ / PARTNER-PURCHASING | [PARTNER-PURCHASING-G1: Tenant purchasing is not admin-only](../apps/seq/docs/PARTNER-PURCHASING.md) | subscribeToPartnerPlan calls verifyTenantSession and never verifyAdmin; the page also only verifies tenant membership. |
| SEQ / PARTNER-PURCHASING | [PARTNER-PURCHASING-G2: SEQ webhook and signed purchase replay lack direct coverage](../apps/seq/docs/PARTNER-PURCHASING.md) | The new action spec pins session-derived tenant, lowercase brl currency, callback URLs and invalid cadence/auth rejection. SEQ webhook routing and signed full-path replay remain untested. |
| SEQ / DASHBOARD | [DASHBOARD-G1: Dashboard SQL and browser dataset missing](../apps/seq/docs/DASHBOARD.md) | The new mocked query spec pins exact October totals, legacy null channel, twelve-month empty spine and tenant bind values; real PostgreSQL aggregates have no controlled two-tenant fixture. |
| SEQ / SUPPORT-FEEDBACK | [SUPPORT-FEEDBACK-G1: Tenant support delivery fixture unavailable](../apps/seq/docs/SUPPORT-FEEDBACK.md) | Unit actions mock email and the isolated launcher disables Resend. |
| SHARED / AUTHENTICATION | [AUTHENTICATION-G1: Session role revocation is not immediate](AUTHENTICATION.md) | JWT carries a role/tenant snapshot and edge checks do not reload live user activation/role on every request. |
| SHARED / PARTNER-CREDITS | [PARTNER-CREDITS-G1: End-to-end ledger/reconciliation fixture missing](PARTNER-CREDITS.md) | Manual coupon PostgreSQL fixtures now verify real grant, stock, rollover, idempotency and rollback. Full signed-event/daily reconciliation replay remains absent. |
| SHARED / MEDIA-STORAGE | [MEDIA-STORAGE-G1: Browser upload fixture not exercised](MEDIA-STORAGE.md) | The Azurite API/storage integration passed, but the audit did not upload/save through each app browser form. |
| SHARED / MEDIA-MIGRATION | [MEDIA-MIGRATION-G1: Full resumable migration fixture absent](MEDIA-MIGRATION.md) | Only helper tests ran; no legacy source/CDN copy, conditional DB rewrite, rollback or resumed manifest was exercised. |
| SHARED / MEDIA-MIGRATION | [MEDIA-MIGRATION-G2: Manifest override missing from declared environment contract](MEDIA-MIGRATION.md) | MEDIA_MIGRATION_MANIFEST_BLOB is read in media-migration.ts but absent from turbo.json globalEnv and .env examples. |
| SHARED / EMAIL-DELIVERY | [EMAIL-DELIVERY-G1: Resolved provider error is ignored](EMAIL-DELIVERY.md) | Fixed: shared transport checks the returned error; regression covers rejection and onboarding recovery without duplicate credits. |
| SHARED / EMAIL-DELIVERY | [EMAIL-DELIVERY-G2: No recorded email provider delivery fixture](EMAIL-DELIVERY.md) | The new email Vitest project pins escaping, the verification base URL and thrown transport errors. It does not replay Resend responses or confirm inbox delivery. |

Cross-cutting gaps: [DATABASE-G1](DATABASE.md#gaps-and-fixes) (fresh migration baseline), [CONFIGURATION-G1](CONFIGURATION.md#gaps-and-fixes) (distributed environment validation), [TESTING-G1/G2](TESTING.md#gaps-and-fixes) (legacy E2E isolation and complete provider/DB replay) and [OBSERVABILITY-G1](OBSERVABILITY.md#gaps-and-fixes) (durable correlation). [LOCAL-DEVELOPMENT-G2](LOCAL-DEVELOPMENT.md#local-development-g2-recursive-local-standalone-output-exhausts-disk) records the fixed recursive local standalone-copy incident; clean production container validation remains a distinct check.

## Pending large-file memory migration

[HISTORY](HISTORY.md) provides the concrete migration table and byte-identical recovery copy of the 815-line APP CLAUDE.md. The user explicitly approved replacement on 2026-10-03. APP CLAUDE.md now points to AGENTS.md; all original bytes remain in the archive.

## Deferred work

Full provider fixtures, remaining second-consumer/two-tenant scenarios and production PWA/push/browser codec evidence are scoped by their gap entries. A missing fixture is not a current code bug or a completed product pass. The original bootstrap introduced no product feature or deployment; the subsequent Gen2026 implementation and its targeted local evidence are recorded separately.

## Find and maintain entries

From the repository root use `rg "Status:\*\* open" docs apps/app/docs apps/bms/docs apps/seq/docs`. New entries go at the top of the relevant feature section; keep permanent IDs and original evidence. When fixed, change status to fixed and record the date, commit/change and regression test. Append new verification evidence without rewriting old dated audits.
