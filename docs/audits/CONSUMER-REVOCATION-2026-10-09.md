# BMS Premium gift revocation — 2026-10-09

## Request and source

The user requested an option to undo a Premium release in BMS and clarified
that the email resend problem had already been fixed in another session.
Work started on `main` at `01201a0`; the email sender fix at `4d1af78`, global
directory at `ac34bc1` and the uncommitted legacy-expiry correction were traced.
Concurrent unrelated edits were preserved, including the BMS registration
wizard and APP GenCode changes. No branch was created.

`Desfazer Premium` confirms the named recipient and submits the stable gift
ID. The action reloads current platform authorization, validates the ID and
derives the actor from the session. The service locks the stored recipient,
reloads the gift/sale and cancels only that exact, live, zero-value Premium
sale without payment, Stripe or coupon links. Original grant dates, account,
password, recovery links, email acceptance and all other sales remain.
Cancellation and its operator/time audit commit together. The new nullable
columns have a paired-presence CHECK and require migration before deployment.

Duplicate cancellations keep the first audit. An old registration UUID cannot
restore a revoked gift; a fresh registration can grant another year. A stale
confirmation cannot revoke the replacement. Resend excludes revoked gifts;
the existing email provider fix is unchanged. Revocation neither sends mail
nor recalls messages already sent or in flight.

## Automated evidence

Initial complete suite: 118 files / 1062 tests passed; five opt-in files / 33
tests skipped. Initial PostgreSQL replay: 11 existing grant cases and nine
new revocation cases passed. Initial Prisma generation and all 11 TypeScript
tasks passed. The three real-portal confirmation tests also passed separately.
Final checks, including the added legacy-test non-resurrection case, are
appended after completion below.

Expected values are independent literals: purchased Premium ending on
2027-01-31 remains effective through that exact date after revocation; a sole
gift has no active sale afterward; a fresh gift on 2026-10-10 ends on
2027-10-10. Tests also preserve the original audit, force rollback after the
sale update, serialize two operators and reject expired/partner/payment cases.

## Local database and runtime scope

The existing isolated PostgreSQL 17.10 process on 127.0.0.1:5432 was identified
by its local `.local-qa/consumer-expiry/pg-data` directory. Docker's engine
pipe was inaccessible to this session; no Docker process was started or
stopped. The public local seed and PREMIUM/FREE catalogs were present.

A new disposable `genealogiq_coupon_qa_revoke_20261009` database was cloned
from that local database before mutation. The exact additive migration was
applied successfully to the disposable copy and the normal local database.
Only the disposable copy received the integration suite's temporary failure
constraint. No production data or external provider was used.

Local runtime/UI, persistence and owned-process cleanup are recorded below
after verification. Raw logs and screenshots are kept in ignored
`.local-qa/2026-10-09/consumer-revoke/`.

## External scope

This task does not establish production deployment, actual customer revocation
or inbox delivery. The verified sender change is existing work; local capture
and resend guards can verify behavior without sending to a real recipient.

## Consolidated completion follow-up, 2026-10-09

The pending statements above describe the interrupted original chat. The [consolidated release audit](PRODUCTION-RELEASE-2026-10-09.md) records the completed source review, final deterministic and disposable PostgreSQL checks, deployment and cleanup. Current browser automation was waived by the user; earlier recorded browser evidence is preserved without being counted as a new UI run. The expiry repair version 2 additionally cancels only the replaced migration allowance so a later gift revocation cannot revive it; its new preview/hash is recorded in that audit.
