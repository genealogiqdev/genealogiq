[CmdletBinding()]
param(
  [string]$ResourceGroup = "rg-genealogiq-prod"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$apps = @(
  "ca-genealogiq-app-prod",
  "ca-genealogiq-bms-prod",
  "ca-genealogiq-seq-prod"
)

foreach ($app in $apps) {
  $details = az containerapp show `
    --name $app `
    --resource-group $ResourceGroup `
    --output json | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw "Unable to inspect $app." }

  $fqdn = $details.properties.configuration.ingress.fqdn
  foreach ($path in @("/api/health/live", "/api/health/ready")) {
    $status = curl.exe `
      --silent `
      --show-error `
      --output NUL `
      --write-out "%{http_code}" `
      --max-time 30 `
      "https://$fqdn$path"
    if ($status -ne "200") { throw "$app$path returned HTTP $status." }
  }
  Write-Host "$app is live and database-ready at https://$fqdn"
}

$failedJobs = az containerapp job execution list `
  --name job-genealogiq-migrate-prod `
  --resource-group $ResourceGroup `
  --query "[?properties.status=='Failed'].name" `
  --output tsv
if ($LASTEXITCODE -ne 0) { throw "Unable to inspect migration job executions." }
if ($failedJobs) {
  Write-Warning "Historical failed job executions exist; inspect them before cleanup."
}

$outputs = Get-Content ".azure/outputs.json" -Raw | ConvertFrom-Json
$mediaAccount = $outputs.mediaStorageAccountName.value
$mediaContainer = $outputs.mediaContainerName.value
$mediaAccountState = az storage account show `
  --name $mediaAccount `
  --resource-group $ResourceGroup `
  --query "{httpsOnly:enableHttpsTrafficOnly,minTls:minimumTlsVersion,publicBlob:allowBlobPublicAccess,sharedKey:allowSharedKeyAccess}" `
  --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "Unable to inspect media storage account." }
if (
  -not $mediaAccountState.httpsOnly -or
  $mediaAccountState.minTls -ne "TLS1_2" -or
  -not $mediaAccountState.publicBlob -or
  $mediaAccountState.sharedKey
) {
  throw "Media storage security settings do not match the deployment contract."
}

$publicAccess = az storage container show `
  --account-name $mediaAccount `
  --name $mediaContainer `
  --auth-mode login `
  --query properties.publicAccess `
  --output tsv
if ($LASTEXITCODE -ne 0 -or $publicAccess -ne "blob") {
  throw "Media container is not configured for blob-only public reads."
}

az containerapp job show `
  --name job-gen-media-migrate-prod `
  --resource-group $ResourceGroup `
  --output none
if ($LASTEXITCODE -ne 0) { throw "Unable to inspect the media migration job." }

Write-Host "Azure deployment verification passed."
