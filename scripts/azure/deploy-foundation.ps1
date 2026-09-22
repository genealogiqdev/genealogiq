[CmdletBinding()]
param(
  [string]$SubscriptionId = "c710b26f-e3c7-4a45-9477-eaaf3bdcc329",
  [string]$Location = "brazilsouth",
  [string]$AlertEmail = "genealogiq@hotmail.com"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

& "$PSScriptRoot/preflight.ps1" -SubscriptionId $SubscriptionId -Location $Location

$deployerPrincipalId = (
  az ad signed-in-user show --query id --output tsv
).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($deployerPrincipalId)) {
  throw "Unable to resolve the signed-in user's Microsoft Entra object ID."
}

$bytes = New-Object byte[] 36
$generator = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $generator.GetBytes($bytes)
} finally {
  $generator.Dispose()
}
$postgresPassword = "Gq!$([Convert]::ToBase64String($bytes).Replace('+', 'A').Replace('/', 'b').TrimEnd('='))9z"
$deploymentName = "genealogiq-foundation-$(Get-Date -Format 'yyyyMMddHHmmss')"

$commonParameters = @(
  "location=$Location",
  "environmentName=prod",
  "deployApplications=false",
  "postgresAdminPassword=$postgresPassword",
  "deployerPrincipalId=$deployerPrincipalId",
  "alertEmail=$AlertEmail"
)

Write-Host "Previewing the Azure foundation deployment..."
az deployment sub what-if `
  --name $deploymentName `
  --location $Location `
  --template-file "infra/main.bicep" `
  --parameters $commonParameters
if ($LASTEXITCODE -ne 0) { throw "Azure deployment what-if failed." }

Write-Host "Provisioning the Azure foundation..."
$deploymentJson = az deployment sub create `
  --name $deploymentName `
  --location $Location `
  --template-file "infra/main.bicep" `
  --parameters $commonParameters `
  --output json
if ($LASTEXITCODE -ne 0) { throw "Azure foundation deployment failed." }
$deployment = $deploymentJson | ConvertFrom-Json
$outputs = $deployment.properties.outputs

$outputDirectory = ".azure"
if (-not (Test-Path $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}
$outputs | ConvertTo-Json -Depth 8 | Set-Content "$outputDirectory/outputs.json" -Encoding UTF8

$vaultName = $outputs.keyVaultName.value
$postgresHost = $outputs.postgresHost.value
$postgresLogin = "genealogiqadmin"
$encodedLogin = [Uri]::EscapeDataString($postgresLogin)
$encodedPassword = [Uri]::EscapeDataString($postgresPassword)
$databaseUrlDirect = "postgresql://${encodedLogin}:${encodedPassword}@${postgresHost}:5432/genealogiq?sslmode=require"
$databaseUrl = "postgresql://${encodedLogin}:${encodedPassword}@${postgresHost}:6432/genealogiq?sslmode=require"

function Set-KeyVaultSecretWithRetry([string]$Name, [string]$Value) {
  for ($attempt = 1; $attempt -le 12; $attempt++) {
    az keyvault secret set `
      --vault-name $vaultName `
      --name $Name `
      --value $Value `
      --output none 2>$null
    if ($LASTEXITCODE -eq 0) { return }
    if ($attempt -eq 12) { throw "Unable to write Key Vault secret '$Name'." }
    Start-Sleep -Seconds 10
  }
}

Write-Host "Storing generated database credentials in Key Vault..."
Set-KeyVaultSecretWithRetry "postgres-admin-password" $postgresPassword
Set-KeyVaultSecretWithRetry "database-url-direct" $databaseUrlDirect
Set-KeyVaultSecretWithRetry "database-url" $databaseUrl

& "$PSScriptRoot/sync-secrets.ps1" -KeyVaultName $vaultName
if ($LASTEXITCODE -ne 0) { throw "Local secret synchronization failed." }

Write-Host "Azure foundation deployment completed. Outputs are in .azure/outputs.json."
