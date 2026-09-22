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

The applications use PostgreSQL's built-in PgBouncer endpoint on port 6432.
Migrations use the direct endpoint on port 5432. Both URLs are held in Key
Vault. Vercel Blob remains the media store until its client upload and stored
URL flows are deliberately migrated.

## First deployment and infrastructure updates

From a PowerShell prompt authenticated with Azure CLI:

```powershell
./scripts/azure/deploy-foundation.ps1
./scripts/azure/build-images.ps1 -RegistryName acrgenohqluyie
./scripts/azure/deploy-applications.ps1
./scripts/azure/run-migrations.ps1
./scripts/azure/verify-deployment.ps1
```

The scripts never commit or print secret values. Local `.env` values are copied
to Key Vault by `sync-secrets.ps1`. Missing optional integrations stay disabled.
Infrastructure changes must be previewed with `az deployment sub what-if`
before deployment.

## DNS and managed TLS

The public zones currently use Vercel DNS. Add these records there:

```text
genealogiq.app      A      @           20.197.202.148
genealogiq.app      TXT    asuid       6C27310E638888EF45429543AA51C889580BD8F7EB8741C11512BA0C96C235C5
genealogiq.app      CNAME  bms         ca-genealogiq-bms-prod.agreeablerock-f63944f9.brazilsouth.azurecontainerapps.io
genealogiq.app      TXT    asuid.bms   6C27310E638888EF45429543AA51C889580BD8F7EB8741C11512BA0C96C235C5
sequoia.rip         A      @           20.197.202.148
sequoia.rip         TXT    asuid       6C27310E638888EF45429543AA51C889580BD8F7EB8741C11512BA0C96C235C5
```

After public DNS propagation:

```powershell
./scripts/azure/configure-domains.ps1 -Apply
```

The command validates ownership, adds each hostname, and binds an
Azure-managed certificate. The public callback URLs do not change:

- `https://genealogiq.app/api/auth/callback/google`
- `https://bms.genealogiq.app/api/auth/callback/google`
- `https://sequoia.rip/api/auth/callback/google`
- Each application's `/api/stripe/webhook`

## Missing optional production credentials

The local environment supplied database, Auth.js, and APP/BMS Stripe secrets.
It did not contain Google OAuth, Vercel Blob, Resend, VAPID, Turnstile, Sentry,
or a Sequoia Stripe webhook secret. Add these to the appropriate local `.env`,
run `sync-secrets.ps1`, and redeploy before enabling those features.

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
