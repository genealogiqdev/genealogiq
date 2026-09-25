[CmdletBinding()]
param(
  [switch]$Copy,
  [switch]$Rewrite,
  [switch]$Verify,
  [switch]$All,
  [string]$Manifest = ".azure/media-migration-manifest.json"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path ".azure/outputs.json")) {
  throw "Azure deployment outputs are missing. Deploy the media infrastructure first."
}

$outputs = Get-Content ".azure/outputs.json" -Raw | ConvertFrom-Json
$accountName = $outputs.mediaStorageAccountName.value
$containerName = $outputs.mediaContainerName.value
$stagingContainerName = $outputs.mediaStagingContainerName.value
$migrationContainerName = $outputs.mediaMigrationContainerName.value
$publicBaseUrl = $outputs.mediaPublicBaseUrl.value

if (
  [string]::IsNullOrWhiteSpace($accountName) -or
  [string]::IsNullOrWhiteSpace($containerName) -or
  [string]::IsNullOrWhiteSpace($publicBaseUrl)
) {
  throw "The current Azure outputs do not include media storage."
}

$env:AZURE_STORAGE_ACCOUNT_NAME = $accountName
$env:AZURE_STORAGE_ACCOUNT_URL = "https://$accountName.blob.core.windows.net"
$env:AZURE_STORAGE_MEDIA_CONTAINER = $containerName
$env:AZURE_STORAGE_STAGING_CONTAINER = $stagingContainerName
$env:AZURE_STORAGE_MIGRATION_CONTAINER = $migrationContainerName
$env:MEDIA_PUBLIC_BASE_URL = $publicBaseUrl

$arguments = @("--manifest=$Manifest")
if ($Copy) { $arguments += "--copy" }
if ($Rewrite) { $arguments += "--rewrite" }
if ($Verify) { $arguments += "--verify" }
if ($All) { $arguments += "--all" }

pnpm --filter @genealogiq/services migrate:media -- @arguments
if ($LASTEXITCODE -ne 0) {
  throw "Media migration failed. Inspect $Manifest before retrying."
}
