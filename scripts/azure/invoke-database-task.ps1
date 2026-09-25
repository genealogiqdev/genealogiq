[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$ScriptPath,

  [Parameter(Mandatory)]
  [hashtable]$Environment,

  [string]$ResourceGroup = 'rg-genealogiq-prod',
  [string]$JobName = 'job-genealogiq-migrate-prod'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$account = az account show --query '{name:name,id:id,state:state}' --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Unable to read the Azure subscription context.' }
if ($account.id -ne 'c710b26f-e3c7-4a45-9477-eaaf3bdcc329') {
  throw "Refusing to run against unexpected subscription '$($account.name)' ($($account.id))."
}

$image = (az containerapp job show `
  --resource-group $ResourceGroup `
  --name $JobName `
  --query properties.template.containers[0].image `
  --output tsv).Trim()
if ($LASTEXITCODE -ne 0 -or -not $image) { throw 'Unable to discover the current job image.' }

$resolvedScriptPath = (Resolve-Path -LiteralPath $ScriptPath).Path
$source = [IO.File]::ReadAllText($resolvedScriptPath)
$encodedScript = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($source))
$environmentVariables = @(
  @{ name = 'DATABASE_URL'; secretRef = 'database-url-direct' }
  @{ name = 'DB_SCRIPT_B64'; value = $encodedScript }
)
foreach ($entry in $Environment.GetEnumerator()) {
  if ($entry.Key -in @('DATABASE_URL', 'DB_SCRIPT_B64')) {
    throw "Environment key '$($entry.Key)' is reserved."
  }
  $environmentVariables += @{ name = [string]$entry.Key; value = [string]$entry.Value }
}

$jobTemplate = @{
  containers = @(@{
    name      = $JobName
    image     = $image
    command   = @('node', '-e')
    args      = @("eval(Buffer.from(process.env.DB_SCRIPT_B64,'base64').toString())")
    env       = $environmentVariables
    resources = @{ cpu = 0.5; memory = '1Gi' }
  })
}
$yamlPath = Join-Path $env:TEMP "genealogiq-database-task-$([Guid]::NewGuid().ToString('N')).yaml"

try {
  $jsonYaml = $jobTemplate | ConvertTo-Json -Depth 10
  [IO.File]::WriteAllText($yamlPath, $jsonYaml, [Text.UTF8Encoding]::new($false))
  $execution = (az containerapp job start `
    --resource-group $ResourceGroup `
    --name $JobName `
    --yaml $yamlPath `
    --query name `
    --output tsv).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $execution) { throw 'Unable to start the database task.' }
  $execution
} finally {
  if (Test-Path -LiteralPath $yamlPath) { Remove-Item -LiteralPath $yamlPath -Force }
}
