# Shared working runbooks

> **Last verified against code:** 2026-10-03 at `6e06634` + current documentation/tests/launcher. These procedures link the existing operational paths and separate local, deterministic and cloud scopes.

## Change a feature and leave useful memory

1. Read [root AGENTS.md](../AGENTS.md), the app guide and affected feature doc. Inspect its permanent gaps and Last verified revision.
2. From the repository root run git status --short and git log --oneline <last-sha>..HEAD -- <feature-paths>. Include local uncommitted work; trace the current route/action/schema/query/provider rather than rely on historical claims.
3. Make the scoped change with hand-authored expected values in the smallest meaningful deterministic test. Use the app's established conventions and read installed Next documentation for unfamiliar APIs.
4. Run pnpm test, node scripts/check-docs.mjs and relevant schema/i18n checks from [TESTING](TESTING.md). Serialize generation/typecheck/lint/build.
5. Start the [local runbook](LOCAL-DEVELOPMENT.md) and exercise the changed happy plus boundary scenario through the product UI; verify save/reload or the actual downstream result. A documentation/setup change performs the three-app baseline.
6. Update contracts/rules/why/runbooks and append evidence with date, revision, working changes, identity/role, expected/observed and explicit limits. Give each new gap a permanent ID; keep fixed history and cite the fixing test/commit.
7. Restore temporary fixture edits, stop only owned processes and report unfinished integration prerequisites. Do not label readiness or a helper suite as complete feature QA.

## Add a model or migration

1. Change the single canonical packages/db/prisma/schema.prisma and add a timestamped hand-authored SQL migration under packages/db/prisma/migrations. Preserve intentional mappings, nullable/unique keys and destructive-change survey comments.
2. Set the explicit local DATABASE_URL, run pnpm db:generate once, then pnpm check:schema-parity and pnpm check:migrations. For disposable local schema initialization follow db push in [DATABASE](DATABASE.md); historical migration replay is not a proven empty-DB bootstrap.
3. Run pnpm typecheck and affected tests sequentially; verify app save/reload and the written mapped columns, then update model/contracts/provenance.
4. For an authorized deployed migration, follow [AZURE-AGENT-RUNBOOK](AZURE-AGENT-RUNBOOK.md) and [AZURE-DATABASE-ACCESS](AZURE-DATABASE-ACCESS.md). Discover current resources and inspect the execution/log result. Ordinary merge does not auto-run the current workflow_dispatch migration job.
5. A rollback of app images does not reverse DB writes. Prefer forward-compatible expand/contract changes and a reviewed recovery plan for data operations.

## Diagnose payment, credits and daily bookkeeping

1. Read [PARTNER-CREDITS](PARTNER-CREDITS.md), the caller app's purchasing/package doc and [DAILY-JOB](../apps/bms/docs/DAILY-JOB.md). Confirm whether the input represents an annual invoice, installment of an existing cycle, standalone TOPUP order or code activation.
2. Inspect signed event/order/cycle IDs and unique idempotency keys. Independently compare grant.remainingQty, ledger sums, HELD reservations, COMMITTED bindings and code status/soldAt.
3. Run pnpm test for the existing deterministic cases. The full signed-event DB replay remains a fixture prerequisite; the local launcher disables Stripe/mail/CRON_SECRET.
4. On a disposable replay fixture, repeat the same event and independently expect one entitlement/grant/activation. Inspect each daily result/error and each critical/warning finding; outer ok=true is not an all-service pass.
5. Record the sanitized evidence and unresolved prerequisite in the affected feature gap. Do not change current catalog prices or overwrite bought snapshots to make an old figure match.

## Resume Azure media migration

1. Read [MEDIA-MIGRATION](MEDIA-MIGRATION.md), [MEDIA-STORAGE](MEDIA-STORAGE.md) and the existing Azure media scripts. Confirm the explicit target and saved durable manifest; even inventory writes the manifest.
2. Run pnpm test for helper/policy coverage. Real migration runtime is n/a until the disposable legacy URL/blob/DB fixture or explicit authorized cloud target exists.
3. For that target, choose copy, verify, rewrite or rollback flags using the same manifest. A rewrite requires verified integrity and unchanged original references; do not infer readiness from a copied URL alone.
4. Compare old/new references and actual object bytes, and preserve conditional-write failures. If interrupted, reload the durable manifest rather than invent a new successful state.
5. Append evidence with phase, revision, exact target, expected/observed rows and rollback limits. Keep original incident counts and legacy URLs in the preserved historical memory.

## Recover an interrupted local QA run

1. Inspect docker compose ps and Get-NetTCPConnection -State Listen -LocalPort 3000,3001,3002,5432,10000 -ErrorAction SilentlyContinue.
2. Use the original launcher's Ctrl+C when possible; otherwise verify the specific owning command/PID before stopping its process tree. Do not kill unrelated Node/Docker services.
3. Restart via pnpm db:up and node scripts/local-qa.mjs. Generate Prisma once if necessary. Existing local data/volumes remain; reseed only when fixture reset is intended.
4. Sign in separately at localhost:3000/3001/3002, then rerun the relevant happy/boundary and persistence check. Ephemeral secrets invalidate old cookies after restart.
5. Restore temporary edits, record a new Verification row and finish the owned-process cleanup from [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md).

## Verification log

| Date | Revision | Scope | Evidence / limits |
| --- | --- | --- | --- |
| 2026-10-03 | 6e06634 + working changes | Source | Repeated change/migration/daily/media/recovery paths traced and linked. |
| 2026-10-03 | Same | Local runtime | Local stack restarted after interruption; baseline and read-only persisted checks passed. Cloud/provider procedures were not executed. |

## Related

[AGENTS.md](../AGENTS.md) · [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [CONFIGURATION](CONFIGURATION.md) · [TESTING](TESTING.md) · [OBSERVABILITY](OBSERVABILITY.md) · [GAPS](GAPS.md)
