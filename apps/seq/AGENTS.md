# Sequoia SEQ — Agent and Architecture Guide

> **Update rule (mandatory):** Update the affected docs/<FEATURE>.md in the same change. Change this index when app architecture, feature boundaries or app rules change. The [root guide](../../AGENTS.md) owns repository-wide rules.
>
> **Completion rule:** Run the relevant local happy/boundary behavior and a save/reload or downstream check. Documentation/setup work follows the three-app baseline in [LOCAL-DEVELOPMENT](../../docs/LOCAL-DEVELOPMENT.md). Record source, tests and product evidence separately; unavailable fixtures remain n/a.

## Session protocol

1. Read [root AGENTS.md](../../AGENTS.md), this guide and the relevant feature doc; inspect its open gaps and last verified revision.
2. Trace source changes since that revision with git log and include relevant uncommitted changes. Read the installed Next.js documentation before relying on an unfamiliar API.
3. Follow schema → scoped query/action → routed UI/provider boundaries. Add independent literal expectations for changed behavior; existing helper tests prove only their named cases.
4. From the repo root run pnpm test, applicable checks in [TESTING](../../docs/TESTING.md), and node scripts/check-docs.mjs. Serialize client generation and app build checks.
5. Start this app using node scripts/local-qa.mjs --app=seq; verify normal Credentials sign-in, changed happy path, boundary and persisted result. Restore temporary fixture edits and stop only owned processes.
6. Update contracts, rules/why, runbook, permanent gap entries and Verification log. Report actual evidence, n/a prerequisites and cleanup; do not rewrite older dated audits.

## App architecture and invariants

Resolve tenant scope with verifyTenantSession; never trust a browser tenantId. SEQ customer records use AppUser.tenantId. Administrative staff actions use verifyAdmin; operational inventory uses its documented gates. Current purchasing checks tenant membership only, which is an open policy gap. Supplier module flags still gate real supplier screens; retired digital-license screens must not return.

Customer memorials are accepted APP_MEMO/APP_PET guardianships. Read human/pet capacity from the customer's live consumer plan; GenCode inventory is independent. The QR dialog rechecks customer tenant, guardianship and plan on opening and each export, including from the memorial detail screen.

The app uses Next.js App Router, server-side queries, server actions and Zod schema factories. Shared database/auth/services/email/core/UI/i18n contracts are indexed in [root AGENTS.md](../../AGENTS.md). Default local origin is http://localhost:3002; use the launcher's configured canonical host/port for auth redirects and cookies. See [LOCAL-DEVELOPMENT](../../docs/LOCAL-DEVELOPMENT.md) for isolated sessions.

## Feature index

| Feature | Purpose | Main code | Test command from repo root |
| --- | --- | --- | --- |
| [ACCOUNTS-STAFF](docs/ACCOUNTS-STAFF.md) | Tenant accounts, staff and company | `src/actions/auth.ts` | `pnpm test` |
| [CUSTOMERS-MEMORIALS](docs/CUSTOMERS-MEMORIALS.md) | Tenant consumers, categories and memorial records | `src/actions/customer.actions.ts` | `pnpm test` |
| [SUPPLIERS-CATEGORIES](docs/SUPPLIERS-CATEGORIES.md) | Tenant suppliers and categories | `src/actions/supplier.actions.ts` | `pnpm test` |
| [GENCODE-OPERATIONS](docs/GENCODE-OPERATIONS.md) | GenCode sales, printing and installation | `src/actions/gencode.actions.ts` | `pnpm test` |
| [PARTNER-PURCHASING](docs/PARTNER-PURCHASING.md) | Partner purchasing and annual subscription | `src/actions/partner-plan.actions.ts` | `pnpm test` |
| [DASHBOARD](docs/DASHBOARD.md) | Tenant operational dashboard | `src/queries/dashboard.ts` | `pnpm test` |
| [SUPPORT-FEEDBACK](docs/SUPPORT-FEEDBACK.md) | Tenant support feedback | `src/actions/feedback.actions.ts` | `pnpm test` |

## Local run and checks

Use [LOCAL-DEVELOPMENT](../../docs/LOCAL-DEVELOPMENT.md) for the fixed local-only seed identity, service startup/readiness, baseline steps and recovery. The launcher supplies ephemeral per-app AUTH_SECRET values and overrides cloud keys in child processes. Each app requires its own sign-in; old cookies fail after restart. Real payments, email, OAuth, push, production PWA and upstream imports require their own test fixtures.

[TESTING](../../docs/TESTING.md) lists the successful full-suite and integration commands. [OBSERVABILITY](../../docs/OBSERVABILITY.md) separates liveness, DB readiness, domain logs and business outcomes. [GAPS](../../docs/GAPS.md) prioritizes unresolved issues; this app's detailed entries live in the feature documents.

## Verification and memory

**Last verified against code:** 2026-10-03 at `6e06634` including this task's uncommitted docs, tests and local launcher. See [the dated audit](../../docs/audits/AGENT-MEMORY-2026-10-03.md) for automated/runtime/UI scope. [HISTORY](../../docs/HISTORY.md) preserves previous memory and the migration table. CLAUDE.md is the existing pointer to this guide.

## Installed Next.js agent rules (preserved)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
