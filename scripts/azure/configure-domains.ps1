[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Preview,
  [ValidatePattern('^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$')]
  [string]$DomainName = "genealogiq.com.br",
  [string]$ResourceGroup = "rg-genealogiq-prod",
  [string]$Environment = "cae-genealogiq-prod",
  [string]$SubscriptionId = "c710b26f-e3c7-4a45-9477-eaaf3bdcc329"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if ($Apply -and $Preview) { throw "Use either -Apply or the read-only -Preview, not both." }

function Invoke-AzureCli {
  param([string[]]$CliArguments)

  $result = az @CliArguments --subscription $SubscriptionId --only-show-errors
  if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI failed: $($CliArguments[0..1] -join ' ')."
  }
  return $result
}

function Assert-HealthyEndpoint {
  param([string]$Hostname, [switch]$Retry)

  foreach ($path in @("/api/health/live", "/api/health/ready")) {
    $curlArguments = @(
      "--silent", "--show-error", "--fail", "--output", "NUL",
      "--write-out", "%{http_code}", "--max-time", "30"
    )
    if ($Retry) {
      $curlArguments += @("--retry", "12", "--retry-all-errors", "--retry-delay", "5")
    }
    $status = curl.exe @curlArguments "https://$Hostname$path"
    if ($LASTEXITCODE -ne 0 -or $status -ne "200") {
      throw "HTTPS health check failed for $Hostname$path (HTTP $status)."
    }
    Write-Host "${Hostname}${path}: HTTP 200"
  }
}

function Assert-ReadyRevision {
  param([string]$ApplicationId)

  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $currentApplication = Invoke-AzureCli @(
      "rest", "--method", "get", "--url",
      "https://management.azure.com${ApplicationId}?api-version=2024-03-01", "--output", "json"
    ) | ConvertFrom-Json
    $properties = $currentApplication.properties
    if ($properties.provisioningState -eq "Failed") {
      throw "Application revision provisioning failed for $($currentApplication.name)."
    }
    if (-not [string]::IsNullOrWhiteSpace($properties.latestRevisionName) -and
        $properties.latestRevisionName -eq $properties.latestReadyRevisionName) {
      Write-Host "$($currentApplication.name): latest revision $($properties.latestRevisionName) is ready."
      return
    }
    Start-Sleep -Seconds 5
  }
  throw "Latest application revision is not ready for $ApplicationId; an older revision's health response is not sufficient."
}

$account = Invoke-AzureCli @("account", "show", "--output", "json") | ConvertFrom-Json
if ($account.id -ne $SubscriptionId -or $account.state -ne "Enabled") {
  throw "The production Azure subscription is unavailable."
}

$environmentDetails = Invoke-AzureCli @(
  "containerapp", "env", "show", "--name", $Environment,
  "--resource-group", $ResourceGroup, "--output", "json"
) | ConvertFrom-Json
$staticIp = $environmentDetails.properties.staticIp
$DomainName = $DomainName.ToLowerInvariant()
$publicUrls = @{
  APP_URL = "https://$DomainName"
  BMS_URL = "https://bms.$DomainName"
  SEQUOIA_URL = "https://sequoia.$DomainName"
}
$applicationDefinitions = @(
  @{ name = "ca-genealogiq-app-prod"; hostnames = @($DomainName, "www.$DomainName"); authUrl = $publicUrls.APP_URL },
  @{ name = "ca-genealogiq-bms-prod"; hostnames = @("bms.$DomainName"); authUrl = $publicUrls.BMS_URL },
  @{ name = "ca-genealogiq-seq-prod"; hostnames = @("sequoia.$DomainName"); authUrl = $publicUrls.SEQUOIA_URL }
)
$applications = @()
$domains = @()
$dnsRecords = @()

foreach ($definition in $applicationDefinitions) {
  $applicationId = "$($environmentDetails.id.Substring(0, $environmentDetails.id.IndexOf('/providers/')))/providers/Microsoft.App/containerApps/$($definition.name)"
  $application = Invoke-AzureCli @(
    "rest", "--method", "get", "--url",
    "https://management.azure.com${applicationId}?api-version=2024-03-01", "--output", "json"
  ) | ConvertFrom-Json
  if ($application.properties.managedEnvironmentId -ne $environmentDetails.id) {
    throw "$($definition.name) does not belong to the expected Container Apps environment."
  }
  if (-not $application.properties.configuration.ingress.external) {
    throw "$($definition.name) requires public HTTP ingress for managed TLS."
  }
  $applications += @{ definition = $definition; resource = $application }

  foreach ($hostname in $definition.hostnames) {
    $recordName = if ($hostname -eq $DomainName) { "@" } else { $hostname.Substring(0, $hostname.Length - $DomainName.Length - 1) }
    $recordType = if ($recordName -eq "@") { "A" } else { "CNAME" }
    $recordValue = if ($recordName -eq "@") { $staticIp } else { $application.properties.configuration.ingress.fqdn }
    $txtName = if ($recordName -eq "@") { "asuid" } else { "asuid.$recordName" }
    $verificationId = $application.properties.customDomainVerificationId
    if ([string]::IsNullOrWhiteSpace($verificationId) -or [string]::IsNullOrWhiteSpace($recordValue)) {
      throw "Azure did not return DNS configuration for $hostname."
    }
    $domains += @{
      app = $definition.name
      hostname = $hostname
      recordType = $recordType
      recordValue = $recordValue
      verificationId = $verificationId
      validationMethod = if ($recordName -eq "@") { "HTTP" } else { "CNAME" }
    }
    $dnsRecords += [pscustomobject]@{ Type = $recordType; Name = $recordName; Value = $recordValue; TTL = 300 }
    $dnsRecords += [pscustomobject]@{ Type = "TXT"; Name = $txtName; Value = $verificationId; TTL = 300 }
  }
}

Write-Host "Hostinger: Domains > DNS > $DomainName > DNS records"
$dnsRecords | Format-Table -AutoSize -Wrap | Out-Host

if (-not $Apply -and -not $Preview) {
  Write-Host "Read-only: no Azure or DNS changes were made."
  Write-Host "Re-run with -Apply after all records resolve publicly, or -Preview for a read-only what-if."
  return
}

if ($Apply) {
  foreach ($domain in $domains) {
    foreach ($dnsServer in @("1.1.1.1", "8.8.8.8")) {
      try {
        $routingRecords = @(Resolve-DnsName -Name $domain.hostname -Type $domain.recordType -Server $dnsServer -DnsOnly -ErrorAction Stop)
        $txtRecords = @(Resolve-DnsName -Name "asuid.$($domain.hostname)" -Type TXT -Server $dnsServer -DnsOnly -ErrorAction Stop)
      } catch {
        throw "DNS for $($domain.hostname) is not ready on $dnsServer. No Azure changes were made."
      }
      $routingValues = @(if ($domain.recordType -eq "A") {
        @($routingRecords | Where-Object { $_.Type -eq "A" } | ForEach-Object { $_.IPAddress })
      } else {
        @($routingRecords | Where-Object { $_.Type -eq "CNAME" } | ForEach-Object { $_.NameHost.TrimEnd('.') })
      })
      $txtValues = @($txtRecords | Where-Object { $_.Type -eq "TXT" } | ForEach-Object { $_.Strings -join '' })
      if ($routingValues.Count -ne 1 -or $routingValues[0] -ne $domain.recordValue -or $domain.verificationId -notin $txtValues) {
        throw "DNS routing or ownership for $($domain.hostname) is incorrect on $dnsServer. No Azure changes were made."
      }
    }
  }
}

foreach ($application in $applications) {
  Assert-HealthyEndpoint -Hostname $application.resource.properties.configuration.ingress.fqdn
}

$previewApplications = @()
foreach ($application in $applications) {
  $resource = $application.resource | ConvertTo-Json -Depth 40 | ConvertFrom-Json
  $configuration = $resource.properties.configuration
  $keyVaultSecrets = @()
  foreach ($secret in @($configuration.secrets)) {
    $keyVaultProperty = $secret.PSObject.Properties["keyVaultUrl"]
    if (-not $keyVaultProperty -or [string]::IsNullOrWhiteSpace($keyVaultProperty.Value)) {
      throw "Cannot safely preview inline secrets for $($resource.name). Keep production secrets in Key Vault."
    }
    $keyVaultSecrets += @{ name = $secret.name; keyVaultUrl = $keyVaultProperty.Value; identity = $secret.identity }
  }
  $configuration.secrets = $keyVaultSecrets
  $customDomains = @($configuration.ingress.customDomains | Where-Object { $_ })
  foreach ($hostname in $application.definition.hostnames) {
    if ($hostname -notin @($customDomains | ForEach-Object { $_.name })) {
      $customDomains += [pscustomobject]@{ name = $hostname; bindingType = "Disabled" }
    }
  }
  $configuration.ingress.customDomains = $customDomains
  $configuration.ingress.PSObject.Properties.Remove("fqdn")
  foreach ($container in $resource.properties.template.containers) {
    $container.resources.PSObject.Properties.Remove("ephemeralStorage")
    $container.env = @($container.env | Where-Object { $_.name -notin @("APP_URL", "BMS_URL", "SEQUOIA_URL", "AUTH_URL") })
    foreach ($variableName in $publicUrls.Keys) {
      $container.env += [pscustomobject]@{ name = $variableName; value = $publicUrls[$variableName] }
    }
    $container.env += [pscustomobject]@{ name = "AUTH_URL"; value = $application.definition.authUrl }
  }
  $identities = @{}
  foreach ($identityName in $resource.identity.userAssignedIdentities.PSObject.Properties.Name) {
    $identities[$identityName] = @{}
  }
  $tagsProperty = $resource.PSObject.Properties["tags"]
  $tags = if ($tagsProperty) { $tagsProperty.Value } else { @{} }
  $properties = @{
    managedEnvironmentId = $resource.properties.managedEnvironmentId
    configuration = $configuration
    template = $resource.properties.template
  }
  $workloadProfileProperty = $resource.properties.PSObject.Properties["workloadProfileName"]
  if ($workloadProfileProperty) { $properties.workloadProfileName = $workloadProfileProperty.Value }
  $previewApplications += @{
    name = $resource.name
    location = $resource.location
    tags = $tags
    identity = @{ type = $resource.identity.type; userAssignedIdentities = $identities }
    properties = $properties
  }
}

$repositoryRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$stateDirectory = Join-Path $repositoryRoot ".azure"
[System.IO.Directory]::CreateDirectory($stateDirectory) | Out-Null
$previewFile = Join-Path $stateDirectory "domain-cutover-preview.parameters.json"
@{ applications = @{ value = $previewApplications } } |
  ConvertTo-Json -Depth 50 | Set-Content -LiteralPath $previewFile -Encoding UTF8
Write-Host "Previewing hostname additions and runtime URL changes. Certificate resources are issued separately by Azure CLI."
$whatIf = Invoke-AzureCli @(
  "deployment", "group", "what-if", "--resource-group", $ResourceGroup,
  "--template-file", (Join-Path $repositoryRoot "infra/custom-domain-cutover.bicep"),
  "--parameters", "@$previewFile", "--no-pretty-print"
) | ConvertFrom-Json
if ($whatIf.status -ne "Succeeded") { throw "Domain cutover what-if did not succeed." }
$changedResources = @($whatIf.changes | Where-Object { $_.changeType -notin @("Ignore", "NoChange") })
$expectedIds = @($applications | ForEach-Object { $_.resource.id })
if (@($changedResources | Where-Object { $_.resourceId -notin $expectedIds -or $_.changeType -notin @("Modify", "Deploy") }).Count -gt 0) {
  throw "The domain cutover preview contains unexpected resource changes. No Azure resources were changed."
}
$whatIf | ConvertTo-Json -Depth 60 |
  Set-Content -LiteralPath (Join-Path $stateDirectory "domain-cutover-what-if.json") -Encoding UTF8
$changedResources | Select-Object resourceId, changeType | Format-Table -AutoSize -Wrap | Out-Host
if ($Preview) {
  Write-Host "Read-only preview complete. No Azure resources or runtime URLs were changed."
  return
}

foreach ($domain in $domains) {
  $application = $applications | Where-Object { $_.definition.name -eq $domain.app } | Select-Object -First 1
  $currentApplication = Invoke-AzureCli @(
    "rest", "--method", "get", "--url",
    "https://management.azure.com$($application.resource.id)?api-version=2024-03-01", "--output", "json"
  ) | ConvertFrom-Json
  $bindings = @($currentApplication.properties.configuration.ingress.customDomains | Where-Object { $_ })
  $binding = $bindings | Where-Object { $_.name -eq $domain.hostname } | Select-Object -First 1
  if (-not $binding) {
    Invoke-AzureCli @(
      "containerapp", "hostname", "add", "--name", $domain.app,
      "--resource-group", $ResourceGroup, "--hostname", $domain.hostname, "--output", "none"
    ) | Out-Null
  }
  if (-not $binding -or $binding.bindingType -ne "SniEnabled") {
    Invoke-AzureCli @(
      "containerapp", "hostname", "bind", "--name", $domain.app,
      "--resource-group", $ResourceGroup, "--environment", $Environment,
      "--hostname", $domain.hostname, "--validation-method", $domain.validationMethod, "--output", "none"
    ) | Out-Null
  }
  Assert-HealthyEndpoint -Hostname $domain.hostname -Retry
}

foreach ($application in $applications) {
  $expectedEnvironment = @{} + $publicUrls
  $expectedEnvironment.AUTH_URL = $application.definition.authUrl
  $currentEnvironment = @{}
  foreach ($variable in $application.resource.properties.template.containers[0].env) {
    $valueProperty = $variable.PSObject.Properties["value"]
    if ($valueProperty) { $currentEnvironment[$variable.name] = $valueProperty.Value }
  }
  $needsUpdate = @($expectedEnvironment.Keys | Where-Object { $currentEnvironment[$_] -ne $expectedEnvironment[$_] }).Count -gt 0
  if ($needsUpdate) {
    $environmentArguments = @($expectedEnvironment.Keys | ForEach-Object { "$_=$($expectedEnvironment[$_])" })
    Invoke-AzureCli (@(
      "containerapp", "update", "--name", $application.definition.name,
      "--resource-group", $ResourceGroup, "--output", "none", "--set-env-vars"
    ) + $environmentArguments) | Out-Null
  }
  Assert-ReadyRevision -ApplicationId $application.resource.id
  Assert-HealthyEndpoint -Hostname $application.definition.hostnames[0] -Retry
}

Write-Host "Custom domains, managed TLS, and runtime application/authentication URLs are configured. Existing domain bindings were retained."
Write-Host "Update Google OAuth redirects, Stripe webhooks, and any third-party hostname allowlists separately."
