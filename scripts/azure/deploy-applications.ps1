[CmdletBinding()]
param(
  [string]$Location = "brazilsouth",
  [string]$ImageTag = "",
  [switch]$IncludeTransferJob
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path ".azure/outputs.json")) {
  throw "Run scripts/azure/deploy-foundation.ps1 first."
}
if (-not (Test-Path ".azure/enabled-secrets.json")) {
  throw "Run scripts/azure/sync-secrets.ps1 first."
}
if ([string]::IsNullOrWhiteSpace($ImageTag)) {
  if (-not (Test-Path ".azure/image-tag.txt")) {
    throw "Run scripts/azure/build-images.ps1 first or provide -ImageTag."
  }
  $ImageTag = (Get-Content ".azure/image-tag.txt" -Raw).Trim()
}

$outputs = Get-Content ".azure/outputs.json" -Raw | ConvertFrom-Json
$vaultName = $outputs.keyVaultName.value
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

$deployerPrincipalId = (
  az ad signed-in-user show --query id --output tsv
).Trim()
if ($LASTEXITCODE -ne 0) { throw "Unable to resolve the signed-in user's object ID." }

$deploymentName = "genealogiq-apps-$(Get-Date -Format 'yyyyMMddHHmmss')"
$deployTransfer = if ($IncludeTransferJob) { "true" } else { "false" }
$transferImageTag = if (Test-Path ".azure/transfer-image-tag.txt") {
  (Get-Content ".azure/transfer-image-tag.txt" -Raw).Trim()
} else {
  $ImageTag
}

$parameters = @(
  "location=$Location",
  "environmentName=prod",
  "deployApplications=true",
  "deployTransferJob=$deployTransfer",
  "imageTag=$ImageTag",
  "transferImageTag=$transferImageTag",
  "postgresAdminPassword=$postgresPassword",
  "deployerPrincipalId=$deployerPrincipalId",
  "alertEmail=genealogiq@hotmail.com",
  "enabledSecretNames=@.azure/enabled-secrets.json"
)

Write-Host "Previewing the application deployment..."
az deployment sub what-if `
  --name $deploymentName `
  --location $Location `
  --template-file "infra/main.bicep" `
  --parameters $parameters
if ($LASTEXITCODE -ne 0) { throw "Application deployment what-if failed." }

Write-Host "Deploying Container Apps and jobs..."
$deploymentJson = az deployment sub create `
  --name $deploymentName `
  --location $Location `
  --template-file "infra/main.bicep" `
  --parameters $parameters `
  --output json
if ($LASTEXITCODE -ne 0) { throw "Application deployment failed." }
$deployment = $deploymentJson | ConvertFrom-Json
$deployment.properties.outputs |
  ConvertTo-Json -Depth 8 |
  Set-Content ".azure/outputs.json" -Encoding UTF8

Write-Host "Application deployment completed with image tag $ImageTag."
