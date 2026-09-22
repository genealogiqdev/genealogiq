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

Write-Host "Azure deployment verification passed."
