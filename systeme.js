'use strict';
// Tout ce qui touche à Windows : écrans branchés, navigateur (Edge ou Chrome),
// fenêtre de diffusion plein écran sur l'écran LED, profil du réseau Wi-Fi.
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

function powershell(script) {
  return new Promise((ok) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000 },
      (err, sortie) => ok(err ? '' : String(sortie)));
  });
}

function trouverNavigateur() {
  const e = process.env;
  const candidats = [
    [e['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'],
    [e.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'],
    [e.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'],
    [e.ProgramFiles, 'Google/Chrome/Application/chrome.exe'],
  ];
  for (const [base, relatif] of candidats) {
    if (base && fs.existsSync(path.join(base, relatif))) return path.join(base, relatif);
  }
  return null;
}

function lancerDetache(exe, args) {
  const p = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
  p.on('error', () => {});
  p.unref();
  return p;
}

// Ouvre une page dans une fenêtre « application » (sans barre d'adresse).
function ouvrirApp(url) {
  const nav = trouverNavigateur();
  if (nav) return lancerDetache(nav, [`--app=${url}`, '--window-size=1280,880']);
  lancerDetache('cmd.exe', ['/c', 'start', '', url]);
}

// Écrans branchés au PC (coordonnées Windows, mises à l'échelle comme le navigateur).
async function listerEcrans() {
  const sortie = await powershell(
    'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { ' +
      '"$($_.DeviceName)|$($_.Primary)|$($_.Bounds.X)|$($_.Bounds.Y)|$($_.Bounds.Width)|$($_.Bounds.Height)" }'
  );
  return sortie.split(/\r?\n/).filter(Boolean).map((ligne, i) => {
    const [id, principal, x, y, l, h] = ligne.split('|');
    return { id, numero: i + 1, principal: principal === 'True', x: +x, y: +y, l: +l, h: +h };
  });
}

// Fenêtre de diffusion : navigateur en mode kiosque (plein écran, sans bordure) sur l'écran choisi.
// Un profil de navigateur à part permet de la retrouver et de la fermer sans toucher au reste.
// Edge répartit la fenêtre sur plusieurs processus : on la retrouve par son profil.
function scriptProcessus(dossierProfil, action) {
  const motif = dossierProfil.replace(/'/g, "''");
  return "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' or Name='chrome.exe'\" | " +
    `Where-Object { $_.CommandLine -like '*${motif}*' } | ${action}`;
}
let diffusion = { active: false, verifie: 0 };

async function lancerDiffusion(url, ecran, dossierProfil) {
  await arreterDiffusion(dossierProfil);
  const nav = trouverNavigateur();
  if (!nav) throw 'Ni Edge ni Chrome trouvé sur ce PC.';
  const args = [
    `--user-data-dir=${dossierProfil}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--disable-features=Translate',
    '--autoplay-policy=no-user-gesture-required',
    `--window-position=${ecran.x},${ecran.y}`,
    `--window-size=${ecran.l},${ecran.h}`,
    '--kiosk',
  ];
  if (/msedge/i.test(nav)) args.push('--edge-kiosk-type=fullscreen');
  args.push(url);
  lancerDetache(nav, args);
  diffusion = { active: true, verifie: Date.now() };
}

async function arreterDiffusion(dossierProfil) {
  await powershell(scriptProcessus(dossierProfil, 'ForEach-Object { Stop-Process -Id $_.ProcessId -Force }'));
  diffusion = { active: false, verifie: Date.now() };
}

// Vérifie au plus toutes les 10 s si la fenêtre existe encore (quelqu'un a pu la fermer avec Alt+F4).
async function diffusionActive(dossierProfil) {
  if (Date.now() - diffusion.verifie > 10000) {
    const n = Number(await powershell(scriptProcessus(dossierProfil, 'Measure-Object | ForEach-Object { $_.Count }')));
    diffusion = { active: n > 0, verifie: Date.now() };
  }
  return diffusion.active;
}

// Réseaux en « Public » : Windows bloque alors les téléphones.
async function reseauxPublics() {
  const sortie = await powershell('Get-NetConnectionProfile | Where-Object NetworkCategory -eq Public | ForEach-Object { $_.Name }');
  return sortie.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

module.exports = { ouvrirApp, listerEcrans, lancerDiffusion, arreterDiffusion, diffusionActive, reseauxPublics };
