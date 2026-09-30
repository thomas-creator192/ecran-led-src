# Installe l'app « Écran LED SRC » sur ce PC :
#   - copie le moteur (node) et l'app dans %LOCALAPPDATA%\EcranLED-SRC (pas besoin d'être administrateur) ;
#   - garde les données existantes (score, réglages, téléphones autorisés) ;
#   - crée l'icône sur le Bureau et dans le menu Démarrer ;
#   - autorise les téléphones du Wi-Fi à joindre l'app (une fenêtre Windows demande la permission) ;
#   - lance l'app.
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [string]$Cible = (Join-Path $env:LOCALAPPDATA 'EcranLED-SRC'),
  [string]$Bureau = [Environment]::GetFolderPath('Desktop'),
  [string]$Menu = [Environment]::GetFolderPath('Programs'),
  [switch]$SansParefeu,
  [switch]$SansLancement
)
$ErrorActionPreference = 'Stop'
$Source = (Resolve-Path $Source).Path

Write-Host ''
Write-Host '  Installation de l''écran LED du SRC La Clayette' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path (Join-Path $Source 'node\node.exe')) -or -not (Test-Path (Join-Path $Source 'app\server.js'))) {
  throw 'Dossier incomplet : décompresse tout le fichier .zip avant de lancer Installer.'
}

# 1. Arrêter l'app si elle tourne déjà
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($Cible, [StringComparison]::OrdinalIgnoreCase) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Milliseconds 500

# 2. Copier le moteur et l'app (les données dans \data ne sont jamais touchées)
Write-Host '  Copie des fichiers...'
New-Item -ItemType Directory -Force -Path $Cible | Out-Null
foreach ($dossier in 'node', 'app') {
  $dest = Join-Path $Cible $dossier
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  Copy-Item (Join-Path $Source $dossier) -Destination $dest -Recurse -Force
}
Get-ChildItem $Cible -Recurse -File | Unblock-File

# 3. Icônes : Bureau et menu Démarrer. conhost --headless lance l'app sans fenêtre noire.
$shell = New-Object -ComObject WScript.Shell
foreach ($dossier in @($Bureau, $Menu)) {
  $raccourci = $shell.CreateShortcut((Join-Path $dossier 'Écran LED SRC.lnk'))
  $raccourci.TargetPath = Join-Path $env:WINDIR 'System32\conhost.exe'
  $raccourci.Arguments = "--headless `"$Cible\node\node.exe`" `"$Cible\app\lanceur.js`""
  $raccourci.WorkingDirectory = "$Cible\app"
  $raccourci.IconLocation = "$Cible\app\public\img\icone.ico"
  $raccourci.Description = 'Chrono et score de l''écran LED du SRC La Clayette'
  $raccourci.Save()
}
Write-Host '  Icône « Écran LED SRC » créée sur le Bureau.'

# 4. Pare-feu : autoriser les téléphones (réseaux privés uniquement). Demande une confirmation Windows.
if (-not $SansParefeu) {
  Write-Host '  Autorisation des téléphones dans le pare-feu (clique « Oui » dans la fenêtre Windows)...'
  $node = "$Cible\node\node.exe"
  $regle = "Remove-NetFirewallRule -DisplayName 'Ecran LED SRC' -ErrorAction SilentlyContinue; " +
    "New-NetFirewallRule -DisplayName 'Ecran LED SRC' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 " +
    "-Program '$node' -Profile Private,Domain | Out-Null"
  try {
    Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile', '-Command', $regle
    Write-Host '  Pare-feu : OK.'
  } catch {
    Write-Host '  Pare-feu non modifié. Au premier lancement, Windows posera la question : coche « Réseaux privés ».' -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host '  Installation terminée.' -ForegroundColor Green
Write-Host '  Pense à mettre le Wi-Fi du stade en « Réseau privé » (Paramètres > Réseau et Internet > Wi-Fi).'
Write-Host ''

# 5. Lancer l'app
if (-not $SansLancement) {
  Start-Process (Join-Path $env:WINDIR 'System32\conhost.exe') -ArgumentList '--headless', "`"$Cible\node\node.exe`"", "`"$Cible\app\lanceur.js`"" -WorkingDirectory "$Cible\app"
}
