[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ImageTag,
  [string]$ResourceGroup = "rg-genealogiq-prod",
  [string]$RegistryServer = "acrgenohqluyie.azurecr.io"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$deployments = @(
  @{ app = "ca-genealogiq-app-prod"; repository = "genealogiq-app" },
  @{ app = "ca-genealogiq-bms-prod"; repository = "genealogiq-bms" },
  @{ app = "ca-genealogiq-seq-prod"; repository = "genealogiq-seq" }
)

foreach ($deployment in $deployments) {
  az containerapp update `
    --name $deployment.app `
    --resource-group $ResourceGroup `
    --image "$RegistryServer/$($deployment.repository):$ImageTag" `
    --output none
  if ($LASTEXITCODE -ne 0) { throw "Rollback failed for $($deployment.app)." }
}

az containerapp job update `
  --name job-genealogiq-daily-prod `
  --resource-group $ResourceGroup `
  --image "$RegistryServer/genealogiq-scheduler:$ImageTag" `
  --output none
if ($LASTEXITCODE -ne 0) { throw "Scheduled-job rollback failed." }

& "$PSScriptRoot/verify-deployment.ps1" -ResourceGroup $ResourceGroup
Write-Host "Application images rolled back to $ImageTag. Database migrations were not reverted."
