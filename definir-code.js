'use strict';
// Définit ou change le code administrateur en ligne de commande (utilisé par l'installation du Raspberry).
// Usage : CODE_ADMIN="ton-code" ECRAN_LED_DATA=/chemin/data node definir-code.js
// L'app doit être arrêtée pendant l'opération.
const path = require('path');
const Admin = require('./admin');

const dossier = process.env.ECRAN_LED_DATA || path.join(__dirname, 'data');
const code = process.env.CODE_ADMIN;
if (!code) {
  console.error('Indique le code : CODE_ADMIN="ton-code" node definir-code.js');
  process.exit(1);
}
try {
  Admin.creer(dossier).definir(code);
  console.log('Code administrateur enregistré.');
} catch (m) {
  console.error(typeof m === 'string' ? m : m.message);
  process.exit(1);
}
