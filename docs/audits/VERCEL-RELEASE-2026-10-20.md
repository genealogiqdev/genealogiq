# Vercel release — 2026-10-20

## Authorization and source

After the public domain showed DEPLOYMENT_NOT_FOUND, the user explicitly authorized using the existing local BMS credentials and promoting the release. This supersedes the earlier hold on promotion while acceptance remained incomplete; it does not establish that outstanding provider, recovery-retention or authenticated scenarios have passed. Work remains on main, starting at documentation commit `d79e363`. Application source is unchanged from the staged release at `56f72f4602f1d396aa6200955500852a7d7ed3d1`.

## Resend correction and configuration

The earlier GET /domains returned 401 with `restricted_api_key`: the key is restricted to sending email, not invalid. A recipient-free POST /emails with an empty object returned 422 `missing_required_field` (missing to), establishing accepted authentication without sending mail. The earlier invalid-key conclusion and replacement-key request were incorrect. No new Resend credential is needed for the configured sending scope; actual sender acceptance and inbox receipt remain separate.

Copied the existing BMS RESEND_API_KEY directly from process memory through authenticated Vercel CLI stdin into all three Production environments as Secret variables. Also configured BMS STRIPE_WEBHOOK_SECRET from its own local .env under the user's authorization. Independent Vercel metadata reads verified all four additions. Values were never printed, passed as command arguments, or committed. The validated live Stripe account key was already present in all three environments.

APP's local webhook value is identical to BMS's, and its local Stripe API key is not a usable live-prefixed key. The duplicate signing value was not assigned to APP's separate Stripe endpoint. SEQ has no local webhook secret; its historical canonical secret was stored only in the now-inaccessible Azure Key Vault. APP/SEQ signing keys remain unconfigured, and the local BMS secret's match to its actual Stripe endpoint remains unverified. Do not infer working billing from a successful release or from a signature generated with the same local test key.

## Rebuild and promotion

Requested remote Production rebuilds from the previously uploaded, reviewed deployment sources, using current project environments. No local application build, source upload, Git push, database restore, migration replay or media rewrite occurred. The earlier staged releases remain available as code rollback candidates, but lack the newly configured provider values.

| App | New deployment | Source deployment |
| --- | --- | --- |
| APP | `dpl_D94wKR658w56r3hWNEbGADFVBk6k` | `dpl_Caw8DWffJC45sg3Cx63eKTVQd43F` |
| BMS | `dpl_ABpnSpvr2HGjVbSydCW24A6ztHbb` | `dpl_142AhTRYqBAyBdsBeeUokkVvEzH2` |
| SEQ | `dpl_3aDnMopsVRH7Unw9r9vjdM7jUJyH` | `dpl_3u7FGCckB1nEY3C3MjNZoATy4Xh6` |

All three remote rebuilds reached READY. Vercel assigned the canonical domains automatically as these authorized Production rebuilds completed; no extra promote call was needed. The deployment API independently confirmed APP aliases genealogiq.com.br/www.genealogiq.com.br, BMS bms.genealogiq.com.br and SEQ sequoia.genealogiq.com.br. Project regions metadata remains gru1. These releases preserve the reviewed source and include the new environment values. API buildingAt-to-ready durations were approximately 102 seconds for APP, 88 seconds for BMS and 87 seconds for SEQ, excluding SEQ's queue time; framework is Next.js.

| Public check | Result |
| --- | --- |
| https://genealogiq.com.br/ | 200 over validated TLS; homepage visible in Chrome |
| https://www.genealogiq.com.br/ | 200 over validated TLS |
| https://bms.genealogiq.com.br/ | 200 over validated TLS; Chrome routes to sign-in |
| https://sequoia.genealogiq.com.br/ | 200 over validated TLS after build completion; Chrome routes to sign-in |
| /api/health/ready on APP, BMS and SEQ | All 200 with status ready, using actual Neon connections |
| APP anonymous document file route | 401 |
| BMS unsigned daily cron | 401; authorized job was not manually run |
| BMS webhook signed irrelevant account.updated event | 200, received=true; no payment/email/database effect |
| BMS webhook invalid signature | 400, Invalid signature |

The BMS signature test uses its configured local key; it does not prove that Stripe's endpoint uses the same value. APP and SEQ cannot verify signed Stripe webhook requests until their actual endpoint secrets are configured. Public release availability must not be described as completed payment acceptance.

Chrome blank sign-in submissions displayed Invalid data on APP/SEQ and Dados inválidos on BMS. No account credentials were guessed, no successful app sign-in is claimed, and no account or business record was created. Dismissed the optional APP installation prompt and declined nonessential SEQ cookies. The now-unneeded empty Resend replacement draft was dismissed without saving a new credential. Public app tabs remain open for review. Ignored screenshots: `.local-qa/vercel-live-app-20261020.png`, `.local-qa/vercel-live-bms-20261020.png`, `.local-qa/vercel-live-seq-20261020.png`.

### Runtime log scan

Queried each new deployment's error/fatal logs over the preceding 30 minutes, ending approximately 23:41 UTC, limit 100 per app; every response reported hasMore=false. APP returned five pg SSL-compatibility warnings. BMS returned six such warnings, the deliberately invalid webhook signature, and nine Auth.js lines for three JWTSessionError groups (no matching decryption secret), consistent with pre-migration browser cookies after auth-secret replacement. Chrome reached sign-in; users must sign in again. SEQ returned five SSL warnings and one database connection timeout; subsequent root, readiness and Chrome checks passed. A single recovered timeout is not proof of its root cause or long-term stability. No continuous monitoring or log-drain configuration was added.

## Local cleanup and validation limits

The C: drive reached zero free bytes during provider setup. Cloud writes succeeded; writing the local receipt failed. Independent API reconciliation confirmed the settings rather than repeating mutations. Removed only the generated 8,403,458-byte `.local-qa/vercel-release-56f72f4.zip`, whose source is recoverable from Git and remains extracted in the three release folders. This recovered about 8 MB; it is not a general disk cleanup. A subsequent removal request for only the three generated duplicate apps source directories was rejected by automatic approval review with blocked by policy; those directories remain. The earlier policy-blocked credential-file cleanup was not retried. Existing database backups, media manifest and other sessions' files remain intact.

No local app server or Docker container was started. Full-suite and local baseline evidence remains historical because application source did not change. Runtime checks below are limited to the named deployed scenarios; successful recovered-account sign-in, tenant/role persistence, real payment settlement, actual email delivery, enabled OAuth/Turnstile/push and the 14-day recovery/restore goal remain unverified. The three retained partner test allowances and legacy public document source access remain follow-up items from the [recovery audit](NEON-RECOVERY-2026-10-20.md).

Documentation validation passed: four guides, 40 indexed features, 2,663 local links and 161 source references; git diff --check passed. To preserve files while recovering disk space after deletion was blocked, applied native NTFS compression to the three disposable duplicate apps source directories. Their contents remain intact.
