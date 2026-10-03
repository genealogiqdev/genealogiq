# Genealogiq APP — Agent and Architecture Guide

> **Update rule (mandatory):** Update the affected docs/<FEATURE>.md in the same change. Change this index when app architecture, feature boundaries or app rules change. The [root guide](../../AGENTS.md) owns repository-wide rules.
>
> **Completion rule:** Run the relevant local happy/boundary behavior and a save/reload or downstream check. Documentation/setup work follows the three-app baseline in [LOCAL-DEVELOPMENT](../../docs/LOCAL-DEVELOPMENT.md). Record source, tests and product evidence separately; unavailable fixtures remain n/a.

## Session protocol

1. Read [root AGENTS.md](../../AGENTS.md), this guide and the relevant feature doc; inspect its open gaps and last verified revision.
2. Trace source changes since that revision with git log and include relevant uncommitted changes. Read the installed Next.js documentation before relying on an unfamiliar API.
3. Follow schema → scoped query/action → routed UI/provider boundaries. Add independent literal expectations for changed behavior; existing helper tests prove only their named cases.
4. From the repo root run pnpm test, applicable checks in [TESTING](../../docs/TESTING.md), and node scripts/check-docs.mjs. Serialize client generation and app build checks.
5. Start this app using node scripts/local-qa.mjs --app=app; verify normal Credentials sign-in, changed happy path, boundary and persisted result. Restore temporary fixture edits and stop only owned processes.
6. Update contracts, rules/why, runbook, permanent gap entries and Verification log. Report actual evidence, n/a prerequisites and cleanup; do not rewrite older dated audits.

## App architecture and invariants

Use [CONVENTIONS](docs/CONVENTIONS.md) for existing schema/form/media/UI choices. Profile content is scoped by owner or co-guardian; public readers are selected/redacted separately. Physical QR/GenCode ownership is not a consumer subscription. Tree positions remain in schema for history, but the current canvas uses automatic layout. Media quotas come from database-backed effective entitlements; do not hardcode a plan or revive maxProfiles.

The app uses Next.js App Router, server-side queries, server actions and Zod schema factories. Shared database/auth/services/email/core/UI/i18n contracts are indexed in [root AGENTS.md](../../AGENTS.md). Local origin is http://localhost:3000; use canonical localhost for auth redirects/cookies.

## Feature index

| Feature | Purpose | Main code | Test command from repo root |
| --- | --- | --- | --- |
| [ACCOUNTS](docs/ACCOUNTS.md) | Consumer accounts | `src/actions/auth.actions.ts` | `pnpm test` |
| [PUBLIC-PROFILES](docs/PUBLIC-PROFILES.md) | Profiles, search and favorites | `src/lib/profile.ts` | `pnpm test` |
| [MEMORIALS-GUARDIANS](docs/MEMORIALS-GUARDIANS.md) | Memorials and co-guardians | `src/actions/memorial.actions.ts` | `pnpm test` |
| [FAMILY-TREE](docs/FAMILY-TREE.md) | Family tree and WikiTree import | `src/actions/family-tree.actions.ts` | `pnpm test` |
| [PETS](docs/PETS.md) | Pet profiles and ownership | `src/actions/pet.actions.ts` | `pnpm test` |
| [BIOGRAPHY](docs/BIOGRAPHY.md) | Biography | `src/actions/bio.actions.ts` | `pnpm test` |
| [GALLERY](docs/GALLERY.md) | Gallery and video preparation | `src/actions/gallery.actions.ts` | `pnpm test` |
| [PLACES](docs/PLACES.md) | Life places and maps | `src/actions/places.actions.ts` | `pnpm test` |
| [GEOLOCATION](docs/GEOLOCATION.md) | Resting geolocation and suggestions | `src/actions/geolocation.actions.ts` | `pnpm test` |
| [DOCUMENTS](docs/DOCUMENTS.md) | Profile documents | `src/actions/documents.actions.ts` | `pnpm test` |
| [TRIBUTES](docs/TRIBUTES.md) | Tribute submission and moderation | `src/actions/tribute.actions.ts` | `pnpm test` |
| [MESSAGES](docs/MESSAGES.md) | Messages and activity feed | `src/queries/notifications.ts` | `pnpm test` |
| [BILLING-QUOTAS](docs/BILLING-QUOTAS.md) | Consumer billing and feature quotas | `src/actions/billing.actions.ts` | `pnpm test` |
| [GENCODE-ACTIVATION](docs/GENCODE-ACTIVATION.md) | GenCode activation and memorial trial | `src/actions/gencode.actions.ts` | `pnpm test` |
| [QR-ANALYTICS](docs/QR-ANALYTICS.md) | QR scan analytics | `src/app/api/analytics/qr-scan/route.ts` | `pnpm test` |
| [PWA](docs/PWA.md) | Progressive web app installation | `src/lib/pwa-install.ts` | `pnpm test` |
| [WEB-PUSH](docs/WEB-PUSH.md) | Device web push subscriptions | `src/actions/push.actions.ts` | `pnpm test` |
| [MARKETING-FEEDBACK](docs/MARKETING-FEEDBACK.md) | Public marketing and feedback | `src/actions/feedback.actions.ts` | `pnpm test` |

## Local run and checks

Use [LOCAL-DEVELOPMENT](../../docs/LOCAL-DEVELOPMENT.md) for the fixed local-only seed identity, service startup/readiness, baseline steps and recovery. The launcher supplies ephemeral per-app AUTH_SECRET values and overrides cloud keys in child processes. Each app requires its own sign-in; old cookies fail after restart. Real payments, email, OAuth, push, production PWA and upstream imports require their own test fixtures.

[TESTING](../../docs/TESTING.md) lists the successful full-suite and integration commands. [OBSERVABILITY](../../docs/OBSERVABILITY.md) separates liveness, DB readiness, domain logs and business outcomes. [GAPS](../../docs/GAPS.md) prioritizes unresolved issues; this app's detailed entries live in the feature documents.

## Verification and memory

**Last verified against code:** 2026-10-03 at `6e06634` including this task's uncommitted docs, tests and local launcher. See [the dated audit](../../docs/audits/AGENT-MEMORY-2026-10-03.md) for automated/runtime/UI scope. [HISTORY](../../docs/HISTORY.md) preserves previous memory and the migration table. CLAUDE.md points to this guide after explicit user approval on 2026-10-03; HISTORY links the original byte-identical memory archive.

## Installed Next.js agent rules (preserved)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
