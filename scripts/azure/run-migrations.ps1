[CmdletBinding()]
param(
  [string]$ResourceGroup = "rg-genealogiq-prod",
  [string]$JobName = "job-genealogiq-migrate-prod",
  [int]$TimeoutMinutes = 30
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$execution = (
  az containerapp job start `
    --name $JobName `
    --resource-group $ResourceGroup `
    --query name `
    --output tsv
).Trim()
if ($LASTEXITCODE -ne 0) { throw "Unable to start the migration job." }

$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
do {
  $status = (
    az containerapp job execution show `
      --name $JobName `
      --resource-group $ResourceGroup `
      --job-execution-name $execution `
      --query properties.status `
      --output tsv
  ).Trim()
  if ($status -eq "Succeeded") {
    Write-Host "Migration execution $execution succeeded."
    return
  }
  if ($status -in @("Failed", "Stopped")) {
    az containerapp job logs show `
      --name $JobName `
      --resource-group $ResourceGroup `
      --execution $execution `
      --tail 100
    throw "Migration execution $execution ended with status $status."
  }
  Start-Sleep -Seconds 10
} while ((Get-Date) -lt $deadline)

throw "Migration execution $execution did not finish within $TimeoutMinutes minutes."
