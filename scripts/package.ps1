$ErrorActionPreference = 'Stop'
function Get-PackageSha256([string]$filePath) {
  $fileStream = [System.IO.File]::OpenRead($filePath)
  $hashAlgorithm = [System.Security.Cryptography.SHA256]::Create()
  try {return ([System.BitConverter]::ToString($hashAlgorithm.ComputeHash($fileStream))).Replace('-','').ToLowerInvariant()}
  finally {$hashAlgorithm.Dispose();$fileStream.Dispose()}
}
$packageRoot = Split-Path -Parent $PSScriptRoot
$packageSource = Join-Path $packageRoot 'extension'
$packageManifest = Get-Content -LiteralPath (Join-Path $packageSource 'manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
$packageDestination = Join-Path $packageRoot 'dist'
New-Item -ItemType Directory -Path $packageDestination -Force | Out-Null
$packageZip = Join-Path $packageDestination "page-image-save-$($packageManifest.version).zip"
$packageEntries = @(Get-ChildItem -LiteralPath $packageSource -Force | Select-Object -ExpandProperty FullName)
Compress-Archive -LiteralPath $packageEntries -DestinationPath $packageZip -Force
$packageHashes = @(Get-ChildItem -LiteralPath $packageSource -Recurse -File | Sort-Object FullName | ForEach-Object {
  [pscustomobject]@{path=$_.FullName.Substring($packageSource.Length+1).Replace('\','/'); sha256=(Get-PackageSha256 $_.FullName)}
})
$packageMetadata = [pscustomobject]@{version=$packageManifest.version; zip=(Split-Path -Leaf $packageZip); zipSha256=(Get-PackageSha256 $packageZip); files=$packageHashes}
$packageMetadata | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $packageDestination 'build.json') -Encoding utf8
$packageMetadata | ConvertTo-Json -Depth 5
