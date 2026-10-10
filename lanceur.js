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
      await require('./maj').installer();
    } catch (err) {
      console.error('Mise à jour impossible (on garde la version actuelle) :', err.message || err);
    }
  }
  require('./server.js');
})();
