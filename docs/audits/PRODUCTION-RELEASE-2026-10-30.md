# Consolidated production release — 2026-10-30

## Scope and source

The user requested a review of recent chats, completion/commit of their work and production deployment. Reviewed the eight October 29–30 Genealogiq feature chats and three earlier QR, partner-access and Vercel release chats returned in the recent-chat inventory. Other repositories and unrelated Dependabot updates are outside this release.

Started on `main` at `694dd1ff5c55c26e2c2a407fa04eda7451b13934`. All feature changes were already committed; the three dirty TypeScript configurations contained generated formatting only. Verified GitHub destination `genealogiqdev/genealogiq`, fetched current refs, and reviewed the release delta from production source `56f72f4`. No schema, migration or dependency changes are present in that delta.

| Recent work | Commit / publication | Evidence and limits |
| --- | --- | --- |
| Legacy plaque location opens the memorial | `f3a663c`, already on GitHub main | [Scan audit](APP-MEMORIAL-SCAN-2026-10-29.md); anonymous redirect tested previously |
| Human/pet QR download uses shared file delivery | `ada4f27`, already on GitHub main | [Download audit](APP-PET-QR-DOWNLOAD-2026-10-29.md); original iPhone download acceptance remains pending |
| Desktop pet portrait preparation and error handling | `0ed315a`, already on GitHub main | [Portrait audit](APP-PET-AVATAR-2026-10-29.md); original-file upload/save/reload remains pending |
| Guarded memorial selection in family trees | `b7e7005`, already on GitHub main | [Tree audit](APP-TREE-GUARDED-MEMORIALS-2026-10-29.md); full mutation/reload UI acceptance remains pending |
| BMS links independent APP customers to Sequoia | `011968c`, [PR #207](https://github.com/genealogiqdev/genealogiq/pull/207) | Prior local link/export and PostgreSQL evidence in [consumer audit](BMS-CONSUMER-PARTNER-2026-10-29.md) |
| Premium GenCode shortcut on memorial covers | `e97720e`, [PR #208](https://github.com/genealogiqdev/genealogiq/pull/208) | Prior Chrome Premium/anonymous checks in [shortcut audit](APP-MEMORIAL-GENCODE-2026-10-30.md) |
| First SEQ memorial QR consumes stock once | `694dd1f`, [PR #209](https://github.com/genealogiqdev/genealogiq/pull/209) | Prior nine real PostgreSQL tests, Chrome repeat/no-stock and persisted ledger checks in [stock audit](SEQ-QR-STOCK-2026-10-29.md) |
| SEQ package sidebar and bulk pricing | Already present in production source | Recent chat verified 20 units / R$3,000, 50 units / R$6,750 and invalid quantities; no new code required |

Merged #207, retargeted #208 to main and merged it, then retargeted/merged #209. Each merge matched the reviewed full head SHA. Final merge `2066c6bbe598a53fe62485bf74eb1033e494b89e` has an identical Git tree to `694dd1f`. Fast-forwarded the original local main; no local branch was created or switched.

The legacy Deploy Azure workflow was still active. Disabled that obsolete production workflow using the saved Genealogiq GitHub account before merging; the API confirmed `disabled_manually`. CI remains enabled. The first attempt with the other saved account returned 403 and made no change. Azure remains unavailable as a rollback target.

## Automated validation

- Full combined Vitest suite: **160 files / 1,505 tests passed**, nine opt-in files / 61 tests skipped. Skips are not integration passes.
- Prisma generation and sequential Turbo typecheck: **11 packages passed**. Turbo's dependency graph also invokes generation; no concurrent generation was launched.
- Sequential lint: **zero errors**, 49 existing warnings (APP 8, BMS 21, SEQ 20).
- Single-schema guard, 78-migration structure guard, locale parity and locale references pass. Locale references retain 96 dynamic-call skips and one unmapped columns file.
- Documentation checks pass; no business source was changed in this release consolidation.
- [GitHub CI run 41054748329](https://github.com/genealogiqdev/genealogiq/actions/runs/41054748329) passed on merged `2066c6b`: verification plus all three production container builds.

Logs are ignored under `.local-qa/release-20261030-*.log`. Existing integration audits above remain separately dated; this release does not claim rerunning every opt-in provider/database fixture.

## Deployment and rollback provenance

Archived tracked source at exact `694dd1f` into three isolated directories under `.local-qa/release-20261030/`, retaining only existing project identity links. No local environment, backup, dependency or QA data was added to the source archive. Verified each existing project owner, project ID and root directory with CLI `project inspect --non-interactive` before staging.

Used Vercel CLI 64.5.0 `deploy --prod --skip-domain`; all three cloud builds completed READY. Deployment API metadata independently identifies source `694dd1ff5c55c26e2c2a407fa04eda7451b13934`, production target and `gru1` function region metadata. Merge commits do not change that source tree.

| App | New deployment | Build duration | Previous production rollback candidate |
| --- | --- | --- | --- |
| APP | `dpl_7gFGJhVabcAEWNKREUXoSPcr952Y` | 109 seconds | `dpl_D94wKR658w56r3hWNEbGADFVBk6k` |
| BMS | `dpl_2g7fYVU7RQQR1sbiobYR97ptAg2U` | 95 seconds | `dpl_ABpnSpvr2HGjVbSydCW24A6ztHbb` |
| SEQ | `dpl_Af5DXye8pPfadAFyPDwsRhYYotY5` | 92 seconds | `dpl_3aDnMopsVRH7Unw9r9vjdM7jUJyH` |

Before promotion, authenticated `vercel curl` checked all three `/api/health/ready` endpoints: HTTP 200 / ready against real Neon. APP anonymous private-document access returned 401; BMS unsigned daily cron returned 401. SEQ Credentials provider metadata uses its correct final production callback. Protection was preserved. No authorized cron, checkout, customer mutation, restore or data migration was run against production.

## Local runtime and browser evidence

Started the documented loopback/provider-disabled launcher at ports 5000–5002, using pre-existing PostgreSQL/Azurite services. Chrome APP Credentials sign-in passed. Rex's favorite was removed, reloaded as absent, restored and reloaded as present. Sign-out followed by `/home` navigation redirected to sign-in. Independent PostgreSQL query of `app_favorites` confirmed exactly one restored favorite.

Chrome intermittently timed out while navigating but recovered. The workstation then rejected process creation with Windows error 1455 (paging file too small). Stopped the owned launcher; its three child PIDs and all three listeners were gone. This resource failure is not an application test failure or a completed BMS/SEQ persistence scenario. Continued with single-app checks where possible; final outcomes are recorded below. The initial query used the outdated table name `favorites`; it failed read-only before the successful canonical `app_favorites` check.

## Remaining acceptance

Production environment metadata still lacks `STRIPE_WEBHOOK_SECRET` in APP and SEQ; their existing Resend keys are present. BMS's historical signing-secret match against its live Stripe endpoint remains unverified. Payment completion cannot be claimed from this release. No secret values were printed or changed.

Preserve the [Vercel migration runbook](../VERCEL-MIGRATION.md) acceptance gaps: recovered-user authenticated production flows, enabled external-provider callbacks/delivery, private media success/denial, cron lifecycle/idempotency, recovery retention/restore rehearsal and legacy public document restrictions. Original-device portrait/QR and full family-tree mutation acceptance remain as listed above. Production release authorization does not turn these unexercised scenarios into passes.

## Final release evidence

Promoted each staged build using `vercel promote`, without rebuilding. The alias API independently confirms apex/www point to the named APP deployment, BMS to the named BMS deployment and Sequoia to the named SEQ deployment. All remain READY.

Public TLS-validated requests passed on all four HTTPS roots (200), all three readiness endpoints (200 / ready), APP anonymous private-document access (401) and unsigned BMS cron (401). Receipt: ignored `.local-qa/release-20261030/public-checks.json`.

The post-promotion runtime error/fatal scan covered 12:13–12:28 UTC (09:13–09:28 São Paulo), with 50-record limits per deployment and no pagination remaining. APP returned six records, BMS five and SEQ five. All 16 records were the existing PostgreSQL connection-string SSL-mode compatibility warning; no other error/fatal messages appeared. This bounded scan does not prove unexercised routes or ongoing monitoring. The team drain API returned no configured drains.

The single-app BMS retry reached the expected expired-cookie/sign-in boundary after its ephemeral secret changed. Chrome then timed out again; BMS save/reload and SEQ's repeated baseline remain n/a. No BMS/SEQ fixture values were mutated. Stopped that owned launcher and independently verified no listeners remained on ports 5000–5002. Restored only the generated local tsconfig paths/formatting. Existing Docker services, database volumes, prior local fixtures and ignored evidence were preserved. No system paging settings were changed.

All reviewed feature work is merged and deployed. This audit and its runbook links are committed on the original main branch. Historical device/provider/manual acceptance gaps above remain open rather than being reported as completed work.
