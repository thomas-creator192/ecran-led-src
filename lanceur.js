'use strict';
// Point d'entrée de l'app installée (icône du bureau sous Windows, service au démarrage sur le Raspberry) :
//   1. cherche une mise à jour sur GitHub (quelques secondes max, ignorée sans Internet) ;
//   2. démarre le serveur.
// Les données (score, réglages, téléphones autorisés, spots) sont rangées à côté de l'app,
// dans ../data, pour ne jamais être touchées par une mise à jour.
const fs = require('fs');
const path = require('path');

process.env.ECRAN_LED_DATA ||= path.resolve(__dirname, '..', 'data');
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

// Player Raspberry : le démarrage automatique de l'affichage pointe toujours vers le lanceur stable
// (installateur/demarrage-affichage.sh). L'app le corrige elle-même : rien à faire sur le Raspberry.
function verifierDemarrageAffichage() {
  if (process.platform !== 'linux') return;
  try {
    const os = require('os');
    const dossier = path.join(os.homedir(), '.config', 'autostart');
    const fichier = path.join(dossier, 'ecran-led.desktop');
    const voulu = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Écran LED SRC',
      `Exec=bash ${path.join(__dirname, 'installateur', 'demarrage-affichage.sh')}`,
      'X-GNOME-Autostart-enabled=true',
      '',
    ].join('\n');
    let actuel = '';
    try {
      actuel = fs.readFileSync(fichier, 'utf8');
    } catch {
      // pas encore de fichier
    }
    if (actuel !== voulu) {
      fs.mkdirSync(dossier, { recursive: true });
      fs.writeFileSync(fichier, voulu);
      console.log('Démarrage automatique de l’affichage mis à jour.');
    }
  } catch (err) {
    console.error('Démarrage automatique de l’affichage non modifié :', err.message);
  }
}

async function dejaLance() {
  try {
    await fetch(`http://localhost:${Number(process.env.PORT) || 8080}/api/moi`, { signal: AbortSignal.timeout(800) });
    return true;
  } catch {
    return false;
  }
}

(async () => {
  // Si l'app tourne déjà, on ne met rien à jour en plein match : le serveur rouvrira juste la régie.
  if (!(await dejaLance())) {
    try {
      // Player Raspberry : jusqu'à 30 s environ pour joindre GitHub (l'affichage, lui, attend jusqu'à 3 min).
      // PC Windows : un seul essai court, pour ne pas retarder l'ouverture de la régie.
      await require('./maj').installer(process.platform === 'linux'
        ? { delai: 8000, patience: 30000 }
        : { delai: 4000 });
    } catch (err) {
      console.error('Mise à jour impossible (on garde la version actuelle) :', err.message || err);
    }
  }
  verifierDemarrageAffichage();
  require('./server.js');
})();
