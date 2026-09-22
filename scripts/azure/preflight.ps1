[CmdletBinding()]
param(
  [string]$SubscriptionId = "c710b26f-e3c7-4a45-9477-eaaf3bdcc329",
  [string]$Location = "brazilsouth"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

az account set --subscription $SubscriptionId
if ($LASTEXITCODE -ne 0) { throw "Unable to select Azure subscription $SubscriptionId." }

$account = az account show --output json | ConvertFrom-Json
if ($account.state -ne "Enabled") { throw "Azure subscription is not enabled." }
Write-Host "Using Azure subscription '$($account.name)' in tenant $($account.tenantId)."

$providers = @(
  "Microsoft.App",
  "Microsoft.ContainerRegistry",
  "Microsoft.DBforPostgreSQL",
  "Microsoft.Insights",
  "Microsoft.KeyVault",
  "Microsoft.ManagedIdentity",
  "Microsoft.Network",
  "Microsoft.OperationalInsights",
  "Microsoft.Storage"
)

foreach ($provider in $providers) {
  Write-Host "Registering $provider..."
  az provider register --namespace $provider --wait --output none
  if ($LASTEXITCODE -ne 0) { throw "Provider registration failed for $provider." }
}

$containerAppsLocations = az provider show `
  --namespace Microsoft.App `
  --query "resourceTypes[?resourceType=='containerApps'].locations | [0]" `
  --output json | ConvertFrom-Json
$postgresLocations = az provider show `
  --namespace Microsoft.DBforPostgreSQL `
  --query "resourceTypes[?resourceType=='flexibleServers'].locations | [0]" `
  --output json | ConvertFrom-Json

$normalizedLocation = $Location.Replace(" ", "").ToLowerInvariant()
$containerAppsAvailable = $containerAppsLocations |
  Where-Object { $_.Replace(" ", "").ToLowerInvariant() -eq $normalizedLocation }
$postgresAvailable = $postgresLocations |
  Where-Object { $_.Replace(" ", "").ToLowerInvariant() -eq $normalizedLocation }

if (-not $containerAppsAvailable) {
  throw "Azure Container Apps is not advertised in $Location for this subscription."
}
if (-not $postgresAvailable) {
  throw "Azure Database for PostgreSQL Flexible Server is not advertised in $Location."
}

Write-Host "Azure preflight completed successfully for $Location."
