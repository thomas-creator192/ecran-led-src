# Fabrique le fichier à télécharger par le club : dist\EcranLED-SRC.zip
#   Installer.cmd  → double-clic pour installer
#   node\node.exe  → le moteur (le club n'a rien à installer)
#   app\           → l'app (celle qui se met ensuite à jour toute seule depuis GitHub)
# Usage (sur le PC de développement) : powershell -ExecutionPolicy Bypass -File outils\construire.ps1
$ErrorActionPreference = 'Stop'
$racine = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $racine 'dist'
$paquet = Join-Path $dist 'EcranLED-SRC'
$zip = Join-Path $dist 'EcranLED-SRC.zip'

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $paquet 'node'), (Join-Path $paquet 'app') | Out-Null

Copy-Item (Get-Command node).Source -Destination (Join-Path $paquet 'node\node.exe')

$exclus = @('.git', 'dist', 'data', 'outils')
Get-ChildItem $racine -Force | Where-Object { $exclus -notcontains $_.Name } |
  ForEach-Object { Copy-Item $_.FullName -Destination (Join-Path $paquet 'app') -Recurse -Force }
Copy-Item (Join-Path $racine 'installateur\Installer.cmd') -Destination $paquet

Compress-Archive -Path $paquet -DestinationPath $zip -Force
$version = (Get-Content (Join-Path $racine 'package.json') -Raw | ConvertFrom-Json).version
Write-Host ("Paquet version {0} : {1} ({2:N0} Mo)" -f $version, $zip, ((Get-Item $zip).Length / 1MB))
