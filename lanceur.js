'use strict';
// Point d'entrée de l'app installée (icône « Écran LED SRC » du bureau) :
//   1. cherche une mise à jour sur GitHub (quelques secondes max, ignorée sans Internet) ;
//   2. démarre le serveur, qui ouvre la régie.
// Les données (score, réglages, téléphones autorisés) sont rangées à côté de l'app,
// dans ../data, pour ne jamais être touchées par une mise à jour.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DOSSIER_APP = __dirname;
process.env.ECRAN_LED_DATA ||= path.resolve(DOSSIER_APP, '..', 'data');
const DOSSIER_DATA = process.env.ECRAN_LED_DATA;
fs.mkdirSync(DOSSIER_DATA, { recursive: true });

// L'app tourne sans fenêtre : ses messages vont dans data/app.log.
const journal = fs.createWriteStream(path.join(DOSSIER_DATA, 'app.log'), { flags: 'a' });
for (const niveau of ['log', 'error']) {
  const original = console[niveau];
  console[niveau] = (...args) => {
    journal.write(`[${new Date().toISOString()}] ${args.map(String).join(' ')}\n`);
    original(...args);
  };
}

function plusRecente(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function dejaLance() {
  try {
    await fetch(`http://localhost:${Number(process.env.PORT) || 8080}/api/moi`, { signal: AbortSignal.timeout(800) });
    return true;
  } catch {
    return false;
  }
}

async function mettreAJour() {
  const conf = JSON.parse(fs.readFileSync(path.join(DOSSIER_APP, 'maj.json'), 'utf8'));
  if (!conf.depot) return;
  const branche = conf.branche || 'main';
  const distant = await fetch(`https://raw.githubusercontent.com/${conf.depot}/${branche}/package.json`, {
    signal: AbortSignal.timeout(4000),
  }).then((r) => (r.ok ? r.json() : null));
  const local = JSON.parse(fs.readFileSync(path.join(DOSSIER_APP, 'package.json'), 'utf8')).version;
  if (!distant || !plusRecente(distant.version, local)) return;

  console.log(`Mise à jour ${local} → ${distant.version}…`);
  const reponse = await fetch(`https://codeload.github.com/${conf.depot}/zip/refs/heads/${branche}`, {
    signal: AbortSignal.timeout(60000),
  });
  if (!reponse.ok) throw new Error(`téléchargement refusé (${reponse.status})`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ecran-led-'));
  try {
    const zip = path.join(tmp, 'maj.zip');
    const extrait = path.join(tmp, 'x');
    fs.writeFileSync(zip, Buffer.from(await reponse.arrayBuffer()));
    const q = (p) => `'${p.replace(/'/g, "''")}'`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath ${q(zip)} -DestinationPath ${q(extrait)} -Force`], { windowsHide: true });
    // GitHub range tout dans un sous-dossier « depot-branche ».
    const racine = fs.readdirSync(extrait).map((n) => path.join(extrait, n)).find((p) => fs.statSync(p).isDirectory());
    if (!racine || !fs.existsSync(path.join(racine, 'server.js'))) throw new Error('archive inattendue');
    // Tout est téléchargé et vérifié avant de toucher à l'app installée.
    fs.cpSync(racine, DOSSIER_APP, { recursive: true, force: true });
    console.log(`Mise à jour installée : version ${distant.version}.`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

(async () => {
  // Si l'app tourne déjà, on ne met rien à jour en plein match : le serveur rouvrira juste la régie.
  if (!(await dejaLance())) {
    try {
      await mettreAJour();
    } catch (err) {
      console.error('Mise à jour impossible (on garde la version actuelle) :', err.message || err);
    }
  }
  require('./server.js');
})();
