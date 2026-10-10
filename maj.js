'use strict';
// Mises à jour depuis GitHub (dépôt indiqué dans maj.json).
// Utilisé au démarrage (lanceur.js) et, sur le player Raspberry, la nuit (server.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DOSSIER_APP = __dirname;

function lireJson(fichier) {
  return JSON.parse(fs.readFileSync(path.join(DOSSIER_APP, fichier), 'utf8'));
}
function config() {
  try {
    return lireJson('maj.json');
  } catch {
    return {};
  }
}
const versionLocale = () => lireJson('package.json').version;

function plusRecente(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

// Renvoie le numéro de la version disponible sur GitHub si elle est plus récente, sinon null.
async function nouvelleVersion() {
  const conf = config();
  if (!conf.depot) return null;
  const r = await fetch(`https://raw.githubusercontent.com/${conf.depot}/${conf.branche || 'main'}/package.json`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) return null;
  const distante = (await r.json()).version;
  return plusRecente(distante, versionLocale()) ? distante : null;
}

function extraire(zip, destination) {
  if (process.platform === 'win32') {
    const q = (p) => `'${p.replace(/'/g, "''")}'`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath ${q(zip)} -DestinationPath ${q(destination)} -Force`], { windowsHide: true });
  } else {
    execFileSync('unzip', ['-q', '-o', zip, '-d', destination]);
  }
}

// Télécharge et installe la nouvelle version. Renvoie son numéro, ou null s'il n'y en a pas.
async function installer() {
  const version = await nouvelleVersion();
  if (!version) return null;
  const conf = config();
  console.log(`Mise à jour ${versionLocale()} → ${version}…`);
  const reponse = await fetch(`https://codeload.github.com/${conf.depot}/zip/refs/heads/${conf.branche || 'main'}`, {
    signal: AbortSignal.timeout(120000),
  });
  if (!reponse.ok) throw new Error(`téléchargement refusé (${reponse.status})`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ecran-led-'));
  try {
    const zip = path.join(tmp, 'maj.zip');
    const extrait = path.join(tmp, 'x');
    fs.writeFileSync(zip, Buffer.from(await reponse.arrayBuffer()));
    extraire(zip, extrait);
    // GitHub range tout dans un sous-dossier « depot-branche ».
    const racine = fs.readdirSync(extrait).map((n) => path.join(extrait, n)).find((p) => fs.statSync(p).isDirectory());
    if (!racine || !fs.existsSync(path.join(racine, 'server.js'))) throw new Error('archive inattendue');
    // Tout est téléchargé et vérifié avant de toucher à l'app installée.
    fs.cpSync(racine, DOSSIER_APP, { recursive: true, force: true });
    console.log(`Mise à jour installée : version ${version}.`);
    return version;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { installer, nouvelleVersion, versionLocale };
