[CmdletBinding()]
param(
  [string]$ResourceGroup = "rg-genealogiq-prod",
  [string]$JobName = "job-gen-media-migrate-prod",
  [switch]$Rewrite,
  [switch]$Rollback
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if ($Rewrite -and $Rollback) { throw "Choose either -Rewrite or -Rollback." }

$jobArguments = @(
  "--conditions=react-server",
  "--import",
  "tsx",
  "packages/services/src/media-migration.ts",
  "--copy",
  "--verify",
  "--manifest=/tmp/media-migration-manifest.json"
)
if ($Rewrite) {
  $jobArguments += "--rewrite"
}
if ($Rollback) {
  $jobArguments = @(
    "--conditions=react-server",
    "--import",
    "tsx",
    "packages/services/src/media-migration.ts",
    "--rollback",
    "--manifest=/tmp/media-migration-manifest.json"
  )
}

$execution = az containerapp job start `
  --name $JobName `
  --resource-group $ResourceGroup `
  --command "node" `
  --args $jobArguments `
  --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "Unable to start the media migration job." }

Write-Host "Started media migration execution $($execution.name)."
Write-Host "Inspect it with:"
Write-Host "az containerapp job execution show --name $JobName --resource-group $ResourceGroup --job-execution-name $($execution.name)"
