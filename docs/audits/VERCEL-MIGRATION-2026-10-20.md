# Vercel and Neon configuration follow-up — 2026-10-20

## Scope and source

Continued the approved migration on main at `d41ef02` after the user reported a Vercel upgrade and an existing Neon integration. The working tree was clean and no application source had changed since that revision. This change updates cloud configuration and its runbooks; the adapter, migrations, app code and schema are unchanged.

A fresh fetch showed `origin/main` at `6828b4dcc6630a65db670dae8653579f3c658dc9`, five commits behind local main and with no remote-only commits. GitHub authentication worked through its existing keyring. The existing `.github/workflows/deploy-azure.yml` runs on pushes to main, so no push or Git connection was made. Vercel CLI 64.5.0 reported logged out; the authenticated Vercel connector and Chrome provided the cloud evidence below.

## Cloud changes and independent verification

Added nine non-secret environment keys to each of `genealogiq-app`, `genealogiq-bms`, and `genealogiq-seq`: shared final `APP_URL`, `BMS_URL`, `SEQUOIA_URL`; per-app `AUTH_URL`; `AUTH_TRUST_HOST=true`; `DATABASE_POOL_MAX=5`; `MEDIA_STORAGE_PROVIDER=vercel`; and the same configured public Blob origin in `MEDIA_PUBLIC_BASE_URL` and `NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL`.

Subsequent environment API reads verified the exact intended values and production-only scope for all 27 entries. Existing public/private Blob read-write tokens remained sensitive and production-only in all three projects. Chrome independently displayed APP's saved production settings; screenshot: `.local-qa/vercel-production-config-20261020.png`. No secret values were printed or committed. No application runtime receives these settings until a deployment is created.

The environment inventory still lacks the three `AUTH_SECRET` values, BMS `CRON_SECRET`, database connections and external provider keys. Provider setup is incomplete; missing optional settings must not be counted as a successful enabled production integration.

## Neon and account state

The Vercel Marketplace Neon integration exists as `icfg_IJBd5OCN9p9CUJcv8ki5E6FR`. Its available resource `neon-copper-nest` is store `store_JYKKhOoGN8sq5En5`, external project `icy-credit-38971700`, with region metadata `gru1` and plan `free_v3`. The integration/resource inspection reported zero connected projects. Only credential names and metadata were inspected; no database credential values were disclosed.

Chrome's data editor loaded the database and displayed zero rows for the initial `neon_auth.account` table. Its table selector listed nine `neon_auth` starter tables, without Genealogiq application tables. This is evidence of the prepared target, not a restored source or working app connection. The existing NextAuth application remains unchanged.

Prepared the APP connection in Chrome for production only, sensitive credentials, default variable names, and no automatic database branch per deployment. The final access grant awaits the user's confirmation for all three apps. The browser confirmation policy requires confirmation when granting an app access to database credentials; the earlier Blob approval covered only the Blob stores. The pending form is preserved; screenshot: `.local-qa/neon-connect-approval-20261020.png`.

Neon Free's documented 1 GB and 100 CU-hour monthly allowance can support preparation, subject to actual usage. Its restore window of up to six hours or 1 GB of changes does not satisfy the previously agreed 14 days. No recovery waiver or paid Neon upgrade was performed. Production size, retention configuration and restore rehearsal remain unverified.

The user reported Vercel is paid, but a fresh Genealogiq Brasil Billing page showed Hobby Plan — Active, and the Git deployment context API independently returned `plan: hobby` for `team_Gf1VYIPsIC1eAywxB0mhGhkg`. Clarification of the upgraded team/account is pending. No purchase or billing change was made.

## Source availability and runtime limits

Live Azure ARM reported subscription `c710b26f-e3c7-4a45-9477-eaaf3bdcc329` as Disabled. A direct read of the existing `database-backups` container in `stgenohqluyie`, using the existing Azure login, failed with AccountIsDisabled. This is a storage-account availability failure; changing the app database password or exposing its private network would not recover this backup path.

No current source backup or media export was available. The September 21 pre-Azure dump was not restored. No production database/media mutation, deployment, Git push, DNS change or provider callback change occurred. Azure remains authoritative. APP project inspection reported no live deployment.

Real-provider upload/download, anonymous private-object denial, authenticated PDF delivery, restored-schema/row checks, tenant and role isolation, persistence, cron/Stripe, OAuth/Turnstile/email and point-in-time restore remain n/a until their prerequisites are available.

## Checks and cleanup

Source/configuration reads and the live cloud checks above were performed this session. `node scripts/check-docs.mjs` passed: four guides, 40 indexed features, 2,642 local links and 161 named source references. `git diff --check` passed. The October 19 [audit](VERCEL-MIGRATION-2026-10-19.md) remains the source for the completed local three-app baseline, 1,404 passing tests, focused regressions, builds and Azurite evidence; those results were not rerun or relabeled as current Neon/Vercel runtime tests. No application source changed after that baseline.

No local product servers or Docker services were started by this follow-up. The CLI check exited. Chrome retains the database connection form and billing page for the pending user actions; disposable inspection tabs may close normally. Existing local volumes, QA artifacts and credentials are preserved.

## Next operation

Follow [VERCEL-MIGRATION](../VERCEL-MIGRATION.md): complete the pending database access confirmation and verify its production scope; resolve the actual Vercel plan and Neon recovery requirement; recover a current source backup/media export; configure secrets; then rehearse restore, media copy/rollback and provider checks before deployment and the manual Hostinger cutover.
