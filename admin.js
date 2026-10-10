'use strict';
// Accès administrateur : la régie et les spots depuis n'importe quel appareil du réseau, avec un code.
// Indispensable sur le player Raspberry, qui n'a ni écran ni clavier pour la régie.
// Le code n'est jamais stocké en clair (scrypt + sel) ; chaque connexion ouvre une session révocable.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSION_INACTIVE_MS = 7 * 24 * 3600 * 1000;

function hacher(code, sel) {
  return crypto.scryptSync(String(code), sel, 32).toString('hex');
}

function creer(dossierData) {
  const fichier = path.join(dossierData, 'admin.json');
  let donnees = { sel: null, hash: null, sessions: [] };
  try {
    donnees = { ...donnees, ...JSON.parse(fs.readFileSync(fichier, 'utf8')) };
  } catch {
    // pas encore de code administrateur
  }
  const sessions = new Map((donnees.sessions || []).map((s) => [s.id, s]));

  function sauver() {
    fs.mkdirSync(dossierData, { recursive: true });
    const tmp = fichier + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ sel: donnees.sel, hash: donnees.hash, sessions: [...sessions.values()] }));
    fs.renameSync(tmp, fichier);
  }

  const defini = () => !!donnees.hash;

  function verifier(code) {
    if (!defini() || typeof code !== 'string' || !code) return false;
    const essai = Buffer.from(hacher(code, donnees.sel), 'hex');
    return crypto.timingSafeEqual(essai, Buffer.from(donnees.hash, 'hex'));
  }

  // Nouveau code : toutes les sessions administrateur existantes sont fermées.
  function definir(code) {
    code = String(code || '');
    if (code.length < 6) throw 'Le code doit faire au moins 6 caractères.';
    if (code.length > 100) throw 'Code trop long.';
    donnees.sel = crypto.randomBytes(16).toString('hex');
    donnees.hash = hacher(code, donnees.sel);
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

  return { defini, verifier, definir, ouvrirSession, session, fermer };
}

module.exports = { creer };
