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
- Lint: zero errors; existing warnings retained. Initial-release CI passed
  verify plus all three Linux builds/liveness checks. Its enabled Azurite
  case is separate from the nine tests skipped by the local default suite.

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
deployment and cleanup evidence follows.

## Local runtime and UI

Started the three apps through `local-qa.mjs --port-offset=1000
--host=127.0.0.1`, using existing loopback PostgreSQL/Azurite and normal
Credentials logins for the public local fixture.

- APP: header Assinaturas opened the expected Premium/Free page. Rex's
  favorite was removed, restored and reloaded; the database independently
  counted exactly one favorite afterward. Tree zoom, fit and search worked;
  the page displayed seven people, four generations and two pets. Searching
  Rex opened tutors Marina Silva and Local Admin. Normal sign-out followed
  by `/subscriptions` returned to sign-in.
- BMS: changed the company trade name to `Genealogiq Local QA 2026-10-07`,
  saved and reloaded, then restored `Genealogiq Local`. Gen2026 list/review
  rendered all four earlier local receipts, and the unconfirmed incomplete
  form kept Confirmar e liberar disabled. Normal sign-out followed by the
  company URL returned to sign-in.
- SEQ: changed the company trade name to `Local Tenant QA 2026-10-07`,
  saved and reloaded, then restored `Local Tenant`. Normal sign-out followed
  by the company URL returned to sign-in.
- Independent local SQL confirmed both original company values and the
  single Rex favorite. No new coupon settlement was made in this session;
  the earlier [Gen2026 audit](GEN2026-2026-10-07.md) remains the acceptance
  evidence for full settlement, races, rollback and first-access provisioning.
- The corrected local landing showed the canonical destination for all three
  portal CTA locations. Both the displayed BRL 6,000/month and BRL 72,000/year
  at twenty units matched the independent arithmetic.

Initial startup took time to compile and discarded old local cookies because
the launcher uses fresh secrets. Fresh credentials succeeded. These local
JWT/compilation observations are not production login findings.

Stopped the owned launcher and confirmed ports 4000/4001/4002 have no listeners.
Removed only this launcher's generated tsconfig include additions after a
semantic comparison with Git proved there were no other changes. Pre-existing
Docker services/volumes and original assets remain intact. Local screenshot:
[Rex tutors](../../.local-qa/2026-10-07/release/local-tree.png).

## Public production UI and logs

Verified APP sign-in, affiliate estimator and partner photos. One sign-in with
an intentionally nonexistent `example.invalid` account returned the expected
incorrect-email-or-password message. This does not test the reported real
account login failure. Anonymous BMS coupon redemption and SEQ company URLs
redirected to their canonical sign-in screens. No production account, sale or
email was created.

APP browser console had no errors. Direct container tails returned only
connection notices, so they were not counted as clean application evidence.
Log Analytics for revision `0000008` after 17:24 UTC contained APP 26, BMS 14
and SEQ 14 lines, with zero unexpected Error/Exception/FATAL matches; the
expected invalid-credentials category was excluded. This is a bounded log
sample, not proof that every business operation has been exercised.

## Concurrent work boundary

During final verification, the separate chat
`01a11767-e042-7db0-9c17-21d3ae8366bf` began implementing a newly requested BMS
onboarding flow (initial GenCodes and emailed access). It started after this
release inventory and has its own explicit commit/deploy request. Its active
changes to customer actions/forms, onboarding services and email transport
were preserved and excluded from this release. The final working tree must
not be reported as globally clean while that work is in progress.

## Final deployed revision

Final product release: `ddc79a255e2028772186be7aa54269045be2fd69`.

- [CI 37659548234](https://github.com/genealogiqdev/genealogiq/actions/runs/37659548234): success, including verify and all three Linux container checks.
- [Deploy Azure 37659548107](https://github.com/genealogiqdev/genealogiq/actions/runs/37659548107): success, all five image builds, migration, rollout and health checks.
- Follow-up migration execution `job-genealogiq-migrate-prod-vpqhvwo` succeeded; no additional migration source changed after the first rollout.
- APP, BMS and SEQ each reached `ca-genealogiq-<app>-prod--0000009`, Succeeded, on the full final SHA image with latest-revision traffic at 100%.
- Rechecked live and ready on `genealogiq.com.br`, `www.genealogiq.com.br`, `bms.genealogiq.com.br`, and `sequoia.genealogiq.com.br`: all eight returned 200 with normal TLS verification.
- Reloaded the production landing, confirmed the canonical portal href, clicked it and reached `https://sequoia.genealogiq.com.br/sign-in`. [Landing screenshot](../../.local-qa/2026-10-07/release/production-landing.png).
- Daily, migration and media-migration jobs all reference final-SHA images. Log Analytics for revision `0000009` contained fourteen startup lines per app and zero Error/Exception/FATAL matches in the inspected sample.

The final documentation-only evidence commit uses `[skip ci]`; it does not
alter any deployed code or configuration. Product source is the SHA above.
Rollback images are available at `f85ee3721fec33e6dfc0042ccae60d0c2beac8a0`
(all current feature changes, prior portal link). PostgreSQL migration remains
in place on image rollback; do not restore the database for this link change.
The prior mixed-image baseline was APP `0353683`, BMS/SEQ `6e06634`.

Remaining prerequisites are the user-confirmed absence of a signed-in
production test identity, real mail/payment delivery, the unconfirmed original
real-account login report, and the seven uncertain stored-text fields. New
onboarding work belongs to the concurrent chat above. These are not silently
converted to feature passes by a green deployment.
