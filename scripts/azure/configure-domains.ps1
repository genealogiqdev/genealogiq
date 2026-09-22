[CmdletBinding()]
param(
  [switch]$Apply,
  [string]$ResourceGroup = "rg-genealogiq-prod",
  [string]$Environment = "cae-genealogiq-prod"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$environmentDetails = az containerapp env show `
  --name $Environment `
  --resource-group $ResourceGroup `
  --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "Unable to read the Container Apps environment." }

$verificationId = $environmentDetails.properties.customDomainConfiguration.customDomainVerificationId
$staticIp = $environmentDetails.properties.staticIp
$domains = @(
  @{
    app = "ca-genealogiq-app-prod"
    hostname = "genealogiq.app"
    recordType = "A"
    recordName = "@"
    recordValue = $staticIp
    validationMethod = "TXT"
  },
  @{
    app = "ca-genealogiq-bms-prod"
    hostname = "bms.genealogiq.app"
    recordType = "CNAME"
    recordName = "bms"
    recordValue = "ca-genealogiq-bms-prod.$($environmentDetails.properties.defaultDomain)"
    validationMethod = "CNAME"
  },
  @{
    app = "ca-genealogiq-seq-prod"
    hostname = "sequoia.rip"
    recordType = "A"
    recordName = "@"
    recordValue = $staticIp
    validationMethod = "TXT"
  }
)

Write-Host "Required DNS changes at the current Vercel DNS provider:"
foreach ($domain in $domains) {
  $txtName = if ($domain.recordName -eq "@") { "asuid" } else { "asuid.$($domain.recordName)" }
  Write-Host "$($domain.hostname): $($domain.recordType) $($domain.recordName) -> $($domain.recordValue)"
  Write-Host "$($domain.hostname): TXT $txtName -> $verificationId"
}

if (-not $Apply) {
  Write-Host "No DNS or hostname changes were made. Re-run with -Apply after these records resolve publicly."
  return
}

foreach ($domain in $domains) {
  $txtName = if ($domain.recordName -eq "@") {
    "asuid.$($domain.hostname)"
  } else {
    "asuid.$($domain.hostname)"
  }
  $txtValues = @(
    Resolve-DnsName $txtName -Type TXT -ErrorAction Stop |
      ForEach-Object { $_.Strings } |
      Where-Object { $_ }
  )
  if ($verificationId -notin $txtValues) {
    throw "TXT validation record for $($domain.hostname) has not propagated."
  }

  az containerapp hostname add `
    --name $domain.app `
    --resource-group $ResourceGroup `
    --hostname $domain.hostname `
    --output none
  if ($LASTEXITCODE -ne 0) { throw "Failed to add hostname $($domain.hostname)." }

  az containerapp hostname bind `
    --name $domain.app `
    --resource-group $ResourceGroup `
    --environment $Environment `
    --hostname $domain.hostname `
    --validation-method $domain.validationMethod `
    --output none
  if ($LASTEXITCODE -ne 0) { throw "Failed to bind managed TLS for $($domain.hostname)." }
}

Write-Host "All custom domains are bound with managed TLS."
