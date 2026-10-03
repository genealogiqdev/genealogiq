# Genealogiq BMS — Agent and Architecture Guide

> **Update rule (mandatory):** Update the affected docs/<FEATURE>.md in the same change. Change this index when app architecture, feature boundaries or app rules change. The [root guide](../../AGENTS.md) owns repository-wide rules.
>
> **Completion rule:** Run the relevant local happy/boundary behavior and a save/reload or downstream check. Documentation/setup work follows the three-app baseline in [LOCAL-DEVELOPMENT](../../docs/LOCAL-DEVELOPMENT.md). Record source, tests and product evidence separately; unavailable fixtures remain n/a.

## Session protocol

1. Read [root AGENTS.md](../../AGENTS.md), this guide and the relevant feature doc; inspect its open gaps and last verified revision.
2. Trace source changes since that revision with git log and include relevant uncommitted changes. Read the installed Next.js documentation before relying on an unfamiliar API.
3. Follow schema → scoped query/action → routed UI/provider boundaries. Add independent literal expectations for changed behavior; existing helper tests prove only their named cases.
4. From the repo root run pnpm test, applicable checks in [TESTING](../../docs/TESTING.md), and node scripts/check-docs.mjs. Serialize client generation and app build checks.
5. Start this app using node scripts/local-qa.mjs --app=bms; verify normal Credentials sign-in, changed happy path, boundary and persisted result. Restore temporary fixture edits and stop only owned processes.
6. Update contracts, rules/why, runbook, permanent gap entries and Verification log. Report actual evidence, n/a prerequisites and cleanup; do not rewrite older dated audits.

## App architecture and invariants

Use verifyAdmin for administrative mutations; staff roles are session claims and do not guarantee immediate revocation. A BMS customer is a Tenant partner. Catalog edits and Stripe synchronization are separate operations. Reporting must distinguish measured empty counts from failed queries and preserve currency meaning. Inspect every daily job step result even when outer ok is true.

The app uses Next.js App Router, server-side queries, server actions and Zod schema factories. Shared database/auth/services/email/core/UI/i18n contracts are indexed in [root AGENTS.md](../../AGENTS.md). Local origin is http://localhost:3001; use canonical localhost for auth redirects/cookies.

## Feature index

| Feature | Purpose | Main code | Test command from repo root |
| --- | --- | --- | --- |
| [ACCOUNTS-STAFF](docs/ACCOUNTS-STAFF.md) | Back-office accounts, staff and company | `src/actions/auth.ts` | `pnpm test` |
| [PARTNERS](docs/PARTNERS.md) | Partner registry and invitations | `src/actions/customer.actions.ts` | `pnpm test` |
| [PARTNER-PLANS-CONTRACTS](docs/PARTNER-PLANS-CONTRACTS.md) | Partner plans and annual contracts | `src/actions/partner-plan.actions.ts` | `pnpm test` |
| [GENCODE-PACKAGES](docs/GENCODE-PACKAGES.md) | Standalone GenCode package sales | `src/actions/gencode-package.actions.ts` | `pnpm test` |
| [CONSUMER-PRICING](docs/CONSUMER-PRICING.md) | Consumer plans and extra-unit price book | `src/actions/subscription.actions.ts` | `pnpm test` |
| [DISCOUNT-COUPONS](docs/DISCOUNT-COUPONS.md) | Discount coupon management | `src/actions/discount-coupon.actions.ts` | `pnpm test` |
| [REPORTING](docs/REPORTING.md) | Partner funnel and commercial reporting | `src/queries/reports.ts` | `pnpm test` |
| [DAILY-JOB](docs/DAILY-JOB.md) | Daily partner lifecycle and reconciliation | `src/app/api/cron/daily/route.ts` | `pnpm test` |
| [SUPPORT-FEEDBACK](docs/SUPPORT-FEEDBACK.md) | Back-office support feedback | `src/actions/feedback.actions.ts` | `pnpm test` |

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
