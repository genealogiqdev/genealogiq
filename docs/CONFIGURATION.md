# Configuration and integration modes

> **Code:** [turbo.json](../turbo.json), [local launcher](../scripts/local-qa.mjs), per-app .env.example and the readers below.
> **Last verified against code:** 2026-10-03 at `6e06634` + documentation/test/launcher changes.

There is no single environment-validation schema. Settings are read at import, request, provider initialization or build time by the listed owner. turbo.json globalEnv controls task environment/cache inputs; it is not a validator. Never copy real .env values into memory, commands, reports or repository files.

## Environment contract

| Name | Default | Reader / validation | Consequence |
| --- | --- | --- | --- |
| DATABASE_URL | required | packages/db/src/index.ts; packages/db/prisma.config.ts | DB import throws when absent; local-qa forces loopback |
| DATABASE_POOL_MAX | 5; invalid/nonpositive falls back to 5 | packages/db/src/index.ts | Per-replica PostgreSQL pool; restart |
| AUTH_SECRET | required in ordinary app configuration | packages/auth/src/node.ts / NextAuth | Ephemeral per app in local-qa; restart invalidates cookies |
| AUTH_URL / AUTH_TRUST_HOST | unset / NextAuth option default; launcher sets origin/true | packages/auth/src/node.ts / edge.ts | Use canonical localhost origin; set production URL explicitly |
| APP_URL / BMS_URL / SEQUOIA_URL | several adapters fall back to http://localhost:3000 | app adapters/actions | Launcher sets 3000/3001/3002; absent staff URLs can send wrong-origin links |
| STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET | absent | packages/services/src/stripe.ts and app webhook routes | Required for actual test checkout/signature verification; destination secrets are distinct |
| RESEND_API_KEY | absent | packages/email/src/index.ts | Lazy transport only initializes on send; use a disposable test recipient |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | absent | packages/auth/src/node.ts googleCredentialsFromEnv | Both needed to register provider; baseline uses Credentials |
| AZURE_STORAGE_CONNECTION_STRING | absent; launcher uses UseDevelopmentStorage=true | packages/services/src/media-storage.ts | Selects connection-string/Azurite mode |
| AZURE_STORAGE_ACCOUNT_NAME / AZURE_STORAGE_ACCOUNT_URL | absent | packages/services/src/media-storage.ts | Production DefaultAzureCredential mode requires account config |
| AZURE_STORAGE_MANAGED_IDENTITY_CLIENT_ID | absent | packages/services/src/media-storage.ts | Optional explicit managed identity selection |
| AZURE_STORAGE_MEDIA_CONTAINER / AZURE_STORAGE_STAGING_CONTAINER / AZURE_STORAGE_MIGRATION_CONTAINER | media / media-staging / media-migration | packages/services/src/media-storage.ts | Public target, private staging, private manifest |
| MEDIA_PUBLIC_BASE_URL | derived from account URL + media container | packages/services/src/media-storage.ts | Validation/public reference base; launcher uses local Azurite |
| NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL | configured public client base | packages/core/src/blob.ts | Baked into client builds; rebuild when changed |
| MEDIA_MIGRATION_MANIFEST_BLOB | manifests/current.json | packages/services/src/media-migration.ts | Durable manifest key; omitted from declared turbo/example env (open gap) |
| CRON_SECRET | absent | apps/bms/src/app/api/cron/daily/route.ts | 500 when missing, 401 wrong bearer; blank in baseline |
| NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT | absent | apps/app/src/lib/push-client.ts / push.ts | Missing key disables push; public key needs rebuild |
| NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY | absent | apps/app/src/lib/turnstile.ts / feedback UI | Missing server secret warns/skips anti-bot verification; public key needs rebuild |
| ENABLE_WIKITREE_SEARCH | enabled unless false in app wrapper | apps/app/src/app/api/wikitree/search/route.ts | Launcher sets false; upstream import remains an integration |
| NEXT_PUBLIC_SENTRY_DSN | absent | per-app Sentry configuration | Disabled capture without DSN; public client changes need rebuild |
| SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN | absent | per-app next.config.ts | Optional build source-map upload; no cloud upload in local baseline |
| NODE_ENV | development in local-qa | Next / APP register-service-worker.tsx | Production worker registration; stop dev before building |
| RUN_AZURITE_TESTS | false unless true | packages/services/src/media-storage.integration.test.ts | Opt-in local integration; skip is not a pass |

## Local, test and deployed modes

| Integration | Baseline mode | Real scenario prerequisite |
| --- | --- | --- |
| PostgreSQL | compose postgres:17-alpine; local-only fixture data | The isolated target database and matching schema |
| Media | Azurite 3.35.0 + local public URL | Azure test account/identity and container permissions for production parity |
| Credentials auth | Normal signed sessions and seeded roles | Each app signs in separately; no bypass/injected sessions |
| Google | Provider keys disabled | Disposable OAuth client/test identity and verified callback origin |
| Stripe | Keys disabled | Test-mode SDK/webhook destination + signed recorded invoice/checkout fixture |
| Resend | Key disabled | Disposable authorized test inbox and recorded error/acceptance response |
| Push | VAPID disabled | Supported browser, test VAPID pair, disposable push endpoint/worker |
| Turnstile | Secret disabled; helper warns/skips | Test key/site verification response fixture |
| WikiTree | API search switch false | Recorded upstream profile/search data or allowed test network |
| Postal lookup/map tiles | External browser requests still possible | ViaCEP/Zippopotam/tiles network or recorded fixtures |
| Sentry | DSN and upload keys disabled | Test project/DSN and authorized source-map upload scope |

The local launcher overlays blank strings in Node child environment variables, preventing Next's .env loading from inheriting real cloud credentials. In PowerShell, assigning an empty string removes a variable in some versions; that is why the launcher owns the explicit child overlay. It does not write .env files. Use http://localhost for browser authentication; mixing 127.0.0.1 and localhost can redirect away from the cookie origin.

The seed supplies one Premium consumer identity and independent BMS/SEQ staff records, a company/tenant, family and pets. It does not create the FREE plan fallback or complete provider fixtures; those limitations have feature gap entries.

## Locale and currency

[packages/i18n/src/config.ts](../packages/i18n/src/config.ts) defines en-US (default), pt-BR and es-MX; the locale cookie selects the language, with initial country BR/MX defaults and English fallback. There is no /[locale] route segment. [packages/core/src/currency.ts](../packages/core/src/currency.ts) returns lowercase usd/brl/mxn from locale; currencyCode provides uppercase display/database values. Currency is selected, not converted at checkout. The manifest is static English because it is fetched without locale cookies.

## Restart and recheck

1. Read the owning reader and turbo.globalEnv when changing a setting. Verify the absence/default path as well as the configured path.
2. Restart the local launcher after server secrets/provider/DB settings change. Sign in again after its ephemeral AUTH_SECRET changes.
3. Rebuild after NEXT_PUBLIC settings change; stop dev servers first so .next is not overwritten while in use.
4. Run the relevant feature tests plus [TESTING](TESTING.md), then a local happy/boundary product scenario. Provider absence must remain n/a, not a delivery/payment/installation pass.

## Gaps and fixes

### CONFIGURATION-G1: Environment readers are not validated by one schema

- **Status:** open
- **Found:** 2026-10-03, repository memory audit.
- **Evidence:** Source reads settings across DB/auth/app/service modules; turbo globalEnv is a list rather than validation. MEDIA_MIGRATION_MANIFEST_BLOB is omitted there.
- **Impact:** Partial provider/origin configuration can fail only during a request or select an unintended default.
- **Root cause:** Environment contracts are distributed across modules.
- **Resolution:** Not fixed. Add narrowly scoped startup validation and maintain this reader inventory; manifest-specific evidence is in [MEDIA-MIGRATION](MEDIA-MIGRATION.md).

## Verification log

| Date | Revision | Scope | Evidence / limits |
| --- | --- | --- | --- |
| 2026-10-03 | 6e06634 + working changes | Source | Readers/defaults, turbo environment and local child overlay checked. |
| 2026-10-03 | Same | Runtime/UI | Credentials/DB and Azurite mode exercised; no payment/mail/OAuth/push/production identity proof. |

## Related

[LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) · [DATABASE](DATABASE.md) · [AUTHENTICATION](AUTHENTICATION.md) · [TESTING](TESTING.md) · [GAPS](GAPS.md)
