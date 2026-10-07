# Consolidated production release — 2026-10-07

## Source inventory

Reviewed the ten other recent Genealogiq chats returned in the latest fifty
chats. All use the same checkout and `main`; `git worktree list` has no other
checkout. Started at `a52d35e`, six commits ahead of `origin/main` (`218d5aa`).

| Commit | Work |
| --- | --- |
| `9abd13f` | BMS Resend refresh and verification audit |
| `6c67ddf` | APP email-change submit isolation |
| `f3e47b0` | Visible APP subscription navigation |
| `9253152` | Reviewed stored-text recovery tooling and tests |
| `074d7bd` | Manual Gen2026 BMS settlement and canonical migration |
| `a52d35e` | Approved production text recovery receipt/audit |

The original source photos in `assets/` and empty `envs` file predate these
sessions. Optimized landing-page photos are already tracked. The originals
and empty placeholder are preserved outside the release. No unfinished source
diff was found. The login-error chat had no confirmed cause or code fix; a
successful deployment does not resolve that reported incident by itself.

## Delivery repairs

Previous Deploy Azure run `37128877906` failed before building: AADSTS700213,
because GitHub's immutable OIDC subject no longer matched Azure's name-only
subject. The repository API confirmed both IDs. Updated the platform template
and added a scoped repair template. What-if showed only the existing
`github-main` subject changing; deployment `github-oidc-20261007` succeeded.
Roles, issuer and audience remain unchanged.

Previous CI run `37128877946` built all three images but curl exited 56 during
startup. CI now retries resets as well as refusals and emits container logs.
Private workstation files are excluded from Docker contexts.

## Tests

- Prisma generated once; typecheck passed for all eleven tasks.
- Full suite: 106 files / 906 tests passed; nine opt-in tests skipped.
- Text recovery: twelve standalone Node tests passed.
- Migration structure: 75 migrations; single schema and locale parity passed.
- Locale references: zero errors, 83 dynamic calls and one unmapped file.
- Bicep main and scoped OIDC templates compiled successfully.
- Further lint, CI, runtime and UI evidence is appended below when complete.

## Production preflight

Confirmed subscription `c710b26f-e3c7-4a45-9477-eaaf3bdcc329`. APP initially
ran `035368388fa3b6a9f2982ce5fec767061ba8c251`. Read-only database execution
`job-genealogiq-migrate-prod-1jx6kzh` succeeded: the manual-coupon schema and
Gen2026 coupon were absent, so the insert will not overwrite an existing code.
Existing migrations were completed, with one historical rolled-back attempt
followed by its successful retry. PostgreSQL is private with public access
disabled and fourteen-day point-in-time recovery.

## Verification limits

The user confirmed there is no production test account or authenticated
session. Signed-in production feature acceptance, real email delivery and
real payment/provider replay remain unverified. Use isolated local fixtures
for protected-flow checks and report production HTTP/database/log evidence
separately. The seven uncertain stored-text fields remain as documented in
the [text audit](APP-TEXT-ENCODING-2026-10-07.md).

## Deployment and final verification

The initial release `f85ee3721fec33e6dfc0042ccae60d0c2beac8a0` passed
[CI](https://github.com/genealogiqdev/genealogiq/actions/runs/37658275770)
and [Deploy Azure](https://github.com/genealogiqdev/genealogiq/actions/runs/37658275852).
All five images built; APP/BMS/SEQ reached revision `0000008` with 100% traffic.
Migration execution `job-genealogiq-migrate-prod-5rng5dy` succeeded before
rollout. Customer-initiated backup `pre-release-20261007` completed at
17:20:05 UTC before that migration.

Read-only execution `job-genealogiq-migrate-prod-1qk39gg` verified the completed
manual-coupon migration and exactly one active manual Gen2026 coupon: 100%,
once, no Stripe IDs, zero production redemptions. No test sale was created.

All four custom hostnames returned 200 for live, ready and sign-in; the Azure
verification script passed all three generated hostnames and media settings.
All eight alerts remain enabled. The October 7 06:00 UTC daily execution
succeeded, and its scheduler image was updated to the release SHA. Its next
scheduled execution is distinct from testing business effects now.

The final public landing inspection exposed a legacy hardcoded portal link
to `sequoia.rip` in `partner-links.ts`. A follow-up release corrects the shared
header/closing/footer link to `sequoia.genealogiq.com.br/sign-in`. This was
listed as remaining work in the domain cutover audit. Final follow-up
deployment and cleanup evidence will be appended below.
