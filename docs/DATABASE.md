# Shared database and migrations

> **Code:** [schema.prisma](../packages/db/prisma/schema.prisma), [Prisma configuration](../packages/db/prisma.config.ts), [client initialization](../packages/db/src/index.ts), [migration gate](../scripts/check-migrations.mjs)
> **Last verified against code:** 2026-10-07 at `9253152` plus the Gen2026 schema and migration; earlier audits remain below.

All three apps consume @genealogiq/db. The schema contains 44 models and the migration tree contains 75 migration.sql files, including the 2026-10-07 manual coupon settlement change. These counts were recomputed from files. The single-schema check verifies that no app keeps a competing Prisma schema.

## Model/table and creation provenance

| Model | PostgreSQL table | First matching CREATE TABLE in current migrations |
| --- | --- | --- |
| `Subscription` | `subscriptions` | Existing/introspected table; original creation SQL not recorded in this tree |
| `DiscountCoupon` | `discount_coupons` | Existing/introspected table; original creation SQL not recorded in this tree |
| `CouponRedemption` | `coupon_redemptions` | [20261007000000_manual_coupon_redemptions](../packages/db/prisma/migrations/20261007000000_manual_coupon_redemptions/migration.sql) |
| `AppSale` | `app_sales` | Existing/introspected table; original creation SQL not recorded in this tree |
| `StripeEvent` | `stripe_events` | [20260517000000_align_app_sale_stripe](../packages/db/prisma/migrations/20260517000000_align_app_sale_stripe/migration.sql) |
| `ExtraUnitPrice` | `app_extra_unit_prices` | [20260805000000_extra_unit_purchases](../packages/db/prisma/migrations/20260805000000_extra_unit_purchases/migration.sql) |
| `ExtraUnitPurchase` | `app_extra_unit_purchases` | [20260805000000_extra_unit_purchases](../packages/db/prisma/migrations/20260805000000_extra_unit_purchases/migration.sql) |
| `RateLimitAttempt` | `rate_limit_attempts` | [20260520000000_rate_limit_attempts](../packages/db/prisma/migrations/20260520000000_rate_limit_attempts/migration.sql) |
| `EmailToken` | `email_tokens` | [0_init](../packages/db/prisma/migrations/0_init/migration.sql) |
| `PasswordResetToken` | `password_reset_tokens` | [0_init](../packages/db/prisma/migrations/0_init/migration.sql) |
| `Address` | `addresses` | [20260403000000_expand_schema_address_categories](../packages/db/prisma/migrations/20260403000000_expand_schema_address_categories/migration.sql) |
| `Company` | `companies` | [20260401234340_add_company](../packages/db/prisma/migrations/20260401234340_add_company/migration.sql) |
| `User` | `users` | [0_init](../packages/db/prisma/migrations/0_init/migration.sql) |
| `AppUser` | `app_users` | Existing/introspected table; original creation SQL not recorded in this tree |
| `AppUserGuardian` | `app_user_guardians` | Existing/introspected table; original creation SQL not recorded in this tree |
| `Bio` | `app_bios` | Existing/introspected table; original creation SQL not recorded in this tree |
| `BioImage` | `app_bio_images` | Existing/introspected table; original creation SQL not recorded in this tree |
| `Tribute` | `app_tributes` | Existing/introspected table; original creation SQL not recorded in this tree |
| `GalleryItem` | `app_gallery_items` | Existing/introspected table; original creation SQL not recorded in this tree |
| `GeoPlace` | `app_geo_places` | [20260721000000_geo_places](../packages/db/prisma/migrations/20260721000000_geo_places/migration.sql) |
| `Document` | `app_documents` | [20260725010000_app_documents](../packages/db/prisma/migrations/20260725010000_app_documents/migration.sql) |
| `Favorite` | `app_favorites` | Existing/introspected table; original creation SQL not recorded in this tree |
| `Geolocation` | `app_geolocations` | Existing/introspected table; original creation SQL not recorded in this tree |
| `FamilyRelation` | `app_family_relations` | Existing/introspected table; original creation SQL not recorded in this tree |
| `PetOwnership` | `app_pet_ownerships` | [20260922000000_pet_ownerships](../packages/db/prisma/migrations/20260922000000_pet_ownerships/migration.sql) |
| `TreeNodePosition` | `app_tree_node_positions` | [20260724000000_tree_node_positions](../packages/db/prisma/migrations/20260724000000_tree_node_positions/migration.sql) |
| `Notification` | `app_notifications` | [20260512000000_notifications_and_tree_request](../packages/db/prisma/migrations/20260512000000_notifications_and_tree_request/migration.sql) |
| `PushSubscription` | `app_push_subscriptions` | [20260710000000_web_push_subscriptions](../packages/db/prisma/migrations/20260710000000_web_push_subscriptions/migration.sql) |
| `SupplierCategory` | `supplier_categories` | [20260403000000_expand_schema_address_categories](../packages/db/prisma/migrations/20260403000000_expand_schema_address_categories/migration.sql) |
| `Supplier` | `suppliers` | [20260331160225_add_supplier_model](../packages/db/prisma/migrations/20260331160225_add_supplier_model/migration.sql) |
| `Tenant` | `tenants` | Existing/introspected table; original creation SQL not recorded in this tree |
| `AppUserCategory` | `app_user_categories` | Existing/introspected table; original creation SQL not recorded in this tree |
| `QrCode` | `qr_codes` | [20260601000000_qr_code_table](../packages/db/prisma/migrations/20260601000000_qr_code_table/migration.sql) |
| `QrScan` | `qr_scans` | [20260601010000_qr_scan_tracking](../packages/db/prisma/migrations/20260601010000_qr_scan_tracking/migration.sql) |
| `GenCode` | `gencodes` | Existing/introspected table; original creation SQL not recorded in this tree |
| `GenCodePackage` | `gencode_packages` | [20260921000000_gencode_packages](../packages/db/prisma/migrations/20260921000000_gencode_packages/migration.sql) |
| `GenCodeOrder` | `gencode_orders` | [20260921000000_gencode_packages](../packages/db/prisma/migrations/20260921000000_gencode_packages/migration.sql) |
| `PartnerPlan` | `partner_plans` | [20260825233000_partner_plans_and_cycles](../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `PlanPrice` | `plan_prices` | [20260825233000_partner_plans_and_cycles](../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `PartnerSubscription` | `partner_subscriptions` | [20260825233000_partner_plans_and_cycles](../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `SubscriptionCycle` | `subscription_cycles` | [20260825233000_partner_plans_and_cycles](../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) |
| `CreditGrant` | `credit_grants` | [20260826001000_credit_ledger_and_retire_sale](../packages/db/prisma/migrations/20260826001000_credit_ledger_and_retire_sale/migration.sql) |
| `CreditTransaction` | `credit_transactions` | [20260826001000_credit_ledger_and_retire_sale](../packages/db/prisma/migrations/20260826001000_credit_ledger_and_retire_sale/migration.sql) |
| `CreditReservation` | `credit_reservations` | [20260826001000_credit_ledger_and_retire_sale](../packages/db/prisma/migrations/20260826001000_credit_ledger_and_retire_sale/migration.sql) |

The table names above come from @@map. Column names come from each field's @map; do not infer snake_case from a Prisma property. For example, Favorite.userId/targetId map to app_favorites.app_user_id/app_target_id, with a composite primary key and no standalone id. APP consumer ownership uses AppUser.tenantId, while a verified SEQ session exposes the tenant as customerId.

## Current amendments and removed contracts

| Migration | Contract |
| --- | --- |
| [co-guardianship](../packages/db/prisma/migrations/20260516000000_co_guardianship/migration.sql) | Guardianship status and requests |
| [persistent limiter](../packages/db/prisma/migrations/20260520000000_rate_limit_attempts/migration.sql) | Shared persisted rate-limit attempts (path verified by doc gate) |
| [public profile flag](../packages/db/prisma/migrations/20260725000000_app_user_public_profile/migration.sql) | Living profile opt-in visibility |
| [documents](../packages/db/prisma/migrations/20260725010000_app_documents/migration.sql) | Profile document references/visibility |
| [partner plans/cycles](../packages/db/prisma/migrations/20260825233000_partner_plans_and_cycles/migration.sql) | PlanPrice snapshots and annual partner contracts |
| [credit ledger](../packages/db/prisma/migrations/20260826001000_credit_ledger_and_retire_sale/migration.sql) | Grants/reservations/transactions; retired legacy sale path |
| [package orders](../packages/db/prisma/migrations/20260921000000_gencode_packages/migration.sql) | GenCode package catalog/order snapshots |
| [pet ownerships](../packages/db/prisma/migrations/20260922000000_pet_ownerships/migration.sql) | Shared human/pet ownership links |

Commit 2498328 removed maxProfiles; a0aa99b removed memorial bulk-sale binding; 2504132 retired digital SEQ modules; bf57287 retained automatic canvas layout despite the historic TreeNodePosition model. Read feature docs before reviving an old field from CLAUDE/history.

## Local schema setup

### Gen2026 amendment

The [manual coupon migration](../packages/db/prisma/migrations/20261007000000_manual_coupon_redemptions/migration.sql) adds `DiscountCoupon.redemptionMode` (existing rows default to `stripe`), the implicit `_CouponSubscriptions` B2C restriction relation and `CouponRedemption`. The transaction links its receipt to one GenCodeOrder, SubscriptionCycle or AppSale and stores the result's identity separately. Unique request IDs, normalized source/reference pairs and durable `resultId` values prevent duplicate settlement. SQL CHECK constraints require matching result links, manual coupons to be 100%/once without provider IDs and full-discount zero-due audit values. Coupon/package/cycle links restrict deletion; an AppSale link may become null when its consumer account is deleted, preserving the audit and usage count without blocking the existing account lifecycle.

The migration inserts active Gen2026 in manual mode if no case-insensitive code already exists. An existing operator-owned code is preserved for review, not converted silently. The normal local seed also provisions a missing Gen2026 and FREE fallback without updating existing commercial settings. `db push` creates the Prisma shape but does not replay the custom SQL CHECK constraints or migration's data insert; apply the incremental migration on an older local schema, or use an isolated migrated schema when testing those checks. Do not reapply the entire migration to an already-amended database.

The Gen2026 SQL was replayed on a disposable copy of the pre-amendment schema and then applied to the normal loopback database. Eight tests exercise real PostgreSQL transactions, locks, constraints, rollback and consumer deletion with audit retention. This incremental replay does not close the historical empty-database baseline gap. [Audit](audits/GEN2026-2026-10-07.md).

From the repository root, use the explicit loopback database for disposable compose data. [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) has the complete sequence and identity.

1. Run `pnpm db:up`.
2. Set `$env:DATABASE_URL = "postgresql://genealogiq:genealogiq@127.0.0.1:5432/genealogiq"` in PowerShell.
3. Run `pnpm db:generate` once, then `pnpm db:push` and `pnpm seed:local` sequentially.
4. Run `pnpm check:schema-parity` and `pnpm check:migrations`.

The current local setup intentionally uses db push to create the complete introspected schema. The historical migration tree is not a proven fresh-database bootstrap and original creation SQL is absent for some tables. Do not treat an empty local migrate-deploy failure as an app regression. The seed rejects non-loopback databases and a database name other than genealogiq.

## Deployed migrations

[AZURE-AGENT-RUNBOOK](AZURE-AGENT-RUNBOOK.md) and [AZURE-DATABASE-ACCESS](AZURE-DATABASE-ACCESS.md) retain the existing private-database constraints. The current [.github/workflows/migrate.yml](../.github/workflows/migrate.yml) uses workflow_dispatch to invoke an Azure migration job; it is not automatically triggered by an ordinary merge. Cloud writes were not performed in this task. Discover current resource/execution IDs before an authorized operation.

Migration SQL lives in timestamped folders. The gate checks nonempty files and unique ordering; it does not establish replayability, transaction idempotency or the deployed _prisma_migrations state. Preserve destructive-change survey comments and use expand/contract design for rolling app deployments. A container-image rollback does not roll back PostgreSQL.

## Runtime configuration

packages/db/src/index.ts requires DATABASE_URL when imported, selects a PostgreSQL adapter pool (DATABASE_POOL_MAX defaults/falls back to 5), sets a 10-second connect timeout and a 30-second idle timeout, and reuses the development client. [CONFIGURATION](CONFIGURATION.md) records the environment owners and [TESTING](TESTING.md) records the unreachable dummy URL used by deterministic tests.

## Recover damaged APP text

The [repair command](../scripts/azure/repair-app-text.cjs) diagnoses stored content
and applies an explicitly reviewed manifest. It covers text fields in profiles,
biographies, documents, gallery captions, places, resting locations and tributes.
It cannot recover an unknown character from a question mark or determine the
correct spelling of a person's name. For example, both "avós" and "avôs" can lose
their UTF-8 bytes into "av??s". A matching loss signature is a validation guard,
not proof of the original wording.

1. Trace the rendered value to its source. Compare translated labels with stored
   content and check server_encoding/client_encoding through a read-only query.
   If the stored bytes already contain ASCII question marks, changing fonts,
   locale files, HTTP headers or Unicode normalization will not restore them.
2. Run the command without a manifest for a read-only audit. The default output
   includes counts only. The optional --details flag (or
   APP_TEXT_AUDIT_DETAILS=true) emits one private content record per line;
   retain these only in ignored local evidence or the existing private audit
   system. A suspicious run can also be intentional punctuation.
3. Recover original values from a matching backup or review each proposed
   spelling with the content owner. Keep ambiguous values unchanged. Store the
   manifest outside Git, encoded as UTF-8. A synthetic example is:

    {
      "version": 1,
      "repairs": [{
        "table": "app_documents",
        "column": "title",
        "id": "disposable-document-id",
        "before": "Cart??o INSS",
        "after": "Cartão INSS"
      }]
    }

4. Locally, supply the explicit loopback DATABASE_URL and run
   `node scripts/azure/repair-app-text.cjs --plan <private-manifest.json>`.
   For production, use [the private database task runner](AZURE-DATABASE-ACCESS.md)
   with this script and APP_TEXT_REPAIR_PLAN_B64 containing the base64 encoding
   of the UTF-8 manifest bytes. Default execution is read-only. Do not transport
   Unicode SQL or a binary dump through a legacy PowerShell text pipeline;
   use parameterized database calls, explicit UTF-8 files or the runner's
   byte-preserving base64 transport.
5. After review and within the task's authorized production scope, add --apply
   locally or APP_TEXT_REPAIR_APPLY=true to the private job. The command accepts
   only its allowlisted text columns, preserves every intact character, locks
   the target rows and compares their full current values with the manifest.
   Any missing/stale row aborts the whole transaction. Already-correct values
   are skipped. IDs, ownership, roles, privacy, media references and other
   columns are outside the update; updated_at changes only on updated rows.
6. Retain the successful JSON result as the apply receipt. Verify the persisted
   values independently, reload the relevant collection and profile preview,
   and check an invalid input or permission boundary. A job success alone is
   not a UI pass. An idempotent rerun must make no additional writes.
7. If an authorized rollback is needed, use the same manifest with --rollback
   --receipt <apply-receipt.json>, preview first, then --apply. The private job
   equivalents are APP_TEXT_REPAIR_ROLLBACK=true and
   APP_TEXT_REPAIR_RECEIPT_B64. The receipt limits rollback to the fields that
   that run actually updated; a prior correct value is not reverted. A changed
   current value aborts rollback instead of overwriting a later user edit.

Run `node --test scripts/azure/tests/repair-app-text.test.cjs` for the command's
deterministic guards. The [2026-10-07 audit](audits/APP-TEXT-ENCODING-2026-10-07.md)
separates mocked expectations, real local PostgreSQL transactions, browser
save/reload, live read-only diagnosis and unresolved source text.

## Gaps and fixes

### DATABASE-G1: Fresh migration replay lacks a baseline fixture

- **Status:** open
- **Found:** 2026-10-03, source/local bootstrap audit.
- **Evidence:** The schema includes existing/introspected tables without matching CREATE TABLE SQL; setup:local uses db push rather than replaying all migrations on an empty database.
- **Impact:** A new environment cannot assume the migration history alone creates the whole current schema.
- **Root cause:** The current tree preserves incremental history after shared-database consolidation; original baseline provenance is incomplete.
- **Resolution:** Not fixed. Add a disposable empty-database replay/baseline fixture and compare schema independently; preserve deployed migration bookkeeping.

### DATABASE-G2: Persisted APP content has lost non-ASCII characters

- **Status:** open
- **Found:** 2026-10-07, document screenshot investigation and live read-only audit.
- **Evidence:** 72 text values in 23 columns across seven APP tables contain replacement runs. Both PostgreSQL encoding settings are UTF8; the nine locale files had no detected corruption. The available pre-Azure local dump contains no matching original values.
- **Impact:** Profile cards, individual tabs and edit forms repeat the already-damaged content. The original characters cannot be uniquely recovered from ASCII question marks.
- **Root cause:** The data matches replacement of non-ASCII UTF-8 bytes with question marks. The historical write/import that caused it is not established.
- **Resolution:** Initial preparation in 9253152 supplied the guarded recovery command, independent tests and local UI/transaction evidence; production recovery was pending review/application at that point. The applied partial resolution below preserves the remaining uncertain names/symbols until original wording is available. See the runbook and dated audit above.
- **Applied partial resolution:** 2026-10-07, user-approved execution job-genealogiq-migrate-prod-0hno8k3 updated 67 fields across 49 rows using the command from 9253152. A separate read-only execution compared all 72 original targets: zero mismatches, including the five deliberately unchanged fields. All three document values are restored. Seven fields still contain unknown characters (five untouched values and two partially repaired biographies), so this gap remains open. The private receipt, approved manifest and [application audit](audits/APP-TEXT-ENCODING-2026-10-07.md#approved-production-application) preserve the recovery evidence.

## Verification log

| Date | Revision | Scope | Evidence / limits |
| --- | --- | --- | --- |
| 2026-10-03 | 6e06634 + working changes | Source and checks | 43 models, 74 migrations, single-schema and migration guards pass. |
| 2026-10-03 | Same | Local runtime | db push/generate/local seed ran; PostgreSQL SELECT 1 passed. Full historical migration replay and deployed migration state are n/a. |
| 2026-10-07 | 218d5aa + text repair/tests/docs | Source, local runtime and live read-only diagnosis | 12 command tests; real PostgreSQL preview/apply/repeat/receipt rollback/stale-batch checks pass. Live audit finds 72 affected values; no production update or schema migration performed. [Evidence](audits/APP-TEXT-ENCODING-2026-10-07.md). |
| 2026-10-07 | 9253152 recovery command; source unchanged at 074d7bd | Approved production data repair | 67 fields updated across 49 rows. Independent READ ONLY verification: 72 targets checked, zero mismatches, five excluded fields unchanged and seven fields still partly/fully unresolved. Apply receipt retained privately; no schema/deployment change. |
| 2026-10-07 | `9253152` + initial Gen2026 change | Source, incremental migration and local PostgreSQL | 44 models, 75 migrations; initial incremental SQL replay and seven real transaction/concurrency/rollback tests passed. Persisted entitlements checked independently of the UI. Full historical empty-database replay remains n/a. |
| 2026-10-07 | Same change plus durable result identity | Final migration and deletion regression | Final SQL replayed in `genealogiq_coupon_qa_20261007_final`; eight integration tests passed, including consumer deletion without losing the receipt or permitting reuse. The normal local amendment preserved its four existing receipts and entitlements. [Audit](audits/GEN2026-2026-10-07.md). |

## Related

[AGENTS.md](../AGENTS.md) · [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [AUTHENTICATION](AUTHENTICATION.md) · [PARTNER-CREDITS](PARTNER-CREDITS.md) · [HISTORY](HISTORY.md)
