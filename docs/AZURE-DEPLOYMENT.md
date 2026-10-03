# Azure production deployment

Genealogiq runs in the `Azure subscription 1` subscription, resource group
`rg-genealogiq-prod`, in Brazil South.

Agents operating this environment must follow
[`AZURE-AGENT-RUNBOOK.md`](AZURE-AGENT-RUNBOOK.md).

## Deployed platform

- Container Apps environment: `cae-genealogiq-prod`
- Consumer app: `ca-genealogiq-app-prod`
- BMS: `ca-genealogiq-bms-prod`
- Sequoia: `ca-genealogiq-seq-prod`
- Scheduled BMS job: `job-genealogiq-daily-prod` (`0 6 * * *` UTC)
- Manual Prisma job: `job-genealogiq-migrate-prod`
- PostgreSQL 17: `psql-genealogiq-ohqluyie` on a private delegated subnet
- Container Registry: `acrgenohqluyie.azurecr.io`
- Key Vault: `kv-gen-ohqluyie`
- Log Analytics: `log-genealogiq-prod`
- Backup storage: `stgenohqluyie/database-backups`
- Public media storage: `stgenmediaohqluyie/media`
- Private upload staging: `stgenmediaohqluyie/media-staging`
- Private migration state: `stgenmediaohqluyie/media-migration`
- Media identity: `id-genealogiq-media-prod`
- Manual media migration job: `job-gen-media-migrate-prod`

The applications use PostgreSQL's built-in PgBouncer endpoint on port 6432.
Migrations use the direct endpoint on port 5432. Both URLs are held in Key
Vault. New uploads use short-lived, single-object Azure Blob SAS URLs issued by
the applications through the media identity. Blob reads remain anonymous to
preserve public profile and tree behavior; container listing remains private.

## First deployment and infrastructure updates

From a PowerShell prompt authenticated with Azure CLI:

```powershell
./scripts/azure/deploy-foundation.ps1
./scripts/azure/deploy-media-infrastructure.ps1
./scripts/azure/build-images.ps1 -RegistryName acrgenohqluyie
./scripts/azure/deploy-applications.ps1
./scripts/azure/run-migrations.ps1
./scripts/azure/verify-deployment.ps1
```

The scripts never commit or print secret values. Local `.env` values are copied
to Key Vault by `sync-secrets.ps1`. Missing optional integrations stay disabled.
Infrastructure changes must be previewed with `az deployment sub what-if`
before deployment.

## Media migration

The applications accept both legacy Vercel Blob URLs and the configured Azure
media origin during the migration window. New writes go to Azure after the
updated Container Apps revision is deployed.

Run the resumable migration from the private Container Apps job so it can reach
the private PostgreSQL endpoint:

```powershell
./scripts/azure/run-media-migration.ps1
# After copy/verification succeeds and the manifest is reviewed:
./scripts/azure/run-media-migration.ps1 -Rewrite
```

The job inventories every Vercel URL referenced by the database, stores its
manifest in the private `media-migration` container, copies and verifies bytes,
and conditionally rewrites references. Re-running it is safe. Unreferenced
legacy objects are intentionally ignored; historical CV links in already
delivered email cannot be rewritten.

## DNS and managed TLS

The primary domain is `genealogiq.com.br`, managed at Hostinger:

- Consumer app: `https://genealogiq.com.br`
- Consumer alias: `https://www.genealogiq.com.br`
- BMS: `https://bms.genealogiq.com.br`
- Sequoia: `https://sequoia.genealogiq.com.br`

At the initial October 3, 2026 inspection, the three Azure-generated endpoints
passed both live and ready checks; public DNS initially returned NXDOMAIN and
later Hostinger parking records. The user subsequently applied the records
below, and both public resolvers verified all eight routing/ownership records.

The October 3 cutover completed: all four Azure-managed certificates succeeded,
all bindings are `SniEnabled`, and the three latest revisions (`--0000007`)
are ready with the new canonical origins and unchanged images. Every custom
hostname passed live/ready HTTPS checks and redirects plain HTTP to HTTPS.
The `www` alias serves APP; its authentication callbacks use the apex origin.
See the [cutover audit](audits/AZURE-DOMAINS-2026-10-03.md) for separate source,
test, runtime, browser, cleanup and external-integration evidence.
Runtime origins stay unchanged until the DNS-gated HTTPS cutover succeeds.

### Hostinger steps

1. Confirm the domain is active and delegated to the nameservers shown in
   Hostinger. An Azure CLI session cannot complete domain registration or
   change records in the Hostinger account.
2. Open **Domains > DNS > genealogiq.com.br > DNS records** in hPanel. The
   domain management page also exposes these settings as **DNS / Nameservers**.
3. Add or edit the following records, using TTL 300 or the shortest permitted
   TTL. Targets must not include `https://` or a URL path.

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `20.197.202.148` |
| CNAME | `www` | `ca-genealogiq-app-prod.agreeablerock-f63944f9.brazilsouth.azurecontainerapps.io` |
| CNAME | `bms` | `ca-genealogiq-bms-prod.agreeablerock-f63944f9.brazilsouth.azurecontainerapps.io` |
| CNAME | `sequoia` | `ca-genealogiq-seq-prod.agreeablerock-f63944f9.brazilsouth.azurecontainerapps.io` |
| TXT | `asuid` | `6C27310E638888EF45429543AA51C889580BD8F7EB8741C11512BA0C96C235C5` |
| TXT | `asuid.www` | `6C27310E638888EF45429543AA51C889580BD8F7EB8741C11512BA0C96C235C5` |
| TXT | `asuid.bms` | `6C27310E638888EF45429543AA51C889580BD8F7EB8741C11512BA0C96C235C5` |
| TXT | `asuid.sequoia` | `6C27310E638888EF45429543AA51C889580BD8F7EB8741C11512BA0C96C235C5` |

These values were discovered from Azure on October 3, 2026. Regenerate them
with `./scripts/azure/configure-domains.ps1` if the environment is recreated.
Each CNAME must point directly to its generated Container App hostname,
including `www`; do not use an intermediate CNAME or proxy/CDN for managed
certificate issuance and renewal.

4. Replace only conflicting web-routing A/AAAA/CNAME records for these names.
   Preserve unrelated records, especially email MX, SPF, DKIM, and DMARC.
5. If the zone has restrictive CAA records, authorize DigiCert for ordinary
   certificate issuance: CAA name `@`, flag `0`, tag `issue`, value
   `digicert.com`. No Hostinger hosting plan or Hostinger SSL certificate is
   needed to serve these Azure applications.
6. Wait for public DNS propagation; Hostinger advises allowing up to 24 hours.
   Azure owns and renews the managed TLS certificates after validation.

### Azure CLI cutover

After all routing and TXT records resolve publicly:

```powershell
./scripts/azure/configure-domains.ps1 -Apply
```

The command validates every DNS record against public resolvers before any
write, checks the Azure-generated health endpoints, runs a scoped Bicep
what-if, adds missing hostnames, and binds free Azure-managed certificates.
The apex uses HTTP certificate validation; subdomains use CNAME validation.
Only after HTTPS health checks pass on every custom hostname does it update
`APP_URL`, `BMS_URL`, `SEQUOIA_URL`, and the per-app `AUTH_URL`. This creates
new revisions with the existing images; it does not migrate the database,
change secrets, or rebuild browser bundles. Existing hostname bindings stay
in place, and rerunning the command skips already configured bindings and
unchanged runtime origins.
Bindings are rediscovered after certificate waits. The command waits for each
latest revision to become ready; an older revision's HTTP 200 is not accepted
as proof that the new runtime origins are active.

Use `./scripts/azure/configure-domains.ps1 -Preview` for a read-only Azure
what-if before DNS is ready. It writes only an ignored, non-secret local
parameter file; it does not deploy resources or change runtime origins.

`deploy-applications.ps1` reads the active origins and certificate bindings
into a non-secret, ignored Bicep parameter file before application deployments.
This prevents later full deployments from resetting the cutover. The image-only
CI workflow also retains these settings. Direct deployments of
`infra/main.bicep` with `deployApplications=true` must supply the six domain
parameters; their bootstrap defaults intentionally retain the legacy origins.

Azure Blob browser uploads also require the new origins in the media account's
CORS allowlist. `infra/modules/platform.bicep` retains both the four new origins
and legacy/local origins. For an existing platform, the scoped
`infra/custom-domain-media-cors.bicep` deployment accepts the current Blob
service properties with only the origin list extended; preview it first and
preserve retention/versioning settings. The October 3 deployment
`genealogiq-domain-media-cors` succeeded: PUT preflight returned 200 for all
four new origins and 403 for an unrelated origin. No blob was uploaded.

Configuration-only domain changes reuse the existing immutable images and do
not require replaying database migrations; image/schema deployments follow
the normal migration runbook.

Domain orchestration regression checks use
`./scripts/azure/tests/configure-domains.tests.ps1`: read-only discovery,
missing-DNS rejection, health-failure rejection, and successful HTTP/CNAME
certificate binding plus independent canonical URL expectations. This is a
mocked CLI test, not proof of live certificate issuance. It also covers bindings
completed during the wait, idempotent reruns, and rejection when only an older
revision is ready. Tests use a disposable temporary workspace, not the live
ignored Azure preview files.

### External integration checklist

Azure CLI cannot reconfigure these external accounts:

- Add Google OAuth authorized redirect URIs for
  `https://genealogiq.com.br/api/auth/callback/google`,
  `https://bms.genealogiq.com.br/api/auth/callback/google`, and
  `https://sequoia.genealogiq.com.br/api/auth/callback/google`, plus the matching
  authorized JavaScript origins if the OAuth client requires them. Keep legacy
  entries during transition.
- Update existing Stripe webhook endpoints to the appropriate application's
  new `/api/stripe/webhook` URL, without a trailing slash. Avoid duplicate
  endpoints that deliver the same events twice. If an endpoint is recreated,
  update its signing secret in Key Vault.
- Add the new hostnames to Turnstile and other hostname allowlists where used.
  Email-sending domain changes require separate provider verification and
  must not be conflated with the website DNS cutover.
- The consumer marketing portal link in
  `apps/app/src/components/marketing/partner-links.ts` still targets
  `https://sequoia.rip/sign-in`; update it and rebuild/deploy the app before
  retiring that legacy domain. Audit persisted QR/profile URLs and external
  links as well; changing runtime origins does not rewrite existing records.

## Missing optional production credentials

Azure media access uses managed identity and does not require an account key or
Vercel token in production. Other optional integrations still require their own
Key Vault secrets.

## CI/CD

`deploy-azure.yml` uses GitHub OIDC with the user-assigned identity
`id-genealogiq-github-prod`. It can push ACR images and update resources only in
the production resource group. No Azure client secret is used.

The workflow builds immutable SHA-tagged images, runs the private migration job,
updates all three apps and the daily job, and checks live/ready endpoints.
`migrate.yml` is retained as a manual recovery trigger; routine migrations are
serialized inside the deployment workflow.

## Rollback

To roll application images back without reverting database migrations:

```powershell
./scripts/azure/rollback-images.ps1 -ImageTag <known-good-tag>
```

Database changes require a forward fix or a separately tested PITR restore.
The pre-Azure custom-format database dump is retained in the private
`database-backups` container and in the ignored local `.azure` directory.
