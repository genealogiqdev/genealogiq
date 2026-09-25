# Access the production database

Production PostgreSQL is private. Do not expose it publicly, copy its password
to a workstation, print a connection URL, or use a local dump as a substitute
for a live check. Run database work inside the existing Container Apps
environment, which has private network access to PostgreSQL.

## Prerequisites

- Azure CLI is installed and authenticated with an identity authorized for the
  production resource group and Container Apps jobs.
- The active subscription is `Azure subscription 1` with ID
  `c710b26f-e3c7-4a45-9477-eaaf3bdcc329`.
- The manual job `job-genealogiq-migrate-prod` has the direct database URL
  injected from Key Vault as `DATABASE_URL`.

Check the subscription before any job execution:

```powershell
az account show --query "{name:name,id:id,state:state}" --output json
```

## Run a database task

Use [invoke-database-task.ps1](../scripts/azure/invoke-database-task.ps1) to
run an audited local `.cjs` script in the existing job image. The script is
passed as base64 source in that job execution; the database URL remains a
Key Vault reference and is never retrieved by the workstation. Execution
command and inputs apply only to that run and do not replace the saved job
configuration. Pass only non-secret values through `-Environment`.

Start with a read-only preview:

```powershell
$execution = .\scripts\azure\invoke-database-task.ps1 `
  -ScriptPath .\scripts\azure\repair-app-user-tenant.cjs `
  -Environment @{
    REPAIR_EMAIL = 'contatodouglaspedroso@gmail.com'
    REFERENCE_EMAILS = 'douglas@rohling.com.br,gigiotech@gmail.com'
  }
```

Wait for completion, then inspect output only after the execution succeeds:

```powershell
$deadline = (Get-Date).AddMinutes(5)
do {
  Start-Sleep -Seconds 5
  $status = az containerapp job execution show `
    --resource-group rg-genealogiq-prod `
    --name job-genealogiq-migrate-prod `
    --job-execution-name $execution `
    --query properties.status --output tsv
  if ($LASTEXITCODE -ne 0) { throw 'Unable to read the job status.' }
} while ($status -in @('Running', 'Processing') -and (Get-Date) -lt $deadline)
if ($status -ne 'Succeeded') { throw "Database job ended with status '$status'. Inspect logs before retrying." }

az containerapp job logs show `
  --resource-group rg-genealogiq-prod `
  --name job-genealogiq-migrate-prod `
  --execution $execution --container job-genealogiq-migrate-prod --tail 100
```

The incident repair script is read-only unless `REPAIR_ASSIGN = 'true'` is
supplied. It derives the destination tenant from the two reference accounts,
requires an active APP_USER target, refuses to move an account already
assigned elsewhere, and verifies the resulting row in the same transaction.
After reviewing the preview, the guarded assignment is:

```powershell
$execution = .\scripts\azure\invoke-database-task.ps1 `
  -ScriptPath .\scripts\azure\repair-app-user-tenant.cjs `
  -Environment @{
    REPAIR_EMAIL = 'contatodouglaspedroso@gmail.com'
    REFERENCE_EMAILS = 'douglas@rohling.com.br,gigiotech@gmail.com'
    REPAIR_ASSIGN = 'true'
  }
```

Wait for a `Succeeded` status and inspect the structured log output. If an
execution fails or times out, inspect its logs before retrying. Do not run
`prisma migrate dev`, `db push`, a baseline script, or a database transfer
against production for account-level data repairs.

## Connection URLs and local development

Runtime apps use the PgBouncer URL (`database-url`) on port 6432. Schema
migrations use the direct URL (`database-url-direct`) on port 5432. Both are
Key Vault references; the Container Apps identity injects the direct URL into
the manual job. Do not retrieve either secret just to run a query.

Local development uses `packages/db/.env` and the local PostgreSQL service in
`compose.yaml`. It is not the production database. Never run local reset,
seed, or `db push` commands against a shared or production URL. See
[`LOCAL-DEVELOPMENT.md`](LOCAL-DEVELOPMENT.md) for the local setup.
