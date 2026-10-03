$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$script:AzureCalls = @()
$script:DnsReady = $false
$script:HealthReady = $true
$script:ConcurrentBinding = $false
$script:RevisionReady = $true
$script:VerificationId = "TEST-OWNERSHIP-ID"
$script:EnvironmentId = "/subscriptions/c710b26f-e3c7-4a45-9477-eaaf3bdcc329/resourceGroups/rg-genealogiq-prod/providers/Microsoft.App/managedEnvironments/cae-genealogiq-prod"
$script:Apps = @()
foreach ($appName in @("app", "bms", "seq")) {
  $script:Apps += @{
    id = "$($script:EnvironmentId.Split('/providers/')[0])/providers/Microsoft.App/containerApps/ca-genealogiq-$appName-prod"
    name = "ca-genealogiq-$appName-prod"
    location = "brazilsouth"
    identity = @{ type = "UserAssigned"; userAssignedIdentities = @{ "/test/identity" = @{} } }
    properties = @{
      provisioningState = "Succeeded"
      latestRevisionName = "test-current"
      latestReadyRevisionName = "test-current"
      managedEnvironmentId = $script:EnvironmentId
      customDomainVerificationId = $script:VerificationId
      configuration = @{
        secrets = @(@{ name = "auth"; keyVaultUrl = "https://test.vault.azure.net/secrets/auth"; identity = "/test/identity" })
        ingress = @{ external = $true; fqdn = "$appName.example.azurecontainerapps.io"; customDomains = @() }
      }
      template = @{ containers = @(@{ env = @(@{ name = "AUTH_URL"; value = "https://legacy.example.com" }); resources = @{ cpu = 0.5; memory = "1Gi"; ephemeralStorage = "2Gi" } }) }
    }
  }
}

function az {
  $script:AzureCalls += ,@($args)
  $global:LASTEXITCODE = 0
  if ($args[0] -eq "account") {
    @{ id = "c710b26f-e3c7-4a45-9477-eaaf3bdcc329"; state = "Enabled" } | ConvertTo-Json
  } elseif ($args[0] -eq "rest") {
    $requestUrl = $args[[Array]::IndexOf($args, "--url") + 1]
    $currentApplication = $script:Apps | Where-Object { $requestUrl.Contains($_.id) }
    $currentApplication.properties.latestReadyRevisionName = if ($script:RevisionReady) { "test-current" } else { "test-old" }
    $currentApplication | ConvertTo-Json -Depth 20
  } elseif ($args[0] -eq "deployment") {
    if ($script:ConcurrentBinding) {
      $bmsApplication = $script:Apps | Where-Object { $_.name -eq "ca-genealogiq-bms-prod" }
      $bmsApplication.properties.configuration.ingress.customDomains = @(
        @{ name = "bms.genealogiq.com.br"; bindingType = "SniEnabled"; certificateId = "/test/concurrent-certificate" }
      )
    }
    @{ status = "Succeeded"; changes = @($script:Apps | ForEach-Object { @{ resourceId = $_.id; changeType = "Modify" } }) } | ConvertTo-Json -Depth 10
  } elseif ($args[0] -eq "containerapp" -and $args[1] -eq "env") {
    @{ id = $script:EnvironmentId; properties = @{ staticIp = "20.197.202.148" } } | ConvertTo-Json -Depth 6
  }
}

function curl.exe {
  $global:LASTEXITCODE = if ($script:HealthReady) { 0 } else { 22 }
  if ($script:HealthReady) { "200" } else { "503" }
}

function Start-Sleep {
  param($Seconds)
}

function Resolve-DnsName {
  param($Name, $Type, $Server, [switch]$DnsOnly, $ErrorAction)
  if (-not $script:DnsReady) { throw "DNS fixture is not ready." }
  if ($Type -eq "TXT") { [pscustomobject]@{ Type = "TXT"; Strings = @("TEST-OWNERSHIP-ID") } }
  elseif ($Type -eq "A") { [pscustomobject]@{ Type = "A"; IPAddress = "20.197.202.148" } }
  else {
    $appName = switch ($Name.Split('.')[0]) { "www" { "app" } "bms" { "bms" } "sequoia" { "seq" } }
    [pscustomobject]@{ Type = "CNAME"; NameHost = "$appName.example.azurecontainerapps.io." }
  }
}

function Assert-Equal {
  param($Actual, $Expected, [string]$Scenario)
  if ($Actual -ne $Expected) { throw "$Scenario failed: expected '$Expected', observed '$Actual'." }
}

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) "genealogiq-domain-tests-$([guid]::NewGuid().ToString('N'))"
$testScriptDirectory = Join-Path $testRoot "scripts/azure"
[System.IO.Directory]::CreateDirectory($testScriptDirectory) | Out-Null
$configureScript = Join-Path $testScriptDirectory "configure-domains.ps1"
Copy-Item -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) "configure-domains.ps1") -Destination $configureScript
. $configureScript
Assert-Equal $script:AzureCalls.Count 5 "Read-only Azure discovery"
Assert-Equal @($script:AzureCalls | Where-Object { $_[0] -in @("deployment", "containerapp") -and $_[1] -ne "env" }).Count 0 "Read-only mode has no writes"

$script:AzureCalls = @()
try {
  . $configureScript -Apply
  throw "Missing DNS must reject the cutover."
} catch {
  if ($_.Exception.Message -notmatch "DNS.*No Azure changes were made") { throw }
}
Assert-Equal $script:AzureCalls.Count 5 "DNS failure stops before preview or writes"

$script:DnsReady = $true
$script:HealthReady = $false
$script:AzureCalls = @()
try {
  . $configureScript -Apply
  throw "Unhealthy application must reject the cutover."
} catch {
  if ($_.Exception.Message -notmatch "HTTPS health check failed.*503") { throw }
}
Assert-Equal $script:AzureCalls.Count 5 "Health failure stops before writes"

$script:HealthReady = $true
$script:AzureCalls = @()
. $configureScript -Apply
$bindings = @($script:AzureCalls | Where-Object { $_[0] -eq "containerapp" -and $_[1] -eq "hostname" -and $_[2] -eq "bind" })
Assert-Equal $bindings.Count 4 "Four managed certificate bindings"
Assert-Equal $bindings[0][[Array]::IndexOf($bindings[0], "--hostname") + 1] "genealogiq.com.br" "Apex hostname"
Assert-Equal $bindings[0][[Array]::IndexOf($bindings[0], "--validation-method") + 1] "HTTP" "Apex certificate validation"
foreach ($binding in $bindings[1..3]) {
  Assert-Equal $binding[[Array]::IndexOf($binding, "--validation-method") + 1] "CNAME" "Direct subdomain validation"
}
$updates = @($script:AzureCalls | Where-Object { $_[0] -eq "containerapp" -and $_[1] -eq "update" })
Assert-Equal $updates.Count 3 "Three canonical origin updates"
foreach ($update in $updates) {
  Assert-Equal ("APP_URL=https://genealogiq.com.br" -in $update) $true "Consumer origin"
  Assert-Equal ("BMS_URL=https://bms.genealogiq.com.br" -in $update) $true "BMS origin"
  Assert-Equal ("SEQUOIA_URL=https://sequoia.genealogiq.com.br" -in $update) $true "Sequoia origin"
  $applicationName = $update[[Array]::IndexOf($update, "--name") + 1]
  $expectedAuthUrl = switch ($applicationName) {
    "ca-genealogiq-app-prod" { "AUTH_URL=https://genealogiq.com.br" }
    "ca-genealogiq-bms-prod" { "AUTH_URL=https://bms.genealogiq.com.br" }
    "ca-genealogiq-seq-prod" { "AUTH_URL=https://sequoia.genealogiq.com.br" }
  }
  Assert-Equal ($expectedAuthUrl -in $update) $true "App-specific authentication origin"
}
$script:ConcurrentBinding = $true
$script:AzureCalls = @()
. $configureScript -Apply
$concurrentHostnameWrites = @($script:AzureCalls | Where-Object {
  $_[0] -eq "containerapp" -and $_[1] -eq "hostname" -and "ca-genealogiq-bms-prod" -in $_
})
Assert-Equal $concurrentHostnameWrites.Count 0 "Bindings completed during certificate waits are rediscovered"
$script:ConcurrentBinding = $false
$script:AzureCalls = @()
foreach ($app in $script:Apps) {
  $appName = $app.name.Split('-')[2]
  $hostnames = switch ($appName) {
    "app" { @("genealogiq.com.br", "www.genealogiq.com.br") }
    "bms" { @("bms.genealogiq.com.br") }
    "seq" { @("sequoia.genealogiq.com.br") }
  }
  $authUrl = switch ($appName) {
    "app" { "https://genealogiq.com.br" }
    "bms" { "https://bms.genealogiq.com.br" }
    "seq" { "https://sequoia.genealogiq.com.br" }
  }
  $app.properties.configuration.ingress.customDomains = @($hostnames | ForEach-Object { @{ name = $_; bindingType = "SniEnabled"; certificateId = "/test/certificate" } })
  $app.properties.template.containers[0].env = @(
    @{ name = "APP_URL"; value = "https://genealogiq.com.br" },
    @{ name = "BMS_URL"; value = "https://bms.genealogiq.com.br" },
    @{ name = "SEQUOIA_URL"; value = "https://sequoia.genealogiq.com.br" },
    @{ name = "AUTH_URL"; value = $authUrl }
  )
}
. $configureScript -Apply
Assert-Equal @($script:AzureCalls | Where-Object { $_[0] -eq "containerapp" -and $_[1] -in @("hostname", "update") }).Count 0 "Already configured cutover makes no writes"
$script:RevisionReady = $false
try {
  . $configureScript -Apply
  throw "An old healthy revision must not verify the new origins."
} catch {
  if ($_.Exception.Message -notmatch "Latest application revision is not ready.*older revision") { throw }
}
$resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
if (-not $resolvedTestRoot.StartsWith([System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()), [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Test cleanup target is outside the temporary directory."
}
Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
Write-Host "Domain cutover tests passed: read-only, missing DNS, failed health, certificate/origin orchestration, refreshed bindings, idempotent rerun, and stale-revision rejection."
