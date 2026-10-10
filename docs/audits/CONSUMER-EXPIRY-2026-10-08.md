# Consumer Premium expiry correction — 2026-10-08

## Request and source

The user reported a BMS directory showing Premium until December 2099 and a
newly granted gift until December 2100. The intended gift is 12 calendar months.
Source baseline: `4eb3d5c`, whose feature implementation is `8422e6c`.
No later changes affected the consumer service/actions/query. The existing
three tsconfig formatting changes, untracked `assets/` and `envs` are unrelated
and remain outside this change.

The original `20260922010000_grant_premium_test_access` migration created
`test-premium-<md5(AppUser.id)>` zero-value Premium AppSales until
`2099-12-31T23:59:59Z`. The BMS grant writer treated these as already purchased
time and added 12 months. Both the directory and APP read persisted sale
dates, so changing only the displayed year would leave the entitlement wrong.

The corrected writer excludes only the exact migration-origin zero-value
non-Stripe test sale, preserves genuine compatible paid/manual time and
cancels the old test sale atomically with the account/gift/audit transaction.
Retries keep the original gift. No payment, identity, tenant or mail-flow
change is required.

The separate guarded repair keeps historical migrations unchanged. It makes
independent-consumer test terms finite from their original creation and
corrects the affected BMS sale and grant dates together. It excludes tenant
consumers, paid/provider/coupon-linked rows and lookalike IDs. Its preview is
read-only; apply requires the reviewed plan hash, locks affected consumers,
checks every original value, verifies the result and rolls back on failure.
Receipts retain before/after values without customer names or addresses.

## Tests

| Layer | Result | Scope |
| --- | --- | --- |
| Deterministic Vitest | 111 files / 972 tests passed; four opt-in files / 24 tests skipped | Includes three new literal legacy-expiry/paid-period/provenance cases |
| Consumer PostgreSQL | 11 passed | New legacy replacement, effective-plan selection, retries, paid-period preservation and rollback cases |
| Repair PostgreSQL | Four scenarios / five Node test entries passed | Read-only preview, 2099/2100 correction, paid/tenant/lookalike exclusions, stale hash, atomic rollback and leap-day clamp |
| Prisma generation / TypeScript | Passed / all 11 tasks passed | No schema change |
| Lint | All four tasks passed | Existing warnings retained; no new errors |

The service tests expect 2026-10-07 → 2027-10-07; purchased time through
2027-01-31 becomes 2028-01-31. The repair test independently expects the
reported grant timestamp 2026-10-08 02:13:01.075 → 2027-10-08 02:13:01.075.
Tests do not derive expected dates from the helper under test.

## Local runtime and UI

Docker Desktop was unavailable to this Windows session because another
session owned its engine pipe. Only this task's attempted Docker startup
processes were stopped; the other session was left untouched. A dedicated
PostgreSQL 17.10 runtime from the npm package
`@embedded-postgres/windows-x64@17.10.0-beta.17` was initialized under ignored
`.local-qa/consumer-expiry/pg-data`, bound only to 127.0.0.1:5432 and configured
for UTC. No shared Docker data or production dump was used.

The canonical Prisma schema, guarded normal seed and the consumer-period
CHECK constraint supplied this isolated local database. A separate
`genealogiq_coupon_qa_expiry_20261008` template copy was used for tests that add
failure constraints. This does not establish a full historical empty-database
migration replay. The existing local launcher supplies normal authentication
and disables cloud providers; Resend is captured on loopback only.

Observed with the normal BMS administrator Credentials form:

- `expiry-legacy@genealogiq.test`: starting with the exact 2099 test sale,
  granting access displayed **8 de outubro de 2027**. Submitting the same email
  in uppercase displayed the already-granted message and retained that date.
- `expiry-paid@genealogiq.test`: a 2099 test sale plus an independently seeded
  paid end of 2026-12-15 displayed **15 de dezembro de 2027** after the gift.
- The persisted-repair, APP reload and final cleanup results are appended below
  after verification. A captured message is not proof of external inbox delivery.

Private local logs and screenshots are retained in `.local-qa/consumer-expiry/`.

## Production read-only investigation and backup

- Azure subscription verified as `c710b26f-e3c7-4a45-9477-eaaf3bdcc329`.
- Read-only execution `job-genealogiq-migrate-prod-iqaoj23` succeeded. It found
  47 exact migration-origin test sales, 43 for independent consumers and four
  for tenant customers. All 47 were zero-value Premium without Stripe links,
  created on 2026-09-22 15:24:28.674Z and ending on the 2099 sentinel.
- One independent BMS gift created at 2026-10-08 02:13:01.075Z had inherited
  2099 → 2100. Its email had not been marked sent and it had no other original
  paid-through period. Expected corrected end: **2027-10-08 02:13:01.075Z**.
- Read-only preview execution `job-genealogiq-migrate-prod-uhkhwoy` succeeded:
  43 legacy sales, one gift sale and its audit, totaling 45 rows. Preview hash:
  `051a1eb9a64d8a697b9441346824000aaf214f06a317774b366b786b9040aec7`.
  The four tenant test sales are outside this correction's scope.
- PITR retention is 14 days and public database access remains disabled.
  Explicit backup `before-consumer-expiry-20261008` completed successfully at
  2026-10-08 13:18:56.526532Z, type **Customer On-Demand**. No SAS, transfer job
  or workstation database credential was needed.

## Release and repair

Deployment and guarded production apply have not yet run at this audit point.
Append their execution IDs, immutable image revision, health checks and final
read-only verification here after they complete. Do not count the preview,
backup or local tests as production application or data-change evidence.

## Limits

No real customer was created and no external email was sent during verification.
Production inbox delivery and Google OAuth remain the existing CONSUMERS-G2
integration prerequisites. Existing recipient passwords and identity remain
unchanged. The original consumer access audit is retained at
[CONSUMER-ACCESS-2026-10-07](CONSUMER-ACCESS-2026-10-07.md).

## Consolidated completion follow-up, 2026-10-09

The pending statements above describe the interrupted original chat. The [consolidated release audit](PRODUCTION-RELEASE-2026-10-09.md) records the completed source review, final deterministic and disposable PostgreSQL checks, deployment and cleanup. Current browser automation was waived by the user; earlier recorded browser evidence is preserved without being counted as a new UI run. The expiry repair version 2 additionally cancels only the replaced migration allowance so a later gift revocation cannot revive it; its new preview/hash is recorded in that audit.
