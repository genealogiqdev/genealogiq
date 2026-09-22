[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$RegistryName,
  [string]$ImageTag = "",
  [string]$AppSentryDsn = "",
  [string]$BmsSentryDsn = "",
  [string]$SeqSentryDsn = "",
  [string]$VapidPublicKey = "",
  [string]$TurnstileSiteKey = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($ImageTag)) {
  $commit = (git rev-parse --short=12 HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { throw "Unable to determine the Git commit." }
  $ImageTag = "$commit-$(Get-Date -Format 'yyyyMMddHHmmss')"
}

$registryServer = (
  az acr show --name $RegistryName --query loginServer --output tsv
).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($registryServer)) {
  throw "Unable to resolve registry $RegistryName."
}
az acr login --name $RegistryName
if ($LASTEXITCODE -ne 0) { throw "Docker login to $RegistryName failed." }

function Build-AppImage(
  [string]$Application,
  [string]$Repository,
  [string]$SentryDsn,
  [string[]]$AdditionalArguments = @()
) {
  $image = "$registryServer/${Repository}:${ImageTag}"
  $arguments = @(
    "build",
    "--file", "Dockerfile",
    "--target", "app-runtime",
    "--tag", $image,
    "--build-arg", "APP=$Application",
    "--build-arg", "NEXT_PUBLIC_SENTRY_DSN=$SentryDsn"
  ) + $AdditionalArguments + @(".")

  Write-Host "Building $image..."
  & docker @arguments
  if ($LASTEXITCODE -ne 0) { throw "Image build failed for $Repository." }
  docker push $image
  if ($LASTEXITCODE -ne 0) { throw "Image push failed for $Repository." }
}

Build-AppImage `
  -Application "app" `
  -Repository "genealogiq-app" `
  -SentryDsn $AppSentryDsn `
  -AdditionalArguments @(
    "--build-arg", "NEXT_PUBLIC_VAPID_PUBLIC_KEY=$VapidPublicKey",
    "--build-arg", "NEXT_PUBLIC_TURNSTILE_SITE_KEY=$TurnstileSiteKey"
  )
Build-AppImage -Application "bms" -Repository "genealogiq-bms" -SentryDsn $BmsSentryDsn
Build-AppImage -Application "seq" -Repository "genealogiq-seq" -SentryDsn $SeqSentryDsn

$operationsImages = @(
  @{ repository = "genealogiq-migration"; target = "migration" },
  @{ repository = "genealogiq-scheduler"; target = "scheduler" },
  @{ repository = "genealogiq-db-transfer"; target = "database-transfer" }
)

foreach ($image in $operationsImages) {
  $fullImage = "$registryServer/$($image.repository):${ImageTag}"
  Write-Host "Building $fullImage..."
  docker build `
    --tag $fullImage `
    --file Dockerfile `
    --target $image.target `
    .
  if ($LASTEXITCODE -ne 0) { throw "Image build failed for $($image.repository)." }
  docker push $fullImage
  if ($LASTEXITCODE -ne 0) { throw "Image push failed for $($image.repository)." }
}

$outputDirectory = ".azure"
if (-not (Test-Path $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}
Set-Content -Path "$outputDirectory/image-tag.txt" -Value $ImageTag -Encoding ASCII
Write-Host "Built all images with immutable tag $ImageTag."
