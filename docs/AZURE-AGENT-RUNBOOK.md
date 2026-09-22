# Azure deployment and infrastructure runbook for agents

This document is the operating contract for an agent deploying or maintaining
Genealogiq in Azure. Read it together with `docs/AZURE-DEPLOYMENT.md` before
changing code or cloud resources.

## Mission

Maintain three independently deployed Next.js applications:

- `apps/app` → `ca-genealogiq-app-prod`
- `apps/bms` → `ca-genealogiq-bms-prod`
- `apps/seq` → `ca-genealogiq-seq-prod`

All three applications share one PostgreSQL database. Deploy them as separate
images, but never create separate databases or run concurrent migrations from
each application.

## Non-negotiable safety rules

1. Inspect `git status` first. Never reset, discard, overwrite, or commit
   unrelated user changes.
2. Confirm the active Azure subscription before any write:

   ```powershell
   az account show --query "{name:name,id:id,state:state}" --output json
   ```

   Expected subscription ID:
   `c710b26f-e3c7-4a45-9477-eaaf3bdcc329`.
3. Never print, commit, log, or place secrets in Bicep parameter files. Secrets
   belong in `kv-gen-ohqluyie`.
4. Run `what-if` before changing infrastructure.
5. Use immutable image tags. Do not deploy `latest`.
6. Run migrations exactly once through `job-genealogiq-migrate-prod`, before
   updating application revisions.
7. Runtime database traffic uses PgBouncer on port 6432. Prisma migrations use
   the direct endpoint on port 5432.
8. Do not rerun the migration baseline or database transfer procedure against
   an initialized database.
9. Do not change DNS until all Azure live and readiness checks pass.
10. A Container Apps revision rollback does not roll back PostgreSQL. Prefer
    forward-compatible expand/contract migrations.

## Current production resources

- Subscription: `Azure subscription 1`
- Region: `brazilsouth`
- Resource group: `rg-genealogiq-prod`
- Container Apps environment: `cae-genealogiq-prod`
- Registry: `acrgenohqluyie.azurecr.io`
- Key Vault: `kv-gen-ohqluyie`
- PostgreSQL: `psql-genealogiq-ohqluyie`
- Log Analytics: `log-genealogiq-prod`
- Backup storage: `stgenohqluyie/database-backups`
- Daily job: `job-genealogiq-daily-prod`, daily at 06:00 UTC
- Migration job: `job-genealogiq-migrate-prod`, manual
- GitHub deployment identity: `id-genealogiq-github-prod`

Discover live values rather than assuming they are unchanged:

```powershell
az resource list --resource-group rg-genealogiq-prod --output table
az containerapp list --resource-group rg-genealogiq-prod --output table
az containerapp job list --resource-group rg-genealogiq-prod --output table
```

## Source of truth

- Subscription deployment: `infra/main.bicep`
- Platform resources: `infra/modules/platform.bicep`
- Reusable app module: `infra/modules/container-app.bicep`
- Reusable job module: `infra/modules/container-job.bicep`
- Container definitions: `Dockerfile`
- Production deployment workflow: `.github/workflows/deploy-azure.yml`
- Manual migration workflow: `.github/workflows/migrate.yml`
- Operational scripts: `scripts/azure/`

Do not make permanent Azure Portal-only changes. Represent durable
infrastructure changes in Bicep and application delivery changes in the
deployment workflow.

## Mandatory validation before deployment

From the repository root:

```powershell
$env:DATABASE_URL = "postgresql://user:pass@localhost:5432/db"
pnpm db:generate
pnpm typecheck
pnpm test
pnpm lint
pnpm check:migrations
pnpm check:schema-parity
pnpm check:i18n-parity
pnpm check:i18n-keys
az bicep build --file infra/main.bicep
```

Known lint warnings may remain, but errors are not acceptable. Do not run
Prisma generation concurrently from multiple validation commands on Windows;
it can cause a transient `EBUSY` lock.

For container changes, build and test all three targets. At minimum, prove that
`/api/health/live` starts successfully in a Linux container.

## Routine application deployment

The preferred path is the GitHub `Deploy Azure` workflow on `main`. It:

1. Authenticates through GitHub OIDC without a client secret.
2. Builds SHA-tagged APP, BMS, SEQ, migration, and scheduler images.
3. Pushes images to ACR.
4. Updates and executes the private migration job.
5. Updates all application revisions and the daily job.
6. Checks `/api/health/live` and `/api/health/ready`.

For an authorized local deployment:

```powershell
./scripts/azure/preflight.ps1
./scripts/azure/build-images.ps1 -RegistryName acrgenohqluyie
./scripts/azure/deploy-applications.ps1
./scripts/azure/run-migrations.ps1
./scripts/azure/verify-deployment.ps1
```

`deploy-foundation.ps1` is for an initial bootstrap only. Do not use it for a
routine deployment because it generates a new PostgreSQL administrator
password.

The Azure subscription blocks ACR Tasks. Build with local Docker or GitHub
Actions, then push to ACR; do not retry `az acr build`.

## Infrastructure changes

1. Edit Bicep, keeping names and networking compatible unless the task
   explicitly authorizes replacement.
2. Compile:

   ```powershell
   az bicep build --file infra/main.bicep
   ```

3. Use `deploy-applications.ps1` for updates to the existing production stack.
   It reads the current PostgreSQL password from Key Vault, runs `what-if`, and
   applies the subscription deployment.
4. Review replacements carefully. Reject changes that replace PostgreSQL,
   Key Vault, the Container Apps environment, the VNet, or storage unless a
   migration and rollback procedure has been explicitly approved.
5. Verify resources and alerts after deployment:

   ```powershell
   ./scripts/azure/verify-deployment.ps1
   az monitor metrics alert list `
     --resource-group rg-genealogiq-prod `
     --output table
   ```

## Secrets and configuration

Never read secret values merely to inspect configuration. List names instead:

```powershell
az keyvault secret list `
  --vault-name kv-gen-ohqluyie `
  --query "[].name" `
  --output json
```

Use `scripts/azure/sync-secrets.ps1` to copy populated local `.env` values to
Key Vault. Then run `deploy-applications.ps1` so enabled secret references are
attached to the appropriate app.

Required production secrets:

- `database-url`
- `database-url-direct`
- `postgres-admin-password`
- `auth-secret-app`
- `auth-secret-bms`
- `auth-secret-seq`
- `cron-secret`

Integration secrets are optional only when the corresponding feature is
intentionally disabled:

- Google OAuth client ID and secret
- Vercel Blob token
- Resend API key
- Stripe secret and per-app webhook secrets
- VAPID private key and subject
- Turnstile secret

`NEXT_PUBLIC_*` values are build-time configuration. Rebuild images after
changing them; updating a Container App environment variable alone will not
change the browser bundle.

## Database migrations

For every schema change:

1. Confirm a valid migration exists under
   `packages/db/prisma/migrations/`.
2. Run migration and schema guards locally.
3. Ensure the migration is compatible with both old and new app revisions.
4. Build and push the migration image.
5. Run:

   ```powershell
   ./scripts/azure/run-migrations.ps1
   ```

6. Deploy app revisions only after the migration succeeds.

Never run `prisma migrate dev` or `prisma db push` against Azure production.
Never expose the private PostgreSQL server temporarily to simplify a migration.

The initial local database was restored and then baselined with 71 migration
records. That one-time baseline must not be repeated. Azure currently has one
extra table relative to the source because `_prisma_migrations` is now present.

Before destructive or data-changing migrations, verify PITR settings and take
an explicit backup. Keep backup blobs private and remove temporary SAS secrets
and transfer jobs immediately after use.

## DNS and managed certificates

The public zones are hosted by Vercel DNS, not Azure DNS. The Azure CLI cannot
change those records without a separate authenticated Vercel session.

Generate the required records:

```powershell
./scripts/azure/configure-domains.ps1
```

After the records resolve publicly:

```powershell
./scripts/azure/configure-domains.ps1 -Apply
```

This binds:

- `genealogiq.app`
- `bms.genealogiq.app`
- `sequoia.rip`

Do not remove old routing until all managed certificates are ready and HTTPS
health checks pass on the custom domains. Google OAuth and Stripe callback URLs
remain unchanged because the public hostnames remain unchanged.

## Verification and observability

Run:

```powershell
./scripts/azure/verify-deployment.ps1
```

Completion requires:

- All three Container Apps are in `Succeeded`.
- Each app returns HTTP 200 from live and ready endpoints.
- The latest migration execution succeeded.
- The daily job has at least one successful execution.
- PostgreSQL resolves only from the VNet and public access stays disabled.
- Key Vault references have no errors.
- ACR images use immutable tags.
- Azure Monitor alerts remain enabled for PostgreSQL CPU, 5xx responses,
  container restarts, and daily-job failures.

Useful diagnostics:

```powershell
az containerapp logs show `
  --name ca-genealogiq-app-prod `
  --resource-group rg-genealogiq-prod `
  --tail 100

az containerapp job logs show `
  --name job-genealogiq-daily-prod `
  --resource-group rg-genealogiq-prod `
  --execution <execution-name> `
  --tail 100
```

Install the Container Apps CLI extension if job log commands are unavailable:

```powershell
az extension add --name containerapp --upgrade --allow-preview true
```

## Rollback

Find known image tags in ACR, then run:

```powershell
./scripts/azure/rollback-images.ps1 -ImageTag <known-good-tag>
```

This rolls back APP, BMS, SEQ, and the scheduler, then verifies health. It does
not reverse database migrations.

For a failed migration:

1. Stop the deployment.
2. Preserve logs and the failed execution name.
3. Prefer a forward-fix migration.
4. Use PostgreSQL PITR only after explicit approval and impact analysis.
5. Never edit `_prisma_migrations` manually unless the exact Prisma recovery
   procedure has been reviewed.

For a DNS cutover failure, restore the previous Vercel DNS records first; do
not delete healthy Azure revisions.

## Agent handoff format

At completion, report:

- Image tag deployed.
- Azure deployment and migration execution names.
- APP/BMS/SEQ live and ready results.
- Database migration status.
- DNS and certificate status.
- Daily-job status.
- Alerts verified.
- Any missing external credentials or third-party access.
- Exact rollback tag and remaining manual action.

Never claim completion while DNS, certificates, migrations, or readiness checks
are still pending.
