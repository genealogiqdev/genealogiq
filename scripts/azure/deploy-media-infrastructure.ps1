[CmdletBinding()]
param(
  [string]$Location = "brazilsouth",
  [switch]$WhatIfOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path ".azure/outputs.json")) {
  throw "Run scripts/azure/deploy-foundation.ps1 first."
}

$currentOutputs = Get-Content ".azure/outputs.json" -Raw | ConvertFrom-Json
$vaultName = $currentOutputs.keyVaultName.value
$postgresPassword = (
  az keyvault secret show `
    --vault-name $vaultName `
    --name "postgres-admin-password" `
    --query value `
    --output tsv
).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($postgresPassword)) {
  throw "Unable to read the PostgreSQL administrator password from Key Vault."
}

$deployerPrincipalId = (az ad signed-in-user show --query id --output tsv).Trim()
if ($LASTEXITCODE -ne 0) { throw "Unable to resolve the signed-in user's object ID." }

$deploymentName = "genealogiq-media-$(Get-Date -Format 'yyyyMMddHHmmss')"
$parameters = @(
  "location=$Location",
  "environmentName=prod",
  "deployApplications=false",
  "postgresAdminPassword=$postgresPassword",
  "deployerPrincipalId=$deployerPrincipalId"
)

Write-Host "Previewing the media infrastructure deployment..."
az deployment sub what-if `
  --name $deploymentName `
  --location $Location `
  --template-file "infra/main.bicep" `
  --parameters $parameters
if ($LASTEXITCODE -ne 0) { throw "Media infrastructure what-if failed." }
if ($WhatIfOnly) {
  Write-Host "Media infrastructure what-if completed; no resources were changed."
  return
}

Write-Host "Deploying media storage and identity..."
$deploymentJson = az deployment sub create `
  --name $deploymentName `
  --location $Location `
  --template-file "infra/main.bicep" `
  --parameters $parameters `
  --output json
if ($LASTEXITCODE -ne 0) { throw "Media infrastructure deployment failed." }

$newOutputs = ($deploymentJson | ConvertFrom-Json).properties.outputs
foreach ($property in $newOutputs.PSObject.Properties) {
  if ($property.Name -like "media*") {
    $currentOutputs | Add-Member `
      -MemberType NoteProperty `
      -Name $property.Name `
      -Value $property.Value `
      -Force
  }
}
$currentOutputs | ConvertTo-Json -Depth 8 | Set-Content ".azure/outputs.json" -Encoding UTF8

Write-Host "Media infrastructure deployment completed."
