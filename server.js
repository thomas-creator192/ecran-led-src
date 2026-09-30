'use strict';
// Serveur de l'écran LED du SRC La Clayette.
// Il garde l'état du match (score, chrono, écran affiché) et le diffuse en direct
// à l'écran LED, à la régie et aux téléphones des bénévoles.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const systeme = require('./systeme');

const VERSION = require('./package.json').version;

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC = path.join(__dirname, 'public');
// Installé : les données sont à côté de l'app (voir lanceur.js), pour survivre aux mises à jour.
const DOSSIER_DATA = process.env.ECRAN_LED_DATA || path.join(__dirname, 'data');
const FICHIER_ETAT = path.join(DOSSIER_DATA, 'etat.json');

const NOMS_PERIODE = { 1: '1re mi-temps', 2: '2e mi-temps', 3: 'prolongation 1', 4: 'prolongation 2' };
const REGLAGES_DEFAUT = {
  nomDom: 'SRC',
  nomExt: 'VISITEUR',
  dureeMT: 45,
  dureeProl: 15,
  // « plein » : l'affichage occupe toute la fenêtre. « zone » : seulement un rectangle
  // (utile quand l'écran LED ne recopie qu'un coin du bureau Windows).
  zone: { mode: 'plein', x: 0, y: 0, l: 384, h: 128 },
  ecranLed: null, // écran Windows choisi pour la diffusion
};
// Deux bénévoles qui appuient sur « BUT » pour le même but ne doivent pas compter 2 buts.
const ANTI_DOUBLE_BUT_MS = 10000;
// Actions qui changent de phase : refusées si quelqu'un d'autre vient déjà de les faire.
const ACTIONS_GARDEES = new Set(['coup_envoi', 'fin_periode', 'fin_match', 'nouveau_match']);

function matchVierge() {
  return {
    phase: 'avant', // avant | jeu | pause | fin
    periode: 0, // 1 et 2 = mi-temps, 3 et 4 = prolongations
    chrono: { enCours: false, debut: null, cumul: 0 },
    score: { dom: 0, ext: 0 },
    tempsAdd: null,
    but: null, // dernier but, déclenche l'animation sur l'écran
    ecran: 'score', // score | logo
  };
}
const CLES_MATCH = Object.keys(matchVierge());

let etat = { ...matchVierge(), reglages: structuredClone(REGLAGES_DEFAUT), journal: [] };
let code = nouveauCode();
let historique = []; // pour « Annuler » : [{ match, libelle }]
const dernierBut = { dom: 0, ext: 0 };
const clients = new Set(); // { res, complet }
// Téléphones autorisés : une session par appareil, révocable depuis la régie.
const sessions = new Map(); // id → { id, prenom, cree, vu }
const SESSION_INACTIVE_MS = 24 * 3600 * 1000;

function nouveauCode() {
  return crypto.randomBytes(8).toString('hex');
}

function charger() {
  let d;
  try {
    d = JSON.parse(fs.readFileSync(FICHIER_ETAT, 'utf8'));
  } catch {
    return; // premier lancement
  }
  const e = d.etat || {};
  const r = e.reglages || {};
  etat = {
    ...matchVierge(),
    ...e,
    reglages: { ...REGLAGES_DEFAUT, ...r, zone: { ...REGLAGES_DEFAUT.zone, ...r.zone } },
    journal: e.journal || [],
  };
  if (d.code) code = d.code;
  for (const s of d.sessions || []) sessions.set(s.id, s);
}

function sauver() {
  fs.mkdirSync(DOSSIER_DATA, { recursive: true });
  const tmp = FICHIER_ETAT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ etat, code, sessions: [...sessions.values()] }));
  fs.renameSync(tmp, FICHIER_ETAT);
}

// ---------- Logique du match ----------

function ecoule(c) {
  return c.cumul + (c.enCours ? Date.now() - c.debut : 0);
}
function arreter(c) {
  c.cumul = ecoule(c);
  c.enCours = false;
  c.debut = null;
}
function equipe(d) {
  if (d.equipe !== 'dom' && d.equipe !== 'ext') throw 'Équipe inconnue.';
  return d.equipe;
}
function nomEquipe(eq) {
  return eq === 'dom' ? etat.reglages.nomDom : etat.reglages.nomExt;
}
function scoreTexte() {
  return `${etat.reglages.nomDom} ${etat.score.dom}-${etat.score.ext} ${etat.reglages.nomExt}`;
}
function duree(ms) {
  const s = Math.round(Math.abs(ms) / 1000);
  return s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s} s`;
}

const ACTIONS = {
  coup_envoi() {
    if (etat.phase === 'jeu') throw 'Le chrono tourne déjà.';
    if (etat.phase === 'fin') throw 'Le match est terminé : lance un nouveau match.';
    const p = etat.periode + 1;
    if (p > 4 || (p > 2 && !etat.reglages.dureeProl)) throw 'Plus de période à jouer.';
    Object.assign(etat, {
      periode: p,
      phase: 'jeu',
      chrono: { enCours: true, debut: Date.now(), cumul: 0 },
      tempsAdd: null,
      ecran: 'score',
    });
    return `Coup d'envoi de la ${NOMS_PERIODE[p]}`;
  },
  fin_periode() {
    if (etat.phase !== 'jeu') throw 'Aucune période en cours.';
    arreter(etat.chrono);
    etat.phase = etat.periode >= 4 ? 'fin' : 'pause';
    etat.tempsAdd = null;
    return `Fin de la ${NOMS_PERIODE[etat.periode]}`;
  },
  fin_match() {
    if (etat.phase !== 'jeu' && etat.phase !== 'pause') throw 'Aucun match en cours.';
    arreter(etat.chrono);
    etat.phase = 'fin';
    etat.tempsAdd = null;
    return `Fin du match : ${scoreTexte()}`;
  },
  chrono_pause() {
    if (!etat.chrono.enCours) throw 'Le chrono est déjà arrêté.';
    arreter(etat.chrono);
    return 'Chrono mis en pause';
  },
  chrono_reprise() {
    if (etat.phase !== 'jeu') throw 'Aucune période en cours.';
    if (etat.chrono.enCours) throw 'Le chrono tourne déjà.';
    etat.chrono.enCours = true;
    etat.chrono.debut = Date.now();
    return 'Chrono relancé';
  },
  ajuster(d) {
    const delta = Number(d.delta);
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 3600000) throw 'Correction invalide.';
    if (etat.phase !== 'jeu' && etat.phase !== 'pause') throw 'Aucune période à corriger.';
    const c = etat.chrono;
    c.cumul = Math.max(0, ecoule(c) + delta);
    if (c.enCours) c.debut = Date.now();
    return `Chrono corrigé : ${delta > 0 ? '+' : '−'}${duree(delta)}`;
  },
  but(d) {
    const eq = equipe(d);
    if (Date.now() - dernierBut[eq] < ANTI_DOUBLE_BUT_MS) throw `But ${nomEquipe(eq)} déjà compté à l'instant.`;
    dernierBut[eq] = Date.now();
    etat.score[eq]++;
    etat.but = { equipe: eq, id: crypto.randomUUID(), t: Date.now() };
    etat.ecran = 'score';
    return `BUT ${nomEquipe(eq)} ! ${scoreTexte()}`;
  },
  score(d) {
    const eq = equipe(d);
    const delta = Number(d.delta) > 0 ? 1 : -1;
    if (etat.score[eq] + delta < 0) throw 'Le score est déjà à 0.';
    etat.score[eq] += delta;
    return `Score corrigé : ${scoreTexte()}`;
  },
  temps_add(d) {
    const m = d.minutes == null ? 0 : Number(d.minutes);
    if (!Number.isInteger(m) || m < 0 || m > 20) throw 'Temps additionnel invalide.';
    etat.tempsAdd = m || null;
    return m ? `Temps additionnel annoncé : +${m}` : 'Temps additionnel retiré';
  },
  ecran(d) {
    if (d.mode !== 'score' && d.mode !== 'logo') throw 'Écran inconnu.';
    etat.ecran = d.mode;
    return d.mode === 'logo' ? 'Écran : logo du club' : 'Écran : score';
  },
  nouveau_match() {
    Object.assign(etat, matchVierge());
    dernierBut.dom = dernierBut.ext = 0;
    return 'Nouveau match (0-0)';
  },
};

function photo() {
  return structuredClone(Object.fromEntries(CLES_MATCH.map((k) => [k, etat[k]])));
}

function noter(qui, texte) {
  etat.journal.unshift({ t: Date.now(), qui, texte });
  etat.journal.length = Math.min(etat.journal.length, 60);
  sauver();
  diffuser();
}

function executer(d, qui) {
  if (d.type === 'annuler') {
    const h = historique.pop();
    if (!h) throw 'Rien à annuler.';
    Object.assign(etat, h.match);
    dernierBut.dom = dernierBut.ext = 0;
    return noter(qui, `Annulé : ${h.libelle}`);
  }
  const action = ACTIONS[d.type];
  if (!action) throw 'Action inconnue.';
  if (ACTIONS_GARDEES.has(d.type) && d.attendu && d.attendu !== `${etat.phase}:${etat.periode}`) {
    throw "Quelqu'un vient déjà de le faire : l'écran est à jour.";
  }
  const avant = photo();
  const libelle = action(d);
  historique.push({ match: avant, libelle });
  if (historique.length > 50) historique.shift();
  noter(qui, libelle);
}

function appliquerReglages(d) {
  const r = etat.reglages;
  const z = d.zone || {};
  const entier = (v, min, max, def) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const nom = (v, def) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 12).toUpperCase() : def);
  etat.reglages = {
    nomDom: nom(d.nomDom, r.nomDom),
    nomExt: nom(d.nomExt, r.nomExt),
    dureeMT: entier(d.dureeMT, 1, 60, r.dureeMT),
    dureeProl: entier(d.dureeProl, 0, 30, r.dureeProl),
    zone: {
      mode: z.mode === 'zone' ? 'zone' : 'plein',
      x: entier(z.x, 0, 20000, r.zone.x),
      y: entier(z.y, 0, 20000, r.zone.y),
      l: entier(z.l, 16, 20000, r.zone.l),
      h: entier(z.h, 16, 20000, r.zone.h),
    },
    ecranLed: r.ecranLed,
  };
  noter('Régie', 'Réglages modifiés');
}

// ---------- Diffusion en direct (Server-Sent Events) ----------

// Le journal (prénoms des bénévoles) n'est envoyé qu'aux appareils autorisés.
function message(complet) {
  const dernier = historique[historique.length - 1];
  return JSON.stringify({
    etat: complet ? etat : { ...etat, journal: [] },
    maintenant: Date.now(),
    annulable: complet && dernier ? dernier.libelle : null,
  });
}
function diffuser() {
  const messages = { true: `data: ${message(true)}\n\n`, false: `data: ${message(false)}\n\n` };
  for (const c of clients) c.res.write(messages[c.complet]);
}
// Renvoyé régulièrement : garde la connexion ouverte et recale l'horloge des écrans.
setInterval(diffuser, 15000);

// ---------- Accès ----------
// - La régie (et tout ce qui touche au PC) ne répond qu'au PC lui-même.
// - Un téléphone n'est autorisé qu'après avoir scanné le QR code : il reçoit alors
//   sa propre session (cookie), qui expire après 24 h sans activité et que la régie peut révoquer.
// - Les requêtes venant d'un autre site (Origin/Host inattendus) sont refusées.

function estLocal(req) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
}
function cookies(req) {
  const liste = {};
  for (const morceau of (req.headers.cookie || '').split(';')) {
    const i = morceau.indexOf('=');
    if (i > 0) liste[morceau.slice(0, i).trim()] = morceau.slice(i + 1).trim();
  }
  return liste;
}
function sessionDe(req) {
  const id = cookies(req).session;
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
function autorise(req) {
  return estLocal(req) || !!sessionDe(req);
}

function adresses() {
  const liste = [];
  for (const [nom, infos] of Object.entries(os.networkInterfaces())) {
    for (const i of infos || []) {
      if (i.family === 'IPv4' && !i.internal) liste.push({ nom, adresse: i.address });
    }
  }
  const wifi = (a) => (/wi-?fi|wlan|sans fil|wireless/i.test(a.nom) ? 0 : 1);
  return liste.sort((a, b) => wifi(a) - wifi(b));
}

// Protège contre les sites web malveillants ouverts sur le PC ou un téléphone
// (DNS rebinding, requêtes forgées depuis une autre page).
function hoteValide(req) {
  const hote = String(req.headers.host || '').toLowerCase();
  const permis = ['localhost', '127.0.0.1', '[::1]', ...adresses().map((a) => a.adresse)].map((h) => `${h}:${PORT}`);
  return permis.includes(hote);
}
function origineValide(req) {
  const origine = req.headers.origin;
  return !origine || origine === `http://${req.headers.host}`;
}

// Limite les essais de code : 20 échecs en 10 minutes par adresse, puis blocage.
const echecs = new Map();
function tropDEchecs(ip) {
  const e = echecs.get(ip);
  return e && Date.now() - e.debut < 600000 && e.n >= 20;
}
function noterEchec(ip) {
  const e = echecs.get(ip);
  if (!e || Date.now() - e.debut >= 600000) echecs.set(ip, { debut: Date.now(), n: 1 });
  else e.n++;
}

// ---------- HTTP ----------

const ENTETES_SECURITE = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self'; connect-src 'self'; frame-ancestors 'self'; form-action 'self'",
};

function json(res, statut, corps) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corps));
}
function texte(res, statut, t) {
  res.writeHead(statut, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(t);
}
function rediriger(res, lieu, entetes = {}) {
  res.writeHead(302, { Location: lieu, 'Cache-Control': 'no-store', ...entetes });
  res.end();
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};
function fichier(res, relatif) {
  const complet = path.resolve(PUBLIC, relatif);
  if (!complet.startsWith(PUBLIC + path.sep)) return texte(res, 404, 'Introuvable');
  fs.readFile(complet, (err, contenu) => {
    if (err) return texte(res, 404, 'Introuvable');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(complet).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(contenu);
  });
}

function lireJson(req) {
  return new Promise((ok) => {
    let corps = '';
    req.on('data', (c) => {
      corps += c;
      if (corps.length > 10000) req.destroy();
    });
    req.on('end', () => {
      try {
        ok(JSON.parse(corps || '{}'));
      } catch {
        ok({});
      }
    });
  });
}

function flux(req, res) {
  const client = { res, complet: autorise(req) };
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`retry: 1000\ndata: ${message(client.complet)}\n\n`);
  clients.add(client);
  req.on('close', () => clients.delete(client));
}

const PROFIL_DIFFUSION = () => path.join(DOSSIER_DATA, 'navigateur-ecran');
const URL_ECRAN = `http://localhost:${PORT}/ecran`;

function listeSessions() {
  return [...sessions.values()]
    .sort((a, b) => b.vu - a.vu)
    .map(({ id, prenom, cree, vu }) => ({ id, prenom, cree, vu }));
}

async function router(req, res) {
  for (const [k, v] of Object.entries(ENTETES_SECURITE)) res.setHeader(k, v);
  if (!hoteValide(req)) return texte(res, 421, 'Adresse non reconnue.');

  const url = new URL(req.url, 'http://local');
  const p = url.pathname;
  const local = estLocal(req);

  if (req.method === 'GET') {
    if (p === '/') return rediriger(res, local ? '/regie' : '/telecommande');
    if (p === '/regie') {
      return local ? fichier(res, 'regie.html') : texte(res, 403, 'La régie ne s’ouvre que sur le PC qui fait tourner le serveur.');
    }
    if (p === '/ecran') return fichier(res, 'ecran.html');
    if (p === '/telecommande') return fichier(res, 'telecommande.html');
    if (p === '/connexion') {
      const ip = req.socket.remoteAddress;
      if (tropDEchecs(ip)) return texte(res, 429, 'Trop d’essais. Réessaie dans 10 minutes.');
      const donne = String(url.searchParams.get('code') || '');
      const bon = donne.length === code.length && crypto.timingSafeEqual(Buffer.from(donne), Buffer.from(code));
      if (!bon) {
        noterEchec(ip);
        return rediriger(res, '/telecommande?refuse=1');
      }
      const s = { id: crypto.randomBytes(24).toString('base64url'), prenom: '', cree: Date.now(), vu: Date.now() };
      sessions.set(s.id, s);
      sauver();
      return rediriger(res, '/telecommande', {
        'Set-Cookie': `session=${s.id}; Path=/; Max-Age=${7 * 86400}; SameSite=Lax; HttpOnly`,
      });
    }
    if (p === '/api/flux') return flux(req, res);
    if (p === '/api/moi') {
      const s = sessionDe(req);
      return json(res, 200, { autorise: local || !!s, local, prenom: s ? s.prenom : '' });
    }
    if (/^\/(img|js|css|videos)\//.test(p)) return fichier(res, decodeURIComponent(p.slice(1)));

    // --- Réservé au PC de régie ---
    if (!local) return texte(res, 403, 'Refusé');
    if (p === '/api/regie') {
      return json(res, 200, {
        version: VERSION,
        adresses: adresses(),
        port: PORT,
        code,
        sessions: listeSessions(),
        diffusion: await systeme.diffusionActive(PROFIL_DIFFUSION()),
      });
    }
    if (p === '/api/systeme') {
      const [ecrans, publics] = await Promise.all([systeme.listerEcrans(), systeme.reseauxPublics()]);
      return json(res, 200, { ecrans, reseauxPublics: publics });
    }
    if (p === '/api/qr.svg') {
      const ip = url.searchParams.get('ip');
      if (!adresses().some((a) => a.adresse === ip)) return texte(res, 400, 'Adresse inconnue');
      const svg = await QRCode.toString(`http://${ip}:${PORT}/connexion?code=${code}`, { type: 'svg', margin: 2 });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
      return res.end(svg);
    }
    return texte(res, 404, 'Introuvable');
  }

  if (req.method === 'POST') {
    // Seul du JSON envoyé par nos propres pages est accepté (bloque les formulaires d'autres sites).
    if (!origineValide(req) || !String(req.headers['content-type'] || '').startsWith('application/json')) {
      return json(res, 403, { ok: false, message: 'Requête refusée.' });
    }
    const d = await lireJson(req);

    if (p === '/api/action') {
      const s = sessionDe(req);
      if (!local && !s) {
        return json(res, 403, { ok: false, refuse: true, message: 'Accès refusé : scanne le QR code de la régie.' });
      }
      const qui = s ? s.prenom || 'Téléphone' : 'Régie';
      try {
        executer(d, qui);
      } catch (m) {
        if (typeof m !== 'string') throw m;
        return json(res, 409, { ok: false, message: m });
      }
      return json(res, 200, { ok: true });
    }
    if (p === '/api/prenom') {
      const s = sessionDe(req);
      if (!s) return json(res, 403, { ok: false, refuse: !local });
      s.prenom = String(d.prenom || '').trim().slice(0, 20);
      sauver();
      return json(res, 200, { ok: true });
    }

    // --- Réservé au PC de régie ---
    if (!local) return json(res, 403, { ok: false });
    if (p === '/api/reglages') {
      appliquerReglages(d);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/nouveau-code') {
      // Nouveau QR code : tous les téléphones sont déconnectés.
      code = nouveauCode();
      sessions.clear();
      noter('Régie', 'Nouveau code : téléphones déconnectés');
      return json(res, 200, { ok: true });
    }
    if (p === '/api/sessions/revoquer') {
      const s = sessions.get(d.id);
      if (s) {
        sessions.delete(d.id);
        noter('Régie', `Accès retiré : ${s.prenom || 'téléphone sans prénom'}`);
      }
      return json(res, 200, { ok: true });
    }
    if (p === '/api/diffusion') {
      const ecrans = await systeme.listerEcrans();
      const ecran = ecrans.find((e) => e.id === d.ecran) || ecrans.find((e) => !e.principal) || ecrans[0];
      if (!ecran) return json(res, 500, { ok: false, message: 'Aucun écran détecté.' });
      try {
        await systeme.lancerDiffusion(URL_ECRAN, ecran, PROFIL_DIFFUSION());
      } catch (m) {
        if (typeof m !== 'string') throw m;
        return json(res, 500, { ok: false, message: m });
      }
      etat.reglages.ecranLed = ecran.id;
      noter('Régie', `Diffusion lancée sur l'écran ${ecran.numero}`);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/diffusion/arret') {
      await systeme.arreterDiffusion(PROFIL_DIFFUSION());
      noter('Régie', 'Diffusion arrêtée');
      return json(res, 200, { ok: true });
    }
    if (p === '/api/quitter') {
      json(res, 200, { ok: true });
      await systeme.arreterDiffusion(PROFIL_DIFFUSION());
      console.log('Arrêt demandé depuis la régie.');
      setTimeout(() => process.exit(0), 300);
      return;
    }
  }
  return texte(res, 404, 'Introuvable');
}

// ---------- Démarrage ----------

charger();
const serveur = http.createServer((req, res) => {
  router(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) json(res, 500, { ok: false, message: 'Erreur du serveur.' });
  });
});

function ouvrirRegie() {
  if (process.argv.includes('--sans-navigateur') || process.platform !== 'win32') return;
  systeme.ouvrirApp(`http://localhost:${PORT}/regie`);
}

serveur.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Déjà lancé (double-clic sur l'icône alors que l'app tourne) : on rouvre juste la régie.
    console.log(`Le serveur tourne déjà (port ${PORT}). J'ouvre la régie.`);
    ouvrirRegie();
    setTimeout(() => process.exit(0), 1500);
    return;
  }
  throw err;
});

serveur.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log(`  Écran LED — SRC La Clayette (version ${VERSION})`);
  console.log(`  Régie (sur ce PC) : http://localhost:${PORT}/regie`);
  for (const a of adresses()) console.log(`  Réseau ${a.nom} : http://${a.adresse}:${PORT}`);
  console.log('');
  ouvrirRegie();
});
