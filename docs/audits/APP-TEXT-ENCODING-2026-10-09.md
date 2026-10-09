# APP confirmed-name recovery — 2026-10-09

## Outcome

The newly reported first-name field was deliberately excluded from the
[2026-10-07 repair](APP-TEXT-ENCODING-2026-10-07.md). Its family-name accent was
already repaired. The user now supplied the exact given-name spelling, allowing
one additional reviewed field update. Production PostgreSQL matches all 72
expected audit values: 68 approved changes and four unchanged fields, with zero
mismatches. Six fields still contain unknown characters (four untouched values
and two partially restored biographies); DATABASE-G2 remains open.

## Source and deployment evidence

Work remained on main at e80c449. At the initial source check, the repair
command, private database runner, profile query and banner had no intervening
changes since the prior a52d35e audit. Concurrent pet/QR work subsequently touched
the profile page/banner; it is excluded from this data-repair change.
AppUser.firstName/lastName map to app_users.first_name/last_name; the
profile renders those stored values. User spelling confirmation applies only to
the first-name field; no display-time replacement was introduced.

Azure reported ca-genealogiq-app-prod--0000011 as both latest and ready, with
100% traffic and image tag 8422e6cacd3af9d7aeb151afdd3259e6ad6e887d. This data
repair required no application deployment, migration or image change. An image
rollout would not infer a missing original name from stored question marks.

## Production runtime evidence

The user-confirmed, one-field manifest has SHA-256:

    f33b05073ea72a00a652233c9bcca4b72e7f96e0c65402eb86ffcf33305f7454

The existing private job ran the unchanged repair command with apply enabled.
Execution job-genealogiq-migrate-prod-ey5pqai succeeded on 2026-10-09 at
10:24:22 America/Sao_Paulo (13:24:22Z). Its receipt reports one updated field.
The full current value had to match the reviewed before-value; the only update
columns were first_name and updated_at. The manifest and successful receipt
remain under ignored .local-qa with the accent-paulo-20261009 naming variants;
the raw personal values are not committed.

Independent READ ONLY verification, without calling repairText, used the
original audit expectations plus this one confirmed spelling. Execution
job-genealogiq-migrate-prod-vd9lng8 succeeded at 10:25:54 America/Sao_Paulo
(13:25:54Z): 72 fields checked, zero mismatches, all 67 prior changes still
matching, the additional name matching, four excluded fields unchanged and six
remaining fields with unresolved text. The result and both execution IDs are
retained privately. No credentials were retrieved from Key Vault or printed.

## Tests, UI limits and cleanup

- `node --test scripts/azure/tests/repair-app-text.test.cjs`: 12 passed, including
  strict UTF-8 input, preserved intact text, stale/missing targets, atomic
  rollback, idempotence and receipt-scoped undo. No implementation changed.
- The local APP launcher was attempted on port 3600 but refused to start because
  PostgreSQL was unavailable. `pnpm db:up` failed with access denied to the
  Docker Desktop Linux engine pipe. Local product UI and local persistence
  retest are n/a; the remaining scenario is public name reload and anonymous
  edit rejection once that existing service is accessible.
- Production browser verification was attempted twice, including one documented
  session reset. The browser tool failed before tab creation because its kernel
  assets path was unavailable. No new production screenshot or visual pass is
  claimed. The exact corrected value is confirmed independently in PostgreSQL.
- Both private jobs completed. No local server, fixture or new browser tab was
  created, and no shared service or access permission was changed.
- Documentation validation passed (four guides, 40 features, 2,408 local links
  and 161 named references), as did git diff --check.

## Related

[Profile contract](../../apps/app/docs/PUBLIC-PROFILES.md) ·
[Recovery runbook](../DATABASE.md#recover-damaged-app-text) ·
[Initial application](APP-TEXT-ENCODING-2026-10-07.md#approved-production-application)
