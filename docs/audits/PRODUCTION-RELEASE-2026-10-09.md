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

This chat started only repository PostgreSQL and Azurite containers after identifying no existing running containers. Local production-build and three-app HTTP evidence is appended after checks. Browser automated QA is omitted at the user's explicit request; current feature UI paths are not claimed as exercised. Prior feature-specific UI/QR/Unicode evidence remains in its original audit/chat.

## Production preparation

Azure subscription verified: `c710b26f-e3c7-4a45-9477-eaaf3bdcc329`. Resource group: `rg-genealogiq-prod`. All three apps initially used immutable image `4d1af78731b511be055cd2a8391f9b5310929758`, with succeeded ready revisions `--0000012`.

The first read-only expiry preview (`job-genealogiq-migrate-prod-oem80ny`) succeeded with 43 independent migration sales and one gift (45 changed rows), matching the earlier audited preview hash `051a1eb9a64d8a697b9441346824000aaf214f06a317774b366b786b9040aec7`. No apply used that version-1 plan. Version 2 additionally cancels only the replaced migration test allowance; its fresh reviewed hash and receipt are recorded below before/after apply. Four tenant test sales remain outside this repair's scope.

Production database public access stays disabled. PITR retention remains 14 days. On-demand backup `before-consolidated-release-20261009` completed at **2026-10-10 00:11:32.623794 UTC** (2026-10-09 local date). Deployment uses the existing main-branch GitHub/Azure workflow with immutable SHA tags, one migration job and all three app images plus scheduler/migration jobs. Image-change what-if, workflow results and live checks are recorded below after completion.

Version-2 read-only preview `job-genealogiq-migrate-prod-j7h5nxr` succeeded: 43 independent migration sales and one gift, 45 rows total, exactly one replaced test allowance canceled. The gift ends on **2027-10-08 02:13:01.075**. Reviewed hash: `e63d311a54ef2d2f0b04868f6cf28a4506dbdd770215aa08733989cb6faed362`. All before/after rows are retained privately. Apply is still pending at this audit point.

## Release completion

Pending final builds, immutable deployment, version-2 data-repair receipt and live verification at this audit point. This section is updated before completion is reported to the user.

## Cleanup and limits

Owned app processes, disposable test database and repository container cleanup are recorded below after verification. Existing local data volumes and private original assets are preserved. Provider acceptance is distinct from inbox delivery; no new real customer email is sent as QA. Google OAuth, physical plaque behavior, browser interaction, production PWA/push and the six uncertain legacy text originals remain the previously documented integration limits.
