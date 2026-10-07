# Public marketing and feedback

> **Code:** [src/components/marketing/partner-capacity-calculator.tsx](../src/components/marketing/partner-capacity-calculator.tsx) · [src/app/(marketing)/afiliados/page.tsx](../src/app/(marketing)/afiliados/page.tsx) · [src/actions/feedback.actions.ts](../src/actions/feedback.actions.ts) · [src/schemas/feedback.schema.ts](../src/schemas/feedback.schema.ts) · [src/lib/turnstile.ts](../src/lib/turnstile.ts) · [src/app/api/career/upload/route.ts](../src/app/api/career/upload/route.ts)
> **Entry points:** `/` · `/afiliados` · `/terms` · `/api/career/upload`
> **Depends on:** [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [MEDIA-STORAGE](../../../docs/MEDIA-STORAGE.md) · [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md)
> **Last verified against code:** 2026-10-03 at `0353683` (marketing recheck after the initial `6e06634` baseline), including this task’s uncommitted documentation, launcher and test changes. Source verification is separate from runtime/UI below.

The APP application supplies public marketing and feedback. Public feedback parses type/message/contact and optional CV URL; career PDFs use the shared upload authorization. Honeypot and minimum fill time silently drop bots while returning success; rate limiting allows five requests per hour per network identifier.

## How it works

| # | Step | Kind | Code / symbol | Produces |
| --- | --- | --- | --- | --- |
| 1 | Resolve the entry, session/tenant or public request | deterministic | [src/actions/feedback.actions.ts](../src/actions/feedback.actions.ts) `sendFeedback` | Validated request context |
| 2 | Apply the feature contract and policy below | deterministic | [src/schemas/feedback.schema.ts](../src/schemas/feedback.schema.ts) `getFeedbackSchema` | Allowed inputs, scope and transition |
| 3 | Read/write the listed rows or perform the integration | external call | [src/app/api/career/upload/route.ts](../src/app/api/career/upload/route.ts) `POST` | Scoped data, ActionResult, HTTP response or rendered state |

No LLM/model stage exists in this implementation.

| Module | Main symbols | Job |
| --- | --- | --- |
| [src/actions/feedback.actions.ts](../src/actions/feedback.actions.ts) | `sendFeedback` | Authenticated mutation orchestration |
| [src/schemas/feedback.schema.ts](../src/schemas/feedback.schema.ts) | See exports/component in file | Input validation and defaults |
| [src/lib/turnstile.ts](../src/lib/turnstile.ts) | See exports/component in file | Shared policy or integration implementation |
| [src/app/api/career/upload/route.ts](../src/app/api/career/upload/route.ts) | See exports/component in file | HTTP entry and response handling |

## Rules and why

Partner portal links use `https://sequoia.genealogiq.com.br/sign-in`, the
canonical production SEQ origin. All three landing CTAs share
`PARTNER_PORTAL_HREF` in [partner-links.ts](../src/components/marketing/partner-links.ts).
The October 7 release check caught the legacy `sequoia.rip` constant after the
domain cutover; correcting runtime environment alone cannot change this
bundled link. Rebuild APP and verify the public CTA opens SEQ sign-in.

Feedback takes at least two seconds and optionally verifies Turnstile before sending an escaped email. Missing Turnstile configuration logs a warning and skips verification, so local feedback does not prove anti-bot service behavior. b0cfe7c added partner landing content.

The enforcing files are linked above. Test names and literal assertions below record the cases that were recovered; a missing historical origin is not replaced with an invented rationale.

Commit 0353683 changed the public affiliate estimator from BRL 150 to a BRL 300 minimum resale reference and added partner photographs. [PartnerHeroEstimator / PartnerCapacityCalculator](../src/components/marketing/partner-capacity-calculator.tsx) each use their own useRevenueEstimate state, defaulting to 20 units/month with a 0–1000 integer slider. Monthly gross revenue is units × 300 and annual gross revenue is units × 12 × 300, always formatted as BRL for the selected locale. These are marketing estimates, not paid amounts or profit. Independently calculated defaults are BRL 6,000/month and BRL 72,000/year; at zero both are zero; at 1000 they are BRL 300,000/month and BRL 3,600,000/year.

## Contracts and data

Public feedback parses type/message/contact and optional CV URL; career PDFs use the shared upload authorization. Honeypot and minimum fill time silently drop bots while returning success; rate limiting allows five requests per hour per network identifier.

Inputs, defaults and output types live in the linked schema/actions/query files. APP/BMS/SEQ actions generally return [ActionResult (`done`/`ok`/`fail`)](../../../packages/core/src/result.ts); redirects/forbidden errors propagate from the DAL. Shared helpers retain their declared return types.

| Prisma model | PostgreSQL table | Creation migration / provenance |
| --- | --- | --- |
| None | No feature-owned table; browser/transport state only | Not applicable |

Column mappings, keys, enums, deletes and nullability are authoritative in [schema.prisma](../../../packages/db/prisma/schema.prisma). Later amendments and the legacy baseline limitation are indexed in [DATABASE](../../../docs/DATABASE.md). Models listed here are read or written by the feature; ownership is shared where explicitly noted.

| Method | Route or command | Router / handler |
| --- | --- | --- |
| GET | `/` | [src/app/(marketing)/page.tsx](../src/app/(marketing)/page.tsx) |
| GET | `/afiliados` | [src/app/(marketing)/afiliados/page.tsx](../src/app/(marketing)/afiliados/page.tsx) |
| GET | `/terms` | [src/app/(legal)/terms/page.tsx](../src/app/(legal)/terms/page.tsx) |
| POST | `/api/career/upload` | [src/app/api/career/upload/route.ts](../src/app/api/career/upload/route.ts) |

| Setting | Default | Validation / owner | Consequence |
| --- | --- | --- | --- |
| TURNSTILE_SECRET_KEY / NEXT_PUBLIC_TURNSTILE_SITE_KEY | absent | turnstile.ts | Missing secret skips verification with a warning; client site-key changes require rebuild. |

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

**Specs included in the successful 2026-10-03 full-suite run:** [src/actions/feedback.actions.test.ts](../src/actions/feedback.actions.test.ts). The opt-in media integration was run separately; skipped default integration tests are not counted as passes.

**Expected answers:** literal hand-authored `expect` values in these specs and the scenario values below. The full run’s pass count is a coverage ledger, never the expected business output. Do not generate a golden answer from the function being tested.

**Acceptance:** the stated happy-path outputs/persisted rows match the independent scenario, and the boundary rejects without an unauthorized write or duplicate side effect. A unit/helper pass does not satisfy a missing product step.

**Telling failures apart:** missing local DB/generated client/browser/test-provider configuration is `n/a` with the prerequisite; a changed mocked deterministic result is a code regression; a mismatch limited to provider responses/source data is an integration/data issue to diagnose, not a reason to overwrite reference answers.

**Reading a run after the fact:** start with the Next terminal/HTTP response, the scoped rows in the table above and [OBSERVABILITY](../../../docs/OBSERVABILITY.md). Keep secrets, signed URLs and session state out of tracked logs.

### Local startup and identity

Follow [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) for exact setup/start/readiness/stop/recovery. Run APP and PostgreSQL; media scenarios also need Azurite. Use normal app-specific Credentials authentication with the seeded local account. The launcher disables external providers; the seed covers a Premium consumer, local company/tenant staff, seven family members and two pets. It does not furnish a second interactive consumer/tenant, signed checkout replay or production push/install environment.

### Manual scenarios

1. **Happy path:** Open the public home, affiliate and feedback pages; submit a human-filled synthetic message through a disposable Resend test recipient and confirm its recorded delivery. Requires mail and optionally Turnstile test configuration.
2. **Boundary:** Fill the honeypot or submit faster than two seconds; expect a success-shaped response with no email send call (the deliberate silent-drop behavior).
3. **Persistence/cleanup:** independently query the feature-owned rows or downstream result. Restore temporary edits; retain ledger/audit history. Only delete disposable fixtures when authorized by the task.

The affiliate estimator's remaining UI scenario is to open /afiliados, independently check the 20-unit default and both slider boundaries against the handwritten values above, then inspect partner photos at desktop/mobile widths. This task reviewed 0353683 source only; this later commit's calculator/photo UI has no observation in the earlier baseline.

### QA evidence

| Date / revision | Startup / identity | Expected versus observed | Result and limits | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-03, `6e06634` + working changes | `node scripts/local-qa.mjs`; normal separate Credentials sessions; scoped local roles | Expected scenario above; no complete feature-specific browser/runtime observation recorded in this audit. | n/a: Requires mail and optionally Turnstile test configuration | [Dated audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) |

## Runbooks

### Change or diagnose this feature

1. Read this document and [the applicable AGENTS.md](../AGENTS.md); trace the linked entry through session, schema, query/action and integration.
2. Recheck changes with `git log --oneline 6e06634..HEAD -- apps/app/src/actions/feedback.actions.ts apps/app/src/schemas/feedback.schema.ts apps/app/src/lib/turnstile.ts apps/app/src/app/api/career/upload/route.ts`. Reverify affected claims and carry relevant uncommitted changes into the log.
3. Run `pnpm test` and `node scripts/check-docs.mjs`. For schema/i18n changes run the additional commands in [TESTING](../../../docs/TESTING.md). Run generation/typecheck/lint/build sequentially to avoid generated-client races.
4. Start the smallest local stack using [the local runbook](../../../docs/LOCAL-DEVELOPMENT.md), then perform the named happy and boundary scenario; verify persistence and record exact expected/observed results. Missing integration fixtures stay n/a.
5. Update contract/rules/runbook and append a Verification log row in the same change. New gaps get a permanent `MARKETING-FEEDBACK-G<n>` ID; a fixed gap retains its original evidence and gains resolution/test/commit.

### Recover an interrupted QA session

1. Inspect `docker compose ps` and `Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue` before restarting.
2. Identify an existing launcher/PID rather than reuse an unknown port. Follow the owned-process cleanup steps in [LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md).
3. Restart the launcher and sign in separately for each app. Ephemeral secrets make old cookies invalid after a restart. Restore temporary fixture edits and append the new result, rather than rewriting the dated audit.

## Gaps and fixes

### MARKETING-FEEDBACK-G3: Partner portal links retained the legacy origin

- **Status:** fixed
- **Found:** 2026-10-07, production release acceptance after the domain cutover.
- **Evidence:** `/afiliados` on the canonical APP domain linked its portal CTAs to `sequoia.rip/sign-in`.
- **Impact:** Visitors were directed away from the verified canonical Sequoia deployment.
- **Root cause:** `PARTNER_PORTAL_HREF` was hardcoded and unaffected by runtime origin configuration.
- **Resolution:** Updated the shared constant to `https://sequoia.genealogiq.com.br/sign-in`; header, closing and footer consume it. The [release audit](../../../docs/audits/PRODUCTION-RELEASE-2026-10-07.md) records the rebuild and browser destination check.

### MARKETING-FEEDBACK-G1: Feedback delivery and Turnstile lack provider replay evidence

- **Status:** open
- **Found:** 2026-10-03, repository memory/bootstrap audit at 6e06634.
- **Evidence:** Tests stub the email/verification boundaries; local-qa disables real mail and Turnstile.
- **Impact:** Provider rejection or anti-bot availability may differ from deterministic action results.
- **Root cause:** The present implementation/contract is described in the evidence; original decision not recorded.
- **Resolution:** Not fixed in this task. Record test provider responses and fail replay cache misses; verify one disposable delivery.

### MARKETING-FEEDBACK-G2: Affiliate estimator has no direct fixture in this audit

- **Status:** open
- **Found:** 2026-10-03, follow-up source check of concurrent commit 0353683.
- **Evidence:** partner-capacity-calculator.tsx has client-local arithmetic/state and no direct spec; the earlier baseline did not exercise these sliders or new photographs.
- **Impact:** Source review does not establish rendered totals, independent slider state or responsive imagery.
- **Root cause:** This audit has no calculator-specific deterministic/browser fixture.
- **Resolution:** Add an isolated component/browser scenario using the independent 20/0/1000 unit expectations above and inspect desktop/mobile images; record its evidence separately.

## Verification log

| Date | Commit / working changes | Verified by | Scope and evidence | Mismatches or limits → action |
| --- | --- | --- | --- | --- |
| 2026-10-07 | `f85ee37` + canonical portal correction | Production browser and source trace | Production landing showed expected BRL 6,000/month and BRL 72,000/year at 20 units, with partner photos; portal links still used the old constant. | Corrected shared destination; final deployment and destination evidence is in the release audit. No feedback email was sent. |
| 2026-10-03 | `0353683` | Codex source diff | Rechecked affiliate calculator, landing photos and three locale files added after the baseline | Source only; no later marketing UI pass claimed |
| 2026-10-03 | `6e06634` + docs/local launcher/new tests | Codex source trace and git/test review | Source: linked paths/symbols/router/model/defaults checked; tests: listed specs included in `pnpm test` (840 pass, one opt-in skip) | Open gaps above; original incident history preserved separately |
| 2026-10-03 | Same revision + working changes | Local Credentials/browser/Azurite audit | Runtime/UI: n/a for the complete feature scenario; the repository baseline does not establish this feature. | Prerequisite/scenario remains listed above. |

## Related

[LOCAL-DEVELOPMENT](../../../docs/LOCAL-DEVELOPMENT.md) · [DATABASE](../../../docs/DATABASE.md) · [CONFIGURATION](../../../docs/CONFIGURATION.md) · [TESTING](../../../docs/TESTING.md) · [OBSERVABILITY](../../../docs/OBSERVABILITY.md) · [RUNBOOKS](../../../docs/RUNBOOKS.md) · [Audit](../../../docs/audits/AGENT-MEMORY-2026-10-03.md) · [EMAIL-DELIVERY](../../../docs/EMAIL-DELIVERY.md) · [MEDIA-STORAGE](../../../docs/MEDIA-STORAGE.md)
