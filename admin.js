'use strict';
// Codes d'accès, jamais stockés en clair (scrypt + sel) :
// - le code administrateur : la régie et les spots depuis n'importe quel appareil du réseau
//   (indispensable sur le player Raspberry, qui n'a ni écran ni clavier pour la régie) ;
//   chaque connexion ouvre une session révocable ;
// - le code bénévoles : demandé avec le prénom après chaque scan du QR code (télécommande seulement).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSION_INACTIVE_MS = 7 * 24 * 3600 * 1000;

function hacher(code, sel) {
  return crypto.scryptSync(String(code), sel, 32).toString('hex');
}
function verifierHash(code, empreinte) {
  if (!empreinte || !empreinte.hash || typeof code !== 'string' || !code) return false;
  const essai = Buffer.from(hacher(code, empreinte.sel), 'hex');
  return crypto.timingSafeEqual(essai, Buffer.from(empreinte.hash, 'hex'));
}
function empreinteDe(code, min) {
  code = String(code || '');
  if (code.length < min) throw `Le code doit faire au moins ${min} caractères.`;
  if (code.length > 100) throw 'Code trop long.';
  const sel = crypto.randomBytes(16).toString('hex');
  return { sel, hash: hacher(code, sel) };
}

function creer(dossierData) {
  const fichier = path.join(dossierData, 'admin.json');
  let donnees = { sel: null, hash: null, benevoles: null, sessions: [] };
  try {
    donnees = { ...donnees, ...JSON.parse(fs.readFileSync(fichier, 'utf8')) };
  } catch {
    // pas encore de code
  }
  const sessions = new Map((donnees.sessions || []).map((s) => [s.id, s]));

  function sauver() {
    fs.mkdirSync(dossierData, { recursive: true });
    const tmp = fichier + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({
      sel: donnees.sel,
      hash: donnees.hash,
      benevoles: donnees.benevoles,
      sessions: [...sessions.values()],
    }));
    fs.renameSync(tmp, fichier);
  }

  // ---------- Code administrateur ----------
  const defini = () => !!donnees.hash;
  const verifier = (code) => verifierHash(code, donnees);

  // Nouveau code : toutes les sessions administrateur existantes sont fermées.
  function definir(code) {
    Object.assign(donnees, empreinteDe(code, 6));
    sessions.clear();
    sauver();
  }

  function ouvrirSession() {
    const s = { id: crypto.randomBytes(24).toString('base64url'), cree: Date.now(), vu: Date.now() };
    sessions.set(s.id, s);
    sauver();
    return s.id;
  }

  function session(id) {
    const s = id && sessions.get(id);
    if (!s) return null;
    if (Date.now() - s.vu > SESSION_INACTIVE_MS) {
      sessions.delete(id);
      sauver();
      return null;
    }
    s.vu = Date.now();
    return s;
  }

  function fermer(id) {
    if (sessions.delete(id)) sauver();
  }

  // ---------- Code bénévoles ----------
  const benevolesDefini = () => !!(donnees.benevoles && donnees.benevoles.hash);
  // Un seul code pour tout le monde : les bénévoles tapent le code administrateur.
  const verifierBenevoles = (code) => verifier(code);
  function definirBenevoles(code) {
    donnees.benevoles = empreinteDe(code, 4);
    sauver();
  }

  return { defini, verifier, definir, ouvrirSession, session, fermer, benevolesDefini, verifierBenevoles, definirBenevoles };
}

module.exports = { creer };
