# Package the extension into a Chrome Web Store-ready zip.
# Usage: powershell -File scripts/package.ps1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$manifest = Get-Content "manifest.json" -Raw | ConvertFrom-Json
$version = $manifest.version
$name = "my-palette-for-flaticon-$version"
$outDir = Join-Path $root "dist"
$outZip = Join-Path $outDir "$name.zip"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
if (Test-Path $outZip) { Remove-Item $outZip -Force }

Write-Host "Packaging version $version -> $outZip"

$staging = Join-Path $outDir "_staging_$name"
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Force -Path $staging | Out-Null

Copy-Item "manifest.json" $staging
Copy-Item "icons" (Join-Path $staging "icons") -Recurse
Copy-Item "src" (Join-Path $staging "src") -Recurse

Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $outZip -Force
Remove-Item -Recurse -Force $staging

Write-Host "Done: $outZip"
