# Production release — November 20, 2026

## Work and code

The user asked to merge the work from two recent chats and deploy it.
Both changes are now merged and live.
A PR is a code change for review.

| Work | Merged PR | Result |
| --- | --- | --- |
| SEQ B2B buyer segments | [PR #215](https://github.com/genealogiqdev/genealogiq/pull/215) | The form offers Cemitérios, Crematórios, Memoriais and Funerárias. |
| APP multiple tributes | [PR #216](https://github.com/genealogiqdev/genealogiq/pull/216) | Add stays available. Each message has its own edit link. |

Started on local `main` at `a18033d` with a clean working tree.
The two feature changes were already committed.
Added the guarded [tribute release job](../../scripts/production-tributes-release.mjs) to the APP PR.
Kept the local branch as `main`.
The merged tree matched the full local tree before branch alignment.
No local code or file content was lost.

The SEQ merge checked head `a9518c465ba84dcf712d300d06294668530beb2e`.
Its merge is `dcfd3ac4485569a777608a291f63cf65b65be9d9`.
The APP merge checked head `207114348dfcb078cca1d307584cad4bfb6f9913`.
The released source is merged `main` at `58344b6e9623b9234fe25c4ee4f0aed177efb5e0`.
Unrelated dependency PRs are outside this release.

## Checks

[GitHub CI on the released commit](https://github.com/genealogiqdev/genealogiq/actions/runs/44746410011) passed.
CI is the automatic code check.
It passed 1,574 tests in 169 files.
It skipped 70 optional tests in nine files.
Type, language, database layout, migration and code rule checks passed.
All three production image builds and their health checks passed.
An image is the package used to run an app.

Two release guard tests passed locally.
One real PostgreSQL test passed in a disposable local database copy.
It reproduced the old duplicate-message error.
It applied the exact migration twice.
It checked two messages, an edit of only the second and complete test-row rollback.
Documentation and whitespace checks passed.
The earlier feature audits retain the 29 APP and 33 SEQ focused checks.

## Production database

A migration changes database rules.
A hash checks that saved file bytes match the original bytes.
Only `20261120000000_multiple_tributes_per_author` was pending.
The job preserved the seven known historical migration entries.
It found no unfinished migration.

The first APP build saved a private row snapshot before publication.
It read the snapshot back and checked its SHA-256 hash.
That snapshot has 174,273 bytes.
Its path is `database-backups/tributes-2026-11-20/a7b847f7-78a4-4d06-b1c7-7e317c7f8496.json.gz`.

Published the ID-based APP code first.
An ID names one message.
The live domain and page showed the reviewed APP build.
The migration build then saved and checked a fresh private snapshot.
That snapshot has 174,274 bytes.
Its path is `database-backups/tributes-2026-11-20/7651a729-318c-4d52-9d10-b0d54c999b0c.json.gz`.
Its SHA-256 is `9eb89557922a4b151893eaffa6607d4c19212a97300454d91eb93964ef9ccce0`.

Canonical Prisma migration completed.
A separate verification build found all 80 canonical migrations applied.
The saved tribute SQL hash matches `d6311df0dd80cbca26e70ba4624e10fe3eab957d89b36a059b9549267c9b258f`.
The old unique key is gone. The regular author/profile index is present.
Both checks added two temporary messages and edited only the second.
The first temporary message kept its original text and approval.
Both checks rolled back the temporary messages.
The final check still found four tributes and 15 notifications.

Release flags were used only in the named builds.
The project environment has no saved tribute or B2B migration flags.
The snapshots preserve rows and schema.
They do not prove a full recovery rehearsal.
After migration, recover only to an APP build that uses tribute IDs.
The first APP build below is a compatible recovery candidate.
Do not restore the old unique key after users add multiple tributes.

## Live builds and web checks

Each new build uses the same released source and the production environment.
All builds are READY.
Deployment metadata and final public response headers show `gru1`, São Paulo.
The final APP deployment and logs report Node.js 26.
The earlier project inspection reported Node.js 22.
The source allows Node.js 22 or later. This release did not change that range.

| App / step | Deployment |
| --- | --- |
| APP first publication and compatible recovery build | `dpl_4P7wRbeg8zdvhRMA51ppovUZL7s2` |
| APP migration build | `dpl_E7iugnPb6bA4NfKZpHRAz1cpa86S` |
| APP final verification and live build | `dpl_EtuKp4HnZg3StZP8pVxTAjLxNVfH` |
| SEQ live build | `dpl_EekDssUKFGNPKzqYyakGN937KvHt` |
| BMS existing live build | `dpl_2g7fYVU7RQQR1sbiobYR97ptAg2U` |

The domain API and public page content confirm the final APP and SEQ build IDs.
Apex and www use the final APP build. Sequoia uses the named SEQ build.
All four public HTTPS roots returned 200.
All three database readiness routes returned 200 and `ready`.
Anonymous APP private-document access returned 401.
Unsigned BMS daily-cron access returned 401.
The protected preview checks used existing Vercel authentication.
The first document probe used an absent route. Its 404 was not counted as an access check.
The connector treated the real document route's 401 as a protection failure.
The linked CLI then confirmed the application route's 401.

The error/fatal log scan covered 10:46–10:52:15 São Paulo time.
It used a 100-record limit for each named deployment.
The first APP build had three records. Final APP had four. SEQ and BMS each had two.
All eleven records contain the existing PostgreSQL SSL-mode warning.
No other application error appeared in this bounded scan.
The team has no configured log drains.
This check does not prove untested routes or continued monitoring.

## Remaining checks and cleanup

Chrome acceptance remains pending.
The earlier chats reported Windows screen access denied.
This release did not run a new browser submission or approval.
The tester must restore Chrome access.
Then test two tributes, approval, an edit of only the second and denied access.
The tester must also check SEQ save/reload and the old-segment error.
Provider, device and recovery checks remain as listed in the migration runbook.

The disposable local database copy and its temporary dump were removed.
No owned product server remains on ports 3000–3002.
Shared PostgreSQL and Azurite services were preserved.
Sanitized source, backup, migration and public receipts are in `.local-qa/release-20261120/`.
This audit is committed on the original `main` branch after release.

## Related

[APP feature audit](APP-TRIBUTES-2026-11-20.md) · [SEQ feature audit](SEQ-B2B-SEGMENTS-2026-11-20.md) · [Tribute release order](../../apps/app/docs/TRIBUTES.md#runbooks) · [Vercel migration](../VERCEL-MIGRATION.md) · [Database](../DATABASE.md)
