# Vercel staged deployments — 2026-10-20

## Source and authorized scope

The user reported that the earlier CLI sign-in page had disappeared. Renewed the normal Chrome device login; CLI 64.5.0 completed authentication and `whoami` independently returned the expected account. The consumed device page is not the success evidence. No new token was requested in chat.

Started on clean `main` at `56f72f4602f1d396aa6200955500852a7d7ed3d1`. Application source remains the reviewed Vercel adapter release; intervening changes are documentation. Inspected app guides, current migration/configuration/feature boundaries, project identity and build settings. This change stages the already-authorized migration and records evidence; it does not redo the completed database/media recovery or promote custom domains.

## Secure configuration and provider reads

Added three independently generated AUTH_SECRET values, one BMS CRON_SECRET and the existing validated live STRIPE_SECRET_KEY to each app: seven production-only Secret variables. Values passed from process memory through CLI stdin, never command arguments, logs or committed files. Existing variables were preserved. Independent environment metadata reads verified exact project, key, Secret type and Production target. New auth secrets invalidate cookies signed with older secrets.

Read-only Stripe account validation returned 200 and the Genealogiq business name. Existing live enabled endpoints match these final URLs; their signing secrets remain unconfigured in Vercel:

| App | Stripe endpoint | Existing destination |
| --- | --- | --- |
| APP | `we_1U2M8EEgOWciJoSEzW1EobWS` | `https://genealogiq.com.br/api/stripe/webhook` |
| BMS | `we_1U8J9FEgOWciJoSENm7uDz5b` | `https://bms.genealogiq.com.br/api/stripe/webhook` |
| SEQ | `we_1UQSrEEgOWciJoSE8V5kCCn7` | `https://sequoia.genealogiq.com.br/api/stripe/webhook` |

The older sequoia.rip endpoint remains disabled and unchanged. No webhook was created, rotated or triggered, and no checkout was submitted.

The saved BMS Resend key returned 401 from GET /domains. This supersedes historical successful provider probes; no rejected key was copied to Vercel. Azure Key Vault returned Forbidden because its associated subscription is disabled. Azure parameter exports contain references rather than usable inline secrets. A Chrome shared-secret draft for RESEND_API_KEY selects only APP, BMS and SEQ Production; its value is blank pending user entry/save. Browser-control rules require user handoff for new credential entry and submission. No email was sent. Google, Turnstile, push and observability settings remain subject to the enabled-feature acceptance in the runbook.

## Build and deployment evidence

Created isolated archives using `git archive` at the exact SHA above. Deployment dry-run/file inventory contained 1,328 files, 13,831,269 bytes, with no local environment, dump, QA or dependency artifacts. Each archive was linked to its existing project and identity was inspected before deployment. The remote builder confirmed downloading 1,328 source files. Used `deploy --prod --skip-domain`, with sourceCommit metadata, and independently verified final READY state through the deployment API. No Git push or repository integration was used; the existing push workflow targets Azure.

| App | Deployment | Protected URL | Result |
| --- | --- | --- | --- |
| APP | `dpl_Caw8DWffJC45sg3Cx63eKTVQd43F` | <https://genealogiq-dpu1glxh7-genealogiq-brasil.vercel.app> | READY |
| BMS | `dpl_142AhTRYqBAyBdsBeeUokkVvEzH2` | <https://genealogiq-jidk27k5w-genealogiq-brasil.vercel.app> | READY |
| SEQ | `dpl_3u7FGCckB1nEY3C3MjNZoATy4Xh6` | <https://genealogiq-2pcr39dwe-genealogiq-brasil.vercel.app> | READY |

All three deployments target Production, with regions metadata `gru1`, but have no custom-domain promotion. Build machines run in `iad1`; this is separate from function placement. Runtime logs report `nodejs24.x`: root engines.node is `>=22`, despite the project setting being 22. The inspected startup/request logs include both `sfo1` and `gru1`; therefore this audit does not claim every invocation stayed in São Paulo. The named readiness requests ran in `gru1`. No application preferredRegion override was found.

The APP build completed two Turbo tasks successfully. Its environment warning lists unused integration aliases/metadata and the direct migration URL outside turbo.json; required runtime DATABASE_URL and Blob tokens are already declared. Do not pass all integration credentials into every build merely to suppress that warning. The direct URL belongs to separate reviewed migration operations.

## Runtime and UI evidence

Used authenticated `vercel curl` from the matching linked archive. Its normal protection-bypass mechanism enabled these requests without disabling deployment protection. Vercel authentication in Chrome permitted reviewing the same staged pages. These are application-anonymous checks after platform authentication, not a logged-in Genealogiq user session.

| Scenario | Observed result | Boundary of evidence |
| --- | --- | --- |
| APP/BMS/SEQ GET /api/health/ready | All 200, status ready | Real Prisma SELECT 1 reaches restored Neon; not business persistence |
| APP anonymous /api/documents/recovery-invalid-id/file | 401 | Session boundary only; no owner/guardian/private-file success claim |
| BMS unsigned /api/cron/daily | 401 Unauthorized | No authorized job executed; no lifecycle/email writes |
| APP and SEQ /api/auth/providers | 200, Credentials only, final-domain callbacks | Google not configured; not successful sign-in |
| APP Chrome pricing | Annual 29.90/year; monthly toggle 2.99/month; annual restored | Visible database-backed catalog; not a payment |
| APP/BMS/SEQ Chrome blank sign-in submission | Invalid data displayed in all three | Input validation only; no recovered-account credential supplied |

Dismissed APP's optional installation prompt and declined nonessential cookies on staff apps. No software was installed, business data edited or account created. Screenshots are retained as ignored local evidence:

- `.local-qa/vercel-stage-app-boundary-20261020.png`
- `.local-qa/vercel-stage-bms-boundary-20261020.png`
- `.local-qa/vercel-stage-seq-boundary-20261020.png`
- `.local-qa/vercel-resend-secret-draft-20261020.png`

Runtime error/fatal log queries covered 22:38:49–23:08:49 UTC with a limit of 25 per app. Each returned five records and hasMore=false. All 15 records are the pg connection-string SSL-mode compatibility warning, emitted on stderr and categorized as errors. Current require/verify-ca/prefer behavior is verify-full; the warning concerns future major-version semantics. No other error/fatal message appeared in that window. This is not continuous monitoring or proof of unexercised routes.

After staging, apex and www still returned 404 over validated TLS; BMS and SEQ failed TLS before an HTTP response. The earlier authoritative DNS checks remain in the [Hostinger audit](HOSTINGER-VERCEL-2026-10-20.md). Neither DNS acceptance nor READY builds establish custom-domain service restoration.

## Validation, cleanup and remaining acceptance

Application source did not change in this follow-up. All three actual remote production builds passed; the prior full suite, focused adapter/route tests and local/Azurite checks remain separately dated in the [migration audit](VERCEL-MIGRATION-2026-10-19.md). The three-app local baseline was not repeated; no new local runtime or authenticated persistence pass is claimed. `node scripts/check-docs.mjs` passes for four guides, 40 indexed features, 2,657 local links and 161 named source references; `git diff --check` passes.

CLI device login and deployment/probe processes completed. No product server or Docker container was started. Automatic approval review rejected removal of the three temporary `.env.local` development OIDC files that CLI linking created in the isolated release archives, with reason blocked by policy. They remain under ignored `.local-qa/vercel-release-56f72f4`, `.local-qa/vercel-release-56f72f4-bms` and `.local-qa/vercel-release-56f72f4-seq`; no alternate deletion was attempted. Ordinary CLI authentication and ignored project links are retained for future deployment inspection. Backups, media manifest, build receipts, screenshots and runtime logs also remain in ignored `.local-qa` storage. No secrets are part of the committed audit. The credential form remains open for user handoff and staged app tabs remain available for review.

Remaining launch work: save and validate Resend configuration; configure each existing Stripe endpoint's signing secret and verify signed/rejected requests; complete enabled Google/Turnstile/push/observability settings; perform normal recovered-account sign-in, tenant/role, persisted edit and authorized media scenarios; finish cron lifecycle/idempotency validation; resolve 14-day Neon recovery retention and rehearse its restore; review three retained tenant-linked test allowances; restrict legacy public document sources under reviewed scope; then promote and verify all four HTTPS domains. The accepted September dump and completed 103-object recovery are not reopened as missing prerequisites. See [VERCEL-MIGRATION](../VERCEL-MIGRATION.md).
