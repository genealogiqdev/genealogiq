[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$KeyVaultName,
  [string]$OutputPath = ".azure/enabled-secrets.json"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Read-DotEnv([string]$Path) {
  $values = @{}
  if (-not (Test-Path $Path)) { return $values }

  foreach ($line in Get-Content $Path) {
    if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
      $name = $Matches[1]
      $value = $Matches[2].Trim()
      if (
        $value.Length -ge 2 -and
        (($value.StartsWith('"') -and $value.EndsWith('"')) -or
         ($value.StartsWith("'") -and $value.EndsWith("'")))
      ) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      if (-not [string]::IsNullOrWhiteSpace($value)) {
        $values[$name] = $value
      }
    }
  }
  return $values
}

function New-RandomSecret([int]$ByteCount = 48) {
  $bytes = New-Object byte[] $ByteCount
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($bytes)
}

function Set-VaultSecret([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  az keyvault secret set `
    --vault-name $KeyVaultName `
    --name $Name `
    --value $Value `
    --output none
  if ($LASTEXITCODE -ne 0) { throw "Failed to store Key Vault secret '$Name'." }
  return $true
}

function Get-FirstValue([hashtable[]]$Sources, [string]$Name) {
  foreach ($source in $Sources) {
    if ($source.ContainsKey($Name) -and -not [string]::IsNullOrWhiteSpace($source[$Name])) {
      return $source[$Name]
    }
  }
  return $null
}

$app = Read-DotEnv "apps/app/.env"
$bms = Read-DotEnv "apps/bms/.env"
$seq = Read-DotEnv "apps/seq/.env"
$sources = @($app, $bms, $seq)
$enabled = New-Object System.Collections.Generic.List[string]

$sharedMappings = [ordered]@{
  "google-client-id" = "GOOGLE_CLIENT_ID"
  "google-client-secret" = "GOOGLE_CLIENT_SECRET"
  "blob-read-write-token" = "BLOB_READ_WRITE_TOKEN"
  "resend-api-key" = "RESEND_API_KEY"
  "stripe-secret-key" = "STRIPE_SECRET_KEY"
}

foreach ($mapping in $sharedMappings.GetEnumerator()) {
  $value = Get-FirstValue $sources $mapping.Value
  if (Set-VaultSecret $mapping.Key $value) { $enabled.Add($mapping.Key) }
}

$perAppMappings = @(
  @{ source = $app; variable = "AUTH_SECRET"; secret = "auth-secret-app" },
  @{ source = $bms; variable = "AUTH_SECRET"; secret = "auth-secret-bms" },
  @{ source = $seq; variable = "AUTH_SECRET"; secret = "auth-secret-seq" },
  @{ source = $app; variable = "STRIPE_WEBHOOK_SECRET"; secret = "stripe-webhook-app" },
  @{ source = $bms; variable = "STRIPE_WEBHOOK_SECRET"; secret = "stripe-webhook-bms" },
  @{ source = $seq; variable = "STRIPE_WEBHOOK_SECRET"; secret = "stripe-webhook-seq" },
  @{ source = $app; variable = "VAPID_PRIVATE_KEY"; secret = "vapid-private-key" },
  @{ source = $app; variable = "VAPID_SUBJECT"; secret = "vapid-subject" },
  @{ source = $app; variable = "TURNSTILE_SECRET_KEY"; secret = "turnstile-secret-key" }
)

foreach ($mapping in $perAppMappings) {
  $value = if ($mapping.source.ContainsKey($mapping.variable)) {
    $mapping.source[$mapping.variable]
  } else {
    $null
  }
  if (Set-VaultSecret $mapping.secret $value) { $enabled.Add($mapping.secret) }
}

$sourceDatabaseUrl = Get-FirstValue $sources "DATABASE_URL"
if (-not $sourceDatabaseUrl) {
  throw "No populated DATABASE_URL was found in apps/*/.env; the source database cannot be preserved."
}
if (Set-VaultSecret "source-database-url" $sourceDatabaseUrl) {
  $enabled.Add("source-database-url")
}

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$cronSecret = az keyvault secret show `
  --vault-name $KeyVaultName `
  --name "cron-secret" `
  --query value `
  --output tsv `
  --only-show-errors 2>$null
$cronSecretExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($cronSecretExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($cronSecret)) {
  $cronSecret = New-RandomSecret
  if (Set-VaultSecret "cron-secret" $cronSecret) { $enabled.Add("cron-secret") }
} else {
  $enabled.Add("cron-secret")
}

foreach ($requiredSecret in @(
  "database-url",
  "database-url-direct",
  "postgres-admin-password"
)) {
  $ErrorActionPreference = "Continue"
  az keyvault secret show `
    --vault-name $KeyVaultName `
    --name $requiredSecret `
    --query id `
    --output none `
    --only-show-errors 2>$null
  $secretExists = $LASTEXITCODE -eq 0
  $ErrorActionPreference = $previousErrorActionPreference
  if ($secretExists) { $enabled.Add($requiredSecret) }
}

$directory = Split-Path -Parent $OutputPath
if ($directory -and -not (Test-Path $directory)) {
  New-Item -ItemType Directory -Path $directory | Out-Null
}

$uniqueEnabled = @($enabled | Sort-Object -Unique)
$uniqueEnabled | ConvertTo-Json | Set-Content -Path $OutputPath -Encoding UTF8
Write-Host "Synchronized $($uniqueEnabled.Count) Key Vault secret references. Values were not printed."
