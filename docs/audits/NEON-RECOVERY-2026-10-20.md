# Approved Neon recovery — 2026-10-20

## Authorization and source

Continued on main at `2da3a06`. The user confirmed Neon access and Vercel Pro, then explicitly directed recovery from the latest available dump because Azure recovery was unavailable. This overrides the earlier requirement to wait for a current Azure backup; it does not establish that September data contains later Azure changes or waive future recovery-retention gates.

Found identical `genealogiq.dump` files in the repository root and Downloads: plain SQL, 320,986 bytes, SHA-256 `e0b1b0cdde132fe0c60afd993afa8e683fb7d3e501c149f8ee17f33cd04be8b8`, copied September 22 at 12:41:35 UTC. The dump records PostgreSQL 17.11 as source and pg_dump 18.6 as writer. Its latest created/updated data timestamps are September 9 at 13:10:14.843 / 13:27:35.034 UTC. It contains 42 public tables, 117 consumer profiles, 400 GenCodes, 19 documents and 79 migration records. It has seven historical migrations no longer present locally and two rolled-back records; those records were preserved.

The separately named `.azure/genealogiq-pre-azure.dump` is a 145,242-byte custom dump created September 22 at 00:21:59 UTC, with one consumer profile, no document/media rows, and no Prisma migration history. It contains mostly local fixtures and was not selected. Neither original file was modified.

## Account and connections

The Vercel Git deployment context now reports `pro` for Genealogiq Brasil (`team_Gf1VYIPsIC1eAywxB0mhGhkg`); Chrome agrees. APP was already connected to Neon when work resumed. Completed the approved BMS and SEQ connections with sensitive credentials, production only, default key names and no automatic per-deployment branches. Chrome and separate environment API reads verify sensitive `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in all three apps; existing public/private Blob tokens remain sensitive and production-only. Screenshot: `.local-qa/neon-production-connected-20261020.png`.

Target: `neon-copper-nest`, project `icy-credit-38971700`, Vercel store `store_JYKKhOoGN8sq5En5`, São Paulo, Neon Free. A direct TLS-verified connection confirmed PostgreSQL 18.6, an empty public schema and nine starter `neon_auth` tables. The Neon Auth tables were preserved; application authentication remains NextAuth. No new database or credential rotation was created.

## Rehearsal, restore and schema verification

Restored into an isolated PostgreSQL 17.11 container first. The unmodified SQL restore failed atomically on old provider-specific default privileges for `neon_superuser`. Generated an ignored derivative that removes only 61 ownership statements and two old provider default-grant statements. It retains `REVOKE USAGE ON SCHEMA public FROM PUBLIC` and all data. The COPY-block SHA-256 is `36bb3f85efcc7e5a1b06979768152f497cc5726014ec32ca7d5b543c6a989747`. No source roles were created in Neon.

The reviewed local restore succeeded. Prisma 7.9.1 applied all eight pending migrations from `20260921000000_gencode_packages` through `20261009020000_email_outbox`; `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` reported no difference. No `db push`, migration reset, baseline replacement or seed was used.

Before remote restore, backed up the empty Neon target including its starter tables. PostgreSQL 17 pg_dump rejected the newer server version; the official PostgreSQL 18 client completed the backup. The remote restore then ran as one transaction with stop-on-error. Every source table's row count matched, including all 79 original migration records. Applied the same eight migrations with Prisma; all succeeded. A fresh schema diff reported no difference. All 78 canonical migrations are recorded as applied, no unresolved failures remain, and the migration table contains 87 total rows including preserved historical/rolled-back records.

The resulting public schema has 50 tables. The pet migration moved one accepted PET_OF relation to one pet-ownership row (101 → 100 family relations). Consumer profiles remain 117, GenCodes 400, documents 19, gallery items 62 and guardianships 69. Full row fingerprints are saved privately for the restored and migrated database; only the tables touched by these migrations changed. Foreign-key/check constraints are validated, pet-role checks found no invalid links, all nine Neon Auth tables remain, and PUBLIC has no public-schema USAGE.

## Historical Premium expiry repair

The unchanged September test-access migration created 47 zero-value test allowances with the known 2099 sentinel. The existing `repair-premium-test-expiry.cjs` preview selected 44 independent-consumer rows and zero BMS gifts. The reviewed hash was `1f71891a6066c954883ad93784ddf0489595a0904f66e4837859f5faeae8e67b`. The only proposed change was the original creation time plus 12 calendar months, with cancel-at-period-end true; paid periods and identities were outside the change.

Cloned the local rehearsal database into a guarded `genealogiq_coupon_qa_*` database and ran the existing integration suite: all five Node test entries passed, including stale-preview rejection, atomic rollback, paid/partner/lookalike exclusion and leap-day clamping. Took another Neon backup and applied the reviewed hash. All 44 selected rows were repaired; a new preview has zero candidates. Receipts are retained privately. Three tenant-linked test allowances remain at 2099 because the existing repair deliberately excludes partner scope; review them before launch rather than silently expanding the repair.

## Media and deployment boundary

The canonical media inventory found 103 distinct references, including 19 documents, all on `hwx7kxl3piorwf5p.public.blob.vercel-storage.com`. Every HEAD request returned 200; total content length is 199,125,437 bytes. The database dump includes URLs, not the media bytes. The unchanged Vercel migration command copied all 103 objects into the already-connected GRU1 stores: 84 public media objects in `store_NVG2gN8zy3r46uIV` and 19 private documents in `store_9bhZedgkBfKtS939`.

The separate verification stage compared source and destination byte counts and SHA-256 for all 103 objects. Public reads succeeded; anonymous private reads were denied and authenticated private SDK reads matched the source bytes. Only then were all 103 database references rewritten. Independent PostgreSQL queries compared each stored field/array position with its recorded manifest target. A full rollback restored all 103 original references, independently checked against their source values; reapplication restored all 103 target references. Replaying copy retained all 103 copied/verified entries. No source objects were deleted and no application writes ran during the round trip. Forced interruption and concurrent application editing were not exercised against the real provider.

The final database references all 19 documents through the private store. Chrome's read-only Neon query editor independently showed 117 profiles, 400 GenCodes, 19 documents, 19 private URLs, eight recovery migrations applied and zero failed migrations; screenshot `.local-qa/neon-recovery-verified-20261020.png`. This verifies database state, not the application's authenticated download route. Previously distributed public source URLs remain accessible, so DOCUMENTS-G1 stays open until legacy access is restricted and deployed application authorization is exercised.

APP/BMS/SEQ app secrets, BMS cron secret, external provider setup, Git/deployment setup, live application health/authentication and final DNS acceptance remain separate work. No Vercel deployment or Hostinger change was made by the database restore. Vercel Pro is confirmed; Neon Free still does not meet the previously agreed 14-day recovery requirement. The older-source approval does not waive that future retention decision.

## Hostinger handoff

The four exact DNS records were collected from Vercel's domain API; Chrome independently confirmed the apex A record. The current nameservers remain Hostinger and all four website hosts still resolve toward Azure. The table and sequence are in [VERCEL-MIGRATION](../VERCEL-MIGRATION.md#hostinger-records-prepared-on-october-20). Preserve mail records, recheck Vercel's current recommendations and apply only after deployment acceptance.

## Private artifacts and verification limits

Ignored `.local-qa` contains the source summary, reviewed derivative SQL, restore/migration logs, row fingerprints, Premium preview/receipt, media manifest and source availability results. Backups include `neon-before-recovery-20261020.dump`, `neon-before-premium-repair-20261020.dump`, `neon-before-media-20261020.dump`, and `neon-restored-migrated-20261020.dump`. The post-repair/pre-media backup is 253,196 bytes, SHA-256 `7ee158094a31de39386d7611f2623f5adde9d424671e2c500f76f61f93b92861`. The final post-media backup is 254,307 bytes, SHA-256 `5b90eae3795d5c9ca3803d41ee91172d4cfe021de0b5962bc368f5b3fe7da0ab`; the target measured 13,139,968 bytes. Keep backups and receipts private. Credentials were read from the existing provider UI without printing values and used only for the approved migration.

This audit proves local restore/migration rehearsal, live Neon restore/schema/data checks, the named five-entry repair regression suite, and actual Blob copy/integrity/access/rewrite/rollback/replay. Application source is unchanged from `2da3a06`; the prior full test/build results were not rerun. The October 19 three-app baseline remains historical evidence; these operations do not establish browser login, tenant mutation or private document delivery in a deployed app. Application UI acceptance is n/a until secrets and deployments are available.

Documentation validation passes for four guides, 40 indexed features, 2,651 local links and 161 named source references; `git diff --check` passes. Both task-owned recovery containers are stopped and their volumes retained, loopback port 5438 is closed, and the unrelated pre-existing `svp-postgres` container remains running. Both temporary credential files were removed and the browser automation session's in-memory variables cleared. Backups, private receipts and screenshots remain ignored local artifacts. No app server, Git push, deployment or DNS change was performed in this recovery step.
