# Genealogiq — Agent and Architecture Guide

> **Update rule (mandatory):** A change updates the applicable feature documentation in the same change. Update this guide when architecture, shared rules, the app/feature index or shared runbooks change. Keep feature detail in the linked documents.
>
> **Completion rule:** Start the relevant local product and manually exercise the changed behavior plus a failure/permission/boundary case. Documentation/setup work uses the three-app baseline in [LOCAL-DEVELOPMENT](docs/LOCAL-DEVELOPMENT.md). Record source, tests, runtime and UI evidence separately. A listening port, build or signed-in screen alone does not verify a feature; a missing prerequisite stays n/a with the remaining scenario.

## Session protocol (every session, every agent)

1. Read this guide, the relevant app's AGENTS.md and feature document before changing code. Check [open gaps](docs/GAPS.md), the last verification revision and the working tree.
2. Recheck source affected since the last recorded revision: git log --oneline <last-sha>..HEAD -- <feature-paths>. Include uncommitted changes; a date does not prove runtime behavior.
3. Trace the entry, session/role/tenant or public scope, Zod contract, query/action, schema and provider boundary. Read the installed Next.js guide under the app's node_modules/next/dist/docs/ before using an unfamiliar API.
4. Make the smallest relevant change and add meaningful independent test expectations for changed behavior. Never derive expected business output from the implementation under test.
5. Run the applicable checks in [TESTING](docs/TESTING.md), then the local happy/boundary scenario and persistence check in [LOCAL-DEVELOPMENT](docs/LOCAL-DEVELOPMENT.md).
6. Update the feature's contracts, rules/why, runbook, permanent gaps and Verification log. Append new audit evidence; preserve previous incidents, figures and removed-behavior history.
7. Report the outcome, actual test/runtime/UI evidence, n/a prerequisites and owned-process cleanup. A blocked integration is not a pass.

## Repository and apps

The pnpm/Turbo monorepo has three Next.js apps and shared workspace packages. The apps share one PostgreSQL database and canonical Prisma schema.

| App | Agent guide | Product responsibility | Local origin |
| --- | --- | --- | --- |
| APP | [apps/app/AGENTS.md](apps/app/AGENTS.md) | Consumer accounts, public profiles, memorials, genealogy, media and consumer billing | http://localhost:3000 |
| BMS | [apps/bms/AGENTS.md](apps/bms/AGENTS.md) | Back-office company/staff, partner catalog, contracts, pricing, package sales and reporting | http://localhost:3001 |
| SEQ | [apps/seq/AGENTS.md](apps/seq/AGENTS.md) | Tenant staff, customers/suppliers, GenCode inventory, purchasing and operations | http://localhost:3002 |

| Shared package | Responsibility |
| --- | --- |
| packages/db | Canonical schema, generated Prisma client, PostgreSQL adapter |
| packages/auth | NextAuth identity, per-app cookies, session/DAL guards, tenant scope, lockout |
| packages/core | ActionResult, currency/token/media client and pure contracts |
| packages/services | Stripe lifecycle, credit ledger, Azure media and migration |
| packages/email | Transactional Resend transport/templates |
| packages/i18n, packages/ui | Locale rules and shared UI components |

## Shared feature index

| Feature | Purpose | Main code | Test command |
| --- | --- | --- | --- |
| [AUTHENTICATION](docs/AUTHENTICATION.md) | Shared authentication, sessions and tenant authorization | `packages/auth/src/node.ts` | `pnpm test` |
| [PARTNER-CREDITS](docs/PARTNER-CREDITS.md) | Partner credit ledger, cycles and reconciliation | `packages/services/src/credits.ts` | `pnpm test` |
| [MEDIA-STORAGE](docs/MEDIA-STORAGE.md) | Azure media authorization and promotion | `packages/services/src/media-storage.ts` | `pnpm test` |
| [MEDIA-MIGRATION](docs/MEDIA-MIGRATION.md) | Resumable legacy-media migration | `packages/services/src/media-migration.ts` | `pnpm test` |
| [EMAIL-DELIVERY](docs/EMAIL-DELIVERY.md) | Transactional email delivery | `packages/email/src/index.ts` | `pnpm test` |

The app indexes contain 18 APP, nine BMS and seven SEQ feature documents; the five shared documents bring the inventory to 39. Feature boundaries describe independently entered contracts, not promises of complete test or UI coverage.

## Invariants

- Keep one schema at packages/db/prisma/schema.prisma and migrations at packages/db/prisma/migrations/; consume @genealogiq/db rather than duplicate a generated client per app.
- APP identities are AppUser; BMS/SEQ staff are User. BMS partners are Tenant; SEQ consumers are AppUser. The DAL returns verified SEQ tenant scope as session.customerId, which queries map to tenantId columns.
- UI visibility is not authorization. Recheck scope/permissions on every mutation. The current DAL reads session roles; immediate role revocation is an open gap, not an established guarantee.
- Use done/ok/fail from @genealogiq/core and schema factories with translated errors. Do not revive removed digital-license/quota fields from historical notes.
- Preserve recorded sale prices, purchased extra-unit quantities, partner-cycle snapshots, credit idempotency and ledger history when catalogs change. APP base quotas currently read the live Subscription; they are not purchase-time snapshots. Payment redirects do not establish paid entitlement.
- Manual 100% coupons are applied only by privileged BMS staff after external-payment or old-stock confirmation. Keep CouponRedemption and the finite entitlement atomic; reuse shared package/cycle writers and provision first-time partner access after settlement. [Discount coupons](apps/bms/docs/DISCOUNT-COUPONS.md) owns the contract and audit.
- Generate Prisma once and run generation/typecheck/lint/build sequentially. Concurrent Turbo tasks can race on generated Windows files; build after stopping dev servers that share .next.
- Follow current Azure infrastructure/runbooks for cloud operations. Local baseline work uses the loopback database/Azurite launcher. Use existing credentials without printing them; cloud writes, mail, checkout, pushes and deployments follow the scope explicitly authorized by the task.

## Cross-cutting runbooks

| Document | Use |
| --- | --- |
| [LOCAL-DEVELOPMENT](docs/LOCAL-DEVELOPMENT.md) | Setup, normal local identity, three-app baseline, readiness, stop/recovery |
| [DATABASE](docs/DATABASE.md) | Model/table/migration inventory, schema paths and reviewed stored-text recovery |
| [CONFIGURATION](docs/CONFIGURATION.md) | Environment ownership/defaults, restart/rebuild rules and optional provider modes |
| [TESTING](docs/TESTING.md) | Deterministic, schema/i18n, build, public E2E and enabled Azurite checks |
| [OBSERVABILITY](docs/OBSERVABILITY.md) | Logs, health endpoints, ledger and provider failure diagnosis |
| [RUNBOOKS](docs/RUNBOOKS.md) | Repeated change/recovery/migration procedures |
| [GAPS](docs/GAPS.md) | Prioritized links to permanent feature gap entries |
| [HISTORY](docs/HISTORY.md) | Original memory, incident preservation and approved migration table |
| [Dated audit](docs/audits/AGENT-MEMORY-2026-10-03.md) | This bootstrap's expected/observed evidence and limits |
| [Azure operational guide](docs/AZURE-AGENT-RUNBOOK.md) | Existing deployment/database/media operational constraints |
| [Domain cutover](docs/AZURE-DEPLOYMENT.md#dns-and-managed-tls) | Hostinger DNS, Azure managed TLS, canonical origins and media CORS |

## Self-learning memory

Use `node scripts/check-docs.mjs` to validate indexes, links, feature paths/symbols and required sections. Use `rg "Status:\*\* open" docs apps/app/docs apps/bms/docs apps/seq/docs` to find permanent open entries. Never delete a fixed gap; add its resolution, regression test and commit. Historical docs are explicitly labeled and linked, not treated as current live-resource evidence.

**Last source verification:** 2026-10-03 at `6e06634`, including this task's uncommitted docs, launcher and tests. Runtime/UI evidence has its own dated audit.

**Domain configuration verification:** 2026-10-03 at `7d267f7` plus domain changes;
[cutover audit](docs/audits/AZURE-DOMAINS-2026-10-03.md) separates source/tests,
live Azure/HTTPS/browser evidence, local baseline, cleanup and provider limits.

**Stored-text investigation:** 2026-10-07, [APP text audit](docs/audits/APP-TEXT-ENCODING-2026-10-07.md).
Current source preserves accents; the live read-only audit found damaged
persisted content. The approved recovery restored 67 fields in production;
seven fields still contain uncertain characters. Review the recovery runbook
and remaining originals before assuming a locale/font change can repair stored
question marks.
