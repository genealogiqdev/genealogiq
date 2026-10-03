# Shared database and migrations

> **Code:** [schema.prisma](../packages/db/prisma/schema.prisma), [Prisma configuration](../packages/db/prisma.config.ts), [client initialization](../packages/db/src/index.ts), [migration gate](../scripts/check-migrations.mjs)
> **Last verified against code:** 2026-10-03 at `6e06634` plus the current documentation/test/launcher changes.

All three apps consume @genealogiq/db. The schema contains 43 models and the migration tree contains 74 migration.sql files. These counts were recomputed from files, not taken from the old memory. The single-schema check verifies that no app keeps a competing Prisma schema.

## Model/table and creation provenance

| Model | PostgreSQL table | First matching CREATE TABLE in current migrations |
| --- | --- | --- |
| `Subscription` | `subscriptions` | Existing/introspected table; original creation SQL not recorded in this tree |
| `DiscountCoupon` | `discount_coupons` | Existing/introspected table; original creation SQL not recorded in this tree |
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

## Gaps and fixes

### DATABASE-G1: Fresh migration replay lacks a baseline fixture

- **Status:** open
- **Found:** 2026-10-03, source/local bootstrap audit.
- **Evidence:** The schema includes existing/introspected tables without matching CREATE TABLE SQL; setup:local uses db push rather than replaying all migrations on an empty database.
- **Impact:** A new environment cannot assume the migration history alone creates the whole current schema.
- **Root cause:** The current tree preserves incremental history after shared-database consolidation; original baseline provenance is incomplete.
- **Resolution:** Not fixed. Add a disposable empty-database replay/baseline fixture and compare schema independently; preserve deployed migration bookkeeping.

## Verification log

| Date | Revision | Scope | Evidence / limits |
| --- | --- | --- | --- |
| 2026-10-03 | 6e06634 + working changes | Source and checks | 43 models, 74 migrations, single-schema and migration guards pass. |
| 2026-10-03 | Same | Local runtime | db push/generate/local seed ran; PostgreSQL SELECT 1 passed. Full historical migration replay and deployed migration state are n/a. |

## Related

[AGENTS.md](../AGENTS.md) · [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [AUTHENTICATION](AUTHENTICATION.md) · [PARTNER-CREDITS](PARTNER-CREDITS.md) · [HISTORY](HISTORY.md)
