# Production release — November 24, 2026

## Work and code

The user asked to make the mobile sign-in system selector a dropdown (Genealogiq by default), default the mobile app to Portuguese, then commit, merge and redeploy everything.

| Work | Merged PR | Result |
| --- | --- | --- |
| Mobile app, mobile API, Genealogy Scan, native push | [PR #218](https://github.com/genealogiqdev/genealogiq/pull/218) | All three web apps serve `/api/mobile/v1`; the Expo app is published to Expo Go. |

The released source is merged `main` at `2d023071a1a085b6f3dbfb8b02bcf8b4c80f7205` (feature head `a587b8e`). The `rob-eneek` GitHub account has read-only access to the repository, so the push, pull request and merge used the signed-in `genealogiqdev` account, as the November 20 release did.

## Checks

[GitHub CI on PR #218](https://github.com/genealogiqdev/genealogiq/actions/runs/45425751493) passed: `verify` and the APP, BMS and SEQ container builds.

Local checks before the push:

- Vitest: 182 files / 1,968 tests passed, 71 skipped. Release-job tests (`node --test scripts/tests/*.test.mjs`): 5 passed.
- Type check: APP, BMS, SEQ, auth and mobile, zero errors. Lint: zero errors; warnings unchanged at 8 / 21 / 20.
- Documentation, i18n parity, i18n keys, schema parity and the 81-migration structure check passed.
- The container install was simulated without the mobile package; the frozen lockfile was accepted unchanged.
- The release verification (`verifyMobile`) ran against the local PostgreSQL database and left no rows.

## Production database

Only `20261122000000_mobile_push_and_genealogy_scan` was pending; it is additive (two new tables). It ran in the APP production build with `MOBILE_RELEASE_MODE=migrate` through [the mobile release job](../../scripts/production-mobile-release.mjs). The two release variables were passed as build environment for that build only; they are not saved in the project.

| Receipt | Value |
| --- | --- |
| Preflight | 80 canonical + 7 historical migrations applied; only the mobile migration pending |
| Snapshot | `database-backups/mobile-2026-11-24/3059abb4-85a8-48b2-bbe7-ce2cc9020b68.json.gz`, 174,885 bytes, 52 tables, SHA-256 `8149550a5c2ed2edc646ef99a41b967307db28613478d5dadc72ba639fafcc2e`, read back and matched |
| Migration | 81 canonical migrations applied; migration SHA-256 `88eca8dafe7fccd5f85d9f90de6f34d5cef947718200768221ff955dcaf50233` |
| Verification | Both tables carry the mapped columns; `GenealogyScanStatus` is RUNNING, COMPLETED, FAILED; a write to each table rolled back; 128 app users, 0 device tokens, 0 scans |

Existing tables were not changed, so every earlier build stays compatible with the migrated database.

## Live builds and web checks

| App | New deployment | Previous rollback candidate |
| --- | --- | --- |
| APP (migration build, live) | `dpl_3tjWdVDRkK7RpZLrbEr7VkKgJvYd` | `dpl_EtuKp4HnZg3StZP8pVxTAjLxNVfH` |
| BMS | `dpl_G59Sv5Tkmw7E1Hs1zqwW14t8gYAR` | `dpl_2g7fYVU7RQQR1sbiobYR97ptAg2U` |
| SEQ | `dpl_9CKWUuy9VYCPf3yjUTEH5Q4UvBLv` | `dpl_EekDssUKFGNPKzqYyakGN937KvHt` |

Each build was deployed with Vercel CLI 66.6.0 `deploy --prod` from a `git archive` of the merged commit. The domain lookup confirms apex and www serve the APP build, and the BMS and Sequoia hosts serve theirs.

Public checks after deployment:

- All four HTTPS roots returned 200; all three `/api/health/ready` returned 200 `ready`.
- On each of the three hosts, the mobile API answered as designed: unknown account 401 `incorrectCredentials`, empty body 400 `invalidData`, no token 401, invalid token 401, unknown operation 404 `unknownOperation`.
- APP anonymous private-document access returned 401; unsigned BMS cron returned 401.

No authenticated production sign-in was performed: no production credentials were used.

## Mobile app

Expo update `239d14fd-ab7a-4fb3-bc42-cadf1b23cc4e` on branch `preview` of `@rnsbrum/genealogiq` (runtime `exposdk:58.0.0`, Android and iOS) carries the dropdown and Portuguese default. Its source matches the merged commit.

## Remaining checks

- The mobile app has not been walked through on a device, and no authenticated sign-in from it has been observed in production ([MOBILE-API-G1](../MOBILE-API.md#gaps-and-fixes)).
- No runtime error-log scan was run for the new deployments.
- Genealogy Scan is off in production (its three settings are not configured).
- The earlier acceptance gaps in the [Vercel migration runbook](../VERCEL-MIGRATION.md) are unchanged.

## Related

[MOBILE-API](../MOBILE-API.md) · [GENEALOGY-SCAN](../../apps/app/docs/GENEALOGY-SCAN.md) · [November 20 release](PRODUCTION-RELEASE-2026-11-20.md) · [Vercel migration](../VERCEL-MIGRATION.md)
