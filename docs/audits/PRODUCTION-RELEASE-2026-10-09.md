# Consolidated Genealogiq release — 2026-10-09

## Scope and source

The user authorized completion of recent agent work, committing everything relevant and deployment, and explicitly waived browser automated QA. All 18 recent Genealogiq chats were inspected; the other chats were idle or unloaded. Work remains on the original main branch, starting at `3826319`. Private source photos, the local environment scratch file, generated Next configuration and ignored QA artifacts are excluded from release source.

| Recent work | Completion included in this release |
| --- | --- |
| APP memorial creation from existing family profiles | `818c2c6`; guarded selection, relation linking and duplicate boundaries reviewed |
| SEQ memorial capacity and QR downloads | `3826319`; plan-based human/pet limits, live export permissions and decoded PNG/SVG regression evidence |
| Place and pet QR exports | `e80c449`, `12bbeb6`; SVG/PNG downloads reviewed |
| APP directory across partners | `ac34bc1`; live platform-admin read scope includes inactive/legacy no-email APP_USER accounts |
| Biography accents/emoji | `08b2b1c`; local Unicode persistence and anonymous-edit boundary already recorded |
| BMS Guardião / Usuário Final wizard | Interrupted five-step UI, translated copy, original direct-consumer contract and action boundaries completed |
| Direct Premium revoke | Named gift confirmation, live platform guard, atomic cancellation/audit, preserved identity/paid time and stale/concurrent request checks completed |
| Premium 2099/2100 dates | Current grant writer replaces the migration-only test allowance; version-2 reviewed repair aligns historical gift dates and prevents test-allowance resurrection |
| General email audit | Completed atomic receipt queue, escaped template, provider acceptance, bounded retry, recipient/cycle/payment supersession checks, coupon email-only retry and explicit pending states |
| Earlier login report | User confirmed in this chat that the problem is no longer happening |

The previously deployed verified sender is `no-reply@genealogiq.com.br` at `4d1af78`; this release retains that provider/domain configuration. Previously reviewed stored-text repairs are preserved. Six legacy damaged fields still require known originals, as recorded in the text audits; this release does not invent replacement characters.

## Source and automated checks

Prisma generation passed. The final deterministic suite passed 1,218 tests; 40 opt-in tests were skipped by that default run and are not counted as passes. All 11 TypeScript tasks passed. Lint passed with zero errors and 49 warnings (APP 8, BMS 21, SEQ 20). Schema parity, 78 ordered migrations, nine-locale parity, i18n references (zero errors; 88 dynamic calls and one unmapped file excluded), Bicep compilation and documentation checks passed. The generation/typecheck/lint/build sequence is serialized to avoid Windows generated-client races. Production builds are recorded below after completion.

The disposable `genealogiq_coupon_qa_release_20261009` database was cloned from the identified Docker local database. Both exact additive migrations (consumer revocation and EmailOutbox) applied successfully; Prisma reported the schema already in sync. Consumer grant 11, revoke 10, manual coupon 8 and outbox 6 cases passed against real PostgreSQL: 35 total. These check independent values, concurrent operations, actual rollback, retained identity/audit, one sale/receipt under replay, provider failure/retry, live recipient changes and GenCode undo/resale. Only this disposable database receives temporary failure constraints.

The guarded expiry-repair suite passed four scenarios/five Node entries, including literal corrected dates, paid-through preservation, exclusion of unrelated/tenant rows, stale-hash rejection, atomic rollback, leap-day clamping and cancellation of the replaced test allowance. No live payment provider or real recipient is used in these tests.

The enabled Azurite integration passed its independent create-only upload, overwrite rejection, promotion/public-read and owned-object deletion checks. This is storage API evidence, not browser upload QA.

## Local runtime and UI

All three local production builds passed sequentially, including their TypeScript and route generation stages, using disabled external providers, the disposable database and an isolated Next output directory. Production container packaging is verified separately by CI.

This chat started only repository PostgreSQL and Azurite containers after identifying no existing running containers. The built apps then ran on loopback ports 8000/8001/8002 using the standard local launcher's provider/credential isolation and the disposable database. Each app passed live/ready HTTP checks, public sign-in form retrieval, normal Credentials authentication with the public local fixture, invalid-credential rejection and authenticated page retrieval (APP /messages, BMS /consumers, SEQ /customers). Anonymous requests redirected to sign-in; APP uses Next's documented streamed meta redirect, so its initial HTTP status is 200. The authenticated BMS /customers/new route rendered successfully. Closed select options are covered by component tests, not claimed as browser interaction.

Browser automated QA is omitted at the user's explicit request; current feature UI paths are not claimed as exercised. Prior feature-specific UI/QR/Unicode evidence remains in its original audit/chat.

## Production preparation

Azure subscription verified: `c710b26f-e3c7-4a45-9477-eaaf3bdcc329`. Resource group: `rg-genealogiq-prod`. All three apps initially used immutable image `4d1af78731b511be055cd2a8391f9b5310929758`, with succeeded ready revisions `--0000012`.

The first read-only expiry preview (`job-genealogiq-migrate-prod-oem80ny`) succeeded with 43 independent migration sales and one gift (45 changed rows), matching the earlier audited preview hash `051a1eb9a64d8a697b9441346824000aaf214f06a317774b366b786b9040aec7`. No apply used that version-1 plan. Version 2 additionally cancels only the replaced migration test allowance; its fresh reviewed hash and receipt are recorded below before/after apply. Four tenant test sales remain outside this repair's scope.

Production database public access stays disabled. PITR retention remains 14 days. On-demand backup `before-consolidated-release-20261009` completed at **2026-10-10 00:11:32.623794 UTC** (2026-10-09 local date). Deployment uses the existing main-branch GitHub/Azure workflow with immutable SHA tags, one migration job and all three app images plus scheduler/migration jobs. Image-change what-if, workflow results and live checks are recorded below after completion.

Version-2 read-only preview `job-genealogiq-migrate-prod-j7h5nxr` succeeded: 43 independent migration sales and one gift, 45 rows total, exactly one replaced test allowance to cancel. Expected gift end: **2027-10-08 02:13:01.075 UTC**. Reviewed hash: `e63d311a54ef2d2f0b04868f6cf28a4506dbdd770215aa08733989cb6faed362`. All before/after rows are retained privately; the successful application of this same plan is recorded below.

## Release completion

Release source committed and pushed to main as **462f8a976ee02156f34e989778abdb00313baa57**, together with the five previously unpushed recent feature/audit commits. No branch change or force push was used.

The image what-if read current resources with API version 2024-03-01 and showed only the six intended container image fields, plus removal of the read-only runningStatus display field for the three apps. There were no resource creations/replacements or configuration/secret/domain changes. The existing deployment workflow applies image-only CLI updates; the preview template itself is not deployed.

[CI run 38009297090](https://github.com/genealogiqdev/genealogiq/actions/runs/38009297090) completed successfully, including its blocking quality gates and clean Linux production image/startup checks for APP, BMS and SEQ.

[Deploy Azure run 38009297139](https://github.com/genealogiqdev/genealogiq/actions/runs/38009297139) compiled all five images, but attempt 1 failed during the BMS image upload when ACR refused a TCP connection. The migration/deployment job was skipped and production was unchanged. Only the failed job and its dependent deployment were retried against the same immutable source in attempt 2, which **succeeded**.

Migration execution **job-genealogiq-migrate-prod-klvobww** succeeded on the release image. The two new migrations are recorded as finished and not rolled back; migration execution was not duplicated by the failed first build attempt.

| Production app | Active revision | Health / traffic | Image source |
| --- | --- | --- | --- |
| APP | ca-genealogiq-app-prod--0000013 | Healthy, Running, 100% | 462f8a976ee02156f34e989778abdb00313baa57 |
| BMS | ca-genealogiq-bms-prod--0000013 | Healthy, Running, 100% | 462f8a976ee02156f34e989778abdb00313baa57 |
| SEQ | ca-genealogiq-seq-prod--0000013 | Healthy, Running, 100% | 462f8a976ee02156f34e989778abdb00313baa57 |

The daily scheduler, schema migration and media migration jobs all use the same release SHA and report succeeded provisioning. The existing daily execution at 2026-10-09 06:00 UTC succeeded; no extra daily run was triggered to send customer mail as QA.

Live HTTP verification passed at genealogiq.com.br, bms.genealogiq.com.br and sequoia.genealogiq.com.br: live/ready endpoints and public sign-in forms returned 200, and anonymous protected pages redirected to sign-in. The unauthenticated BMS daily endpoint returned 401. www.genealogiq.com.br liveness also returned 200. The repository Azure verifier passed all default-host health/database checks and the media HTTPS/TLS/blob-access contract. All eight existing metric alerts remain enabled; PostgreSQL is Ready, privately networked, with 14-day PITR.

## Production data correction and independent verification

After the corrected BMS writer was healthy and receiving all traffic, **job-genealogiq-migrate-prod-blxapnn** applied version 2 successfully using the exact reviewed hash above. It changed 45 rows across the 43 migration allowances and one audited gift, including cancellation of the one test allowance replaced by that gift. No account, credential, purchase or email was created by the repair.

Independent read-only execution **job-genealogiq-migrate-prod-q3sge3o** compared every reviewed target field with its expected value: **45 of 45 matched**. It independently confirmed both release migrations, zero independent 2099 test sentinels and an active, unrevoked gift with start **2026-10-08 02:13:01.075 UTC** and effective end **2027-10-08 02:13:01.075 UTC**. EmailOutbox contained zero rows at that check, consistent with no historical mail backfill.

Final read-only preview **job-genealogiq-migrate-prod-8qho5iv** succeeded with **zero legacy sales, zero gifts and zero repair rows**. Empty-plan hash: `98f1b41e4af659c74646165c5acb378bc0a2bce40544715663e6507e61f6051a`. The private receipts retain the full before/after values. This follow-up release record changes documentation only; running application source remains `462f8a9`.

## Cleanup and limits

The owned launcher stopped its three apps; ports 8000/8001/8002 had no listeners afterward. With zero remaining database sessions, the disposable release database was dropped. Only the PostgreSQL/Azurite containers started for this task were stopped; their original data volumes remain. The three generated tsconfig changes were restored, and git was clean after the source push.

Automatic approval review rejected removal of the three .next-qa-release-20261009 build directories, stating that the action was blocked by policy. They remain ignored locally; no alternate deletion method was attempted. Private original assets and ignored test logs are preserved.

Provider acceptance is distinct from inbox delivery; no new real customer email is sent as QA. Google OAuth, physical plaque behavior, browser interaction, production PWA/push and the six uncertain legacy text originals remain the previously documented integration limits.
