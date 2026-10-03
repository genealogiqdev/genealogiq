# Observability and diagnosis

> **Code:** per-app api/health handlers, [daily handler](../apps/bms/src/app/api/cron/daily/route.ts), [reconciliation](../packages/services/src/reconciliation.ts), per-app Sentry setup.
> **Last verified against code:** 2026-10-03 at `6e06634` + current docs/tests/launcher.

The applications use Next terminal/runtime logs, HTTP responses, optional Sentry and domain rows. There is no single durable application-log store or correlation-ID contract proven by this audit. Observe the scope below before treating a successful HTTP response or a zero count as a measured business result.

## Signals and their limits

| Signal | Command / owner | What it establishes | What remains unproven |
| --- | --- | --- | --- |
| Liveness | GET /api/health/live in each app | Node/handler can return status=ok | DB, auth, provider or feature behavior |
| Readiness | GET /api/health/ready; SELECT 1 | Current DB connection succeeds; failure returns 503 unavailable | Schema completeness, permissions, save/reload, paid entitlement |
| Next terminal | node scripts/local-qa.mjs | Route/action timings and visible exceptions | Durable production history unless exported |
| Deterministic test log | pnpm test | Named mock/helper/schema assertions | Full UI/provider/database behavior |
| Daily job | [DAILY-JOB](../apps/bms/docs/DAILY-JOB.md) | Per-step result/error fields; individual critical/warning findings | Outer ok=true does not mean all steps passed |
| Credit ledger | CreditTransaction/Grant/Reservation rows | Independently compare quantities and bindings | Rendered balances alone are not a reconciliation proof |
| Provider transport | SDK response + recorded fixture | Acceptance/rejection by that integration | An ignored resolved error or UI success toast is not delivery |
| Optional Sentry | per-app configuration; NEXT_PUBLIC_SENTRY_DSN | Error capture when configured | Local baseline disables capture/source-map upload |

## First diagnosis by feature

| Symptom | Inspect first | Independent evidence |
| --- | --- | --- |
| Sign-in redirect loop | Canonical origin, separate app cookie, launcher restart | Fresh Credentials submit + protected save/reload, not injected storage state |
| Unauthorized read/write | DAL role/tenant/profile scope and query where clause | Forbidden response plus unchanged target row |
| Wrong dashboard money/count | Raw rows, paid snapshots, soldAt, currency | Count/group rows independently before comparing UI |
| Missing entitlement | Signed event routing/idempotency, cycle snapshot, grant expiry | One expected cycle/grant/event after duplicate replay |
| Wrong credit balance | remainingQty, transaction quantity sum, HELD reservation and COMMITTED code binding | Each reconciliation finding, retaining IDs/details in sanitized local evidence |
| Upload failure | Authorization prefix/SAS, stored size/type/signature, staging/public object | Expected byte count and read/delete status, not a returned URL alone |
| Missing email | Resend resolved response/error and recipient/base URL | Recorded provider response and disposable inbox; current ignored-error gap remains |
| Push unavailable | VAPID/worker/browser permission, endpoint status | 404/410 pruning versus transient error; actual browser delivery separate |
| FREE subscription row not found | subscriptions code FREE and fallback call | Missing prerequisite; the seed currently creates PREMIUM only |

## Local evidence procedure

1. Start the appropriate [local stack](LOCAL-DEVELOPMENT.md), record revision/working changes, normal identity/role, exact scenario and handwritten expected values.
2. Capture the visible happy/boundary state and independently inspect relevant rows or downstream effect. Store raw logs/screenshots under ignored .local-qa; session cookies, passwords from real accounts and signed URLs must not enter tracked reports.
3. Record expected versus observed plus pass/fail/n/a scope in the feature Verification log and a sanitized dated audit. Preserve original incident IDs/numbers and distinguish a missing fixture from a failing code path.
4. If a repeat run supersedes an old observation, append a new row/report. Do not rewrite the old evidence into a pass. Cleanup only identified launcher processes and repository compose services.

The 2026-10-03 local evidence includes company save/reload/restoration in BMS/SEQ, APP favorite persistence/tree tutor UI, sign-out boundaries and actual Azurite storage transitions. [The audit](audits/AGENT-MEMORY-2026-10-03.md) has the exact limits.

## Gaps and fixes

### OBSERVABILITY-G1: No complete durable correlation/evidence contract

- **Status:** open
- **Found:** 2026-10-03, source/runtime audit.
- **Evidence:** Local logs are Next/provider/domain-specific; no common request-to-action-to-webhook correlation field or durable exported local evidence pack is implemented.
- **Impact:** Diagnosing a multi-service payment/credit failure depends on separate identifiers/logs and can lose context after a process restart.
- **Root cause:** Observability is distributed across modules and optional Sentry.
- **Resolution:** Not fixed. Define a scoped correlation contract and sanitized retention format with a replayable failure fixture; retain existing detailed reconciliation findings.

## Verification log

| Date | Revision | Scope | Evidence / limits |
| --- | --- | --- | --- |
| 2026-10-03 | 6e06634 + working changes | Source | Health/DAL/daily/provider logging paths traced. |
| 2026-10-03 | Same | Runtime/UI | Local Next logs and persisted baseline rows inspected; Sentry/cloud retention and full provider correlation not exercised. |

## Related

[LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [TESTING](TESTING.md) · [PARTNER-CREDITS](PARTNER-CREDITS.md) · [GAPS](GAPS.md)
