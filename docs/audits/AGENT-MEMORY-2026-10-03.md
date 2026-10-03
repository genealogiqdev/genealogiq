# Repository agent-memory bootstrap — 2026-10-03

## Scope and revisions

User scope: the whole repository, with root and per-app AGENTS.md files. **Create** at the root; **Adopt** in APP, BMS and SEQ. The [root index](../../AGENTS.md) links all 39 features: 18 APP, nine BMS, seven SEQ and five shared. Each document has source metadata, contracts, rules/why, test and manual scenarios, runbooks, permanent gaps and verification history.

Initial source/runtime baseline: `6e06634` plus this task's docs, launcher and tests. During work, `0353683` added marketing estimates/photos; the affected source was rechecked in [MARKETING-FEEDBACK](../../apps/app/docs/MARKETING-FEEDBACK.md). The final unit/schema/i18n run used HEAD `0353683`. Earlier build/manual results are the recorded run snapshot, not evidence that later marketing UI was exercised.

Concurrent Azure/infrastructure changes and assets/envs belong to other work and were preserved. This task did not deploy, publish, commit or push. Live cloud resources were not verified. This is a retained dated snapshot; record later results in verification logs or a superseding audit.

## Protocol and independent expectations

Working directory: `C:/Users/Tiger/Desktop/dev/personal/genealogiq`. Installed environment: Node 24.14.1, pnpm 9.15.0, Next 16.3.1, React 19.2.8, Prisma 7.9.1, PostgreSQL 17, Azurite 3.35.0.

The [local runbook](../LOCAL-DEVELOPMENT.md) gives exact environment/setup/start/check/stop commands. The exercised sequence used `pnpm db:up`, loopback DATABASE_URL, `pnpm db:generate`, `pnpm db:push`, `pnpm seed:local`, then `node scripts/local-qa.mjs`. The launcher runs normal Credentials/session/DAL flows at localhost:3000/3001/3002, with separate ephemeral secrets and disabled payment/mail/OAuth/push/Turnstile credentials. Historical DDL was not replayed from an empty database.

The disposable seed identity local-admin@genealogiq.test is active/verified APP_USER in APP and SUPER_ADMIN in BMS/SEQ, scoped to the local company/tenant. The existing seed/runbook define its public local password. Sign-in was performed separately through each app's normal form; no session tokens or private credentials are tracked.

Literal test expectations and the handwritten UI values below are independent of application output. Persistence checks query physical scoped rows. Readiness, compilation and sign-in alone do not establish feature completion.

## Automated results

| Command / layer | Observed result | Evidence and limits |
| --- | --- | --- |
| `pnpm test` | **840 passed; one skipped**, 101 passing files, one skipped file; 7.84s final run | [vitest-final.log](../../.local-qa/vitest-final.log), seven Vitest projects. Opt-in Azurite ran separately. |
| `pnpm check:schema-parity` | Pass | One canonical packages/db schema; no app duplicates. |
| `pnpm check:migrations` | Pass: 74 migrations | Ordering/shape only; no DDL replay or deployed-state claim. |
| `pnpm check:i18n-parity` | Pass: nine locale files | Includes later marketing locale edits. |
| `pnpm check:i18n-keys` | Zero errors | 79 dynamic calls skipped; one unmapped columns file. |
| `pnpm typecheck` | Pass: 11 tasks | [typecheck-final.log](../../.local-qa/typecheck-final.log), 10.956s; generation/checks serialized. |
| `pnpm lint` | Zero errors; 51 existing warnings | [lint-final.log](../../.local-qa/lint-final.log): APP eight, BMS 21, SEQ 22. |
| Isolated `pnpm build` | All three apps compiled/prerendered; four tasks successful | [build-final.log](../../.local-qa/build-final.log), 2m0.846s. Invoked by `node .local-qa/build-isolated.mjs`, applying the launcher's loopback/disabled-provider environment and generated secret. Dev servers were stopped. The terminal session later expired; retained Turbo output confirms task success, not a recovered final shell exit status. |
| Enabled Azurite integration | One test passed | [azurite-final.log](../../.local-qa/azurite-final.log), 3.15s; exact command/environment in [TESTING](../TESTING.md). |
| `pnpm exec playwright test --project=public` | Three passed | [playwright-public-final.log](../../.local-qa/playwright-public-final.log), 9.5s: sign-in form, pt-BR cookie locale, localized unknown route. |
| `node --check scripts/local-qa.mjs`; `node --check scripts/check-docs.mjs` | Passed | Syntax only; real launcher startup and original cleanup separately exercised. |
| Documentation preflight | Four guides, 39 indexed features, 161 named source references checked | Before publication, only links to this not-yet-written report were unresolved. Run `node scripts/check-docs.mjs` for the final result, recorded in [TESTING's Verification log](../TESTING.md#verification-log). It checks structure/path/symbol presence, not arbitrary business semantics. |
| `git -c core.safecrlf=false diff --check` | Passed after trailing-blank-line cleanup | Tracked-change whitespace check. |

Eight new spec files add 22 tests: APP activity actions/QR route; BMS company boundary, plan schema/daily-job route; SEQ purchasing action/dashboard; shared email transport/templates. Root Vitest now supplies an unreachable unit DB URL and includes the email project.

Initial failures were corrected before the recorded successes: absent DATABASE_URL during mocked-client imports; uppercase currency expectation where the existing contract returns lowercase brl; bigint literals incompatible with ES2017, changed to BigInt(...). [TESTING](../TESTING.md#gaps-and-fixes) preserves those fixes and remaining coverage limits. Product-policy/provider findings were documented rather than changed in this task.

## Runtime and manual product results

PostgreSQL was healthy; pg_isready and SELECT 1 passed. APP liveness returned ok and all three readiness endpoints returned ready. Those checks were prerequisites for the actual UI scenarios below.

| Scenario | Independent expected result | Observed | Result |
| --- | --- | --- | --- |
| BMS company edit | Save/reload Genealogiq Local QA 2026-10-03; restore Genealogiq Local | Edited value survived reload; final scoped SQL returned Genealogiq Local | Pass |
| SEQ tenant edit | Save/reload Local Tenant QA 2026-10-03; restore Local Tenant | Edited value survived reload; final scoped SQL returned Local Tenant | Pass |
| APP favorite | Remove Rex favorite, restore, reload; exactly one viewer/Rex row afterward | UI returned to favorited; final raw SQL count 1 | Pass |
| APP family/pet read | Seven people, four displayed generations, two pets; Rex tutors Marina Silva + Local Admin | Tree, zoom/fit, Rex search and tutor sheet showed expected values | Pass for these read interactions |
| Three auth boundaries | Normal sign-out then protected /home or /system/company shows sign-in | Each app showed its sign-in wall | Pass; not a two-tenant/live-role-revocation check |
| Local object storage | Handwritten 12-byte PNG signature; create-only SAS upload, overwrite rejection, promote/read 200, own-object delete/read 404 | All assertions passed against Azurite; test cleaned its object | Pass for storage protocol; not image decoding or private-document authorization |

Final read-only persistence checks:

```sql
SELECT trade_name FROM companies WHERE tax_id='LOCAL-COMPANY-001';
SELECT trade_name FROM tenants WHERE tax_id='LOCAL-TENANT-001';
SELECT COUNT(*) AS favorite_count
FROM app_favorites f JOIN app_users u ON u.id=f.app_user_id
WHERE f.app_target_id='clocalpetrex000000000000001'
  AND u.email='local-admin@genealogiq.test';
```

Observed: **Genealogiq Local**, **Local Tenant**, **1**. Temporary edits are restored.

Screenshots are local ignored evidence, not guaranteed to exist in another checkout:

- [BMS save/reload](../../.local-qa/2026-10-03/bms-save-reload.png)
- [SEQ save/reload](../../.local-qa/2026-10-03/seq-save-reload.png)
- [APP favorite reload](../../.local-qa/2026-10-03/app-favorite-reload.png)
- [APP tree](../../.local-qa/2026-10-03/app-tree.png)
- [Rex tutor sheet](../../.local-qa/2026-10-03/app-pet-owners.png)
- [SEQ anonymous boundary](../../.local-qa/2026-10-03/seq-anonymous-boundary.png)

## Feature coverage and remaining prerequisites

The 39 feature docs list the exact specs included in the suite and their scoped claims. Shared/helper coverage is not another test for each caller. Runtime evidence applies only to the named baseline actions in APP Accounts/Public Profiles/Family Tree/Pets, BMS and SEQ Accounts/Staff, shared Authentication, and the enabled Media Storage test. Other complete feature scenarios remain n/a as individually documented.

Full signed Stripe/provider replay, real email/OAuth/push delivery, production PWA installation, browser codecs, WikiTree import, full credit/migration lifecycle, multi-consumer moderation and cross-tenant browser checks need their own fixtures. Legacy authenticated E2E needs current routes and enforced isolation. Later affiliate calculator/photo changes have source review and independent 20/0/1000-unit expectations, but no UI observation in this baseline.

## Findings and resulting guidance

The [prioritized gap index](../GAPS.md) links permanent evidence. Highest-impact findings include public URLs for private documents, authenticated discovery of private living profiles, JWT role-revocation limits, tenant-only SEQ checkout authorization, ignored resolved Resend errors, a removed BMS checkout return route, and reporting currency/cohort errors. These are findings, not product fixes made here.

Corrections distinguish live Subscription quotas from purchased extras, recover the historical decision to retain both supplier uniqueness constraints, clarify anonymous profile access walls and missing creation SQL for introspected tables, and correct the seed to four displayed generations. Historical incidents, numbers and removed behavior remain preserved. Older Neon/Vercel and retired product paths are labeled historical.

## Memory preservation and approved migration

APP CLAUDE.md had 815 lines. Its recovery copy is **142735 bytes**, SHA-256 **4b97b5f259f26ea6f894c2a81d44c9b21a227c74bc19857edfe5cfcc6c9ecacb**, matching the original working file byte-for-byte. Normalized text matches tracked 6e06634 content; Git LF versus working CRLF explains the byte-count difference.

After the migration table and archive were prepared, the user explicitly answered **“Yes, replace it and keep the archive.”** APP CLAUDE.md now contains `@AGENTS.md`; root and app pointers lead to their applicable guides. [HISTORY](../HISTORY.md) contains the section/destination/action table and links the unmodified original plus all prior tracked app guides. No original heading, symbol, path, command or incident content was intentionally dropped.

## Cleanup and concurrent work

The original QA launcher was stopped via Ctrl+C and its web listeners were observed gone before the build. Temporary fixture edits are restored. The storage test deleted its own object. Local volumes/seed data remain.

A later ownership check found another `node scripts/local-qa.mjs` launcher (PID 19212) with APP listener 34628, BMS 29740 and SEQ 15412, created after the original cleanup. It was not started by this completion run. Those later servers were preserved along with genealogiq-postgres and genealogiq-azurite, which they need. Unrelated one-pager-postgres/svp-postgres containers were untouched. Run `pnpm db:down` only after the current launcher's owner finishes, following the [cleanup runbook](../LOCAL-DEVELOPMENT.md#stop-and-cleanup).

## Related

[Root guide](../../AGENTS.md) · [TESTING](../TESTING.md) · [LOCAL-DEVELOPMENT](../LOCAL-DEVELOPMENT.md) · [GAPS](../GAPS.md) · [HISTORY](../HISTORY.md)
