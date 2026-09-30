'use strict';
// Spots annonceurs : une bibliothèque de fichiers (vidéos, images) et une playlist
// diffusée en boucle sur l'écran LED, indépendamment du match.
// Les PDF sont convertis en images (une par page) par la page Spots avant l'envoi.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');

// Formats acceptés, vérifiés aussi par les premiers octets du fichier (pas seulement par son nom).
const FORMATS = {
  'video/mp4': { ext: '.mp4', type: 'video', signature: (b) => b.toString('latin1', 4, 8) === 'ftyp' },
  'video/webm': { ext: '.webm', type: 'video', signature: (b) => b.readUInt32BE(0) === 0x1a45dfa3 },
  'image/png': { ext: '.png', type: 'image', signature: (b) => b.readUInt32BE(0) === 0x89504e47 },
  'image/jpeg': { ext: '.jpg', type: 'image', signature: (b) => b[0] === 0xff && b[1] === 0xd8 },
  'image/webp': {
    ext: '.webp',
    type: 'image',
    signature: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  },
};
const TYPES_MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const TAILLE_MAX = 500 * 1024 * 1024;
const DUREE_IMAGE = 10;

function nombre(v, min, max, defaut) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaut;
}
function json(res, statut, corps) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corps));
}

function creer({ dossierData, surChangement }) {
  const dossier = path.join(dossierData, 'spots');
  const fichierEtat = path.join(dossierData, 'spots.json');
  let etat = { bibliotheque: [], playlist: [], actif: false };
  try {
    etat = { ...etat, ...JSON.parse(fs.readFileSync(fichierEtat, 'utf8')) };
  } catch {
    // aucun spot pour l'instant
  }

  function sauver() {
    fs.mkdirSync(dossierData, { recursive: true });
    const tmp = fichierEtat + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(etat));
    fs.renameSync(tmp, fichierEtat);
    surChangement();
  }

  const url = (s) => `/medias/${s.fichier}`;

  // Ce que reçoivent tous les écrans : la playlist prête à jouer.
  function publique() {
    const parId = new Map(etat.bibliotheque.map((s) => [s.id, s]));
    const playlist = etat.playlist
      .map((p) => {
        const s = parId.get(p.id);
        if (!s) return null;
        return { uid: p.uid, id: s.id, nom: s.nom, type: s.type, url: url(s), duree: s.type === 'video' ? s.duree : p.duree, l: s.l, h: s.h };
      })
      .filter(Boolean);
    return { actif: etat.actif && playlist.length > 0, playlist };
  }

  // Pour la page Spots : en plus, toute la bibliothèque.
  function complete() {
    return { ...publique(), bibliotheque: etat.bibliotheque.map((s) => ({ ...s, url: url(s) })) };
  }

  async function televerser(req, res, adresse) {
    const format = FORMATS[String(req.headers['content-type'] || '').split(';')[0].trim()];
    if (!format) return json(res, 415, { ok: false, message: 'Format non accepté : MP4, WebM, JPG, PNG, WebP ou PDF.' });
    const longueur = Number(req.headers['content-length']);
    if (!longueur || longueur > TAILLE_MAX) return json(res, 413, { ok: false, message: 'Fichier trop lourd (500 Mo maximum).' });

    fs.mkdirSync(dossier, { recursive: true });
    const id = crypto.randomBytes(8).toString('hex');
    const fichier = id + format.ext;
    const cible = path.join(dossier, fichier);
    const partiel = cible + '.part';
    let recu = 0;
    const limite = new Transform({
      transform(morceau, _enc, suite) {
        recu += morceau.length;
        suite(recu > TAILLE_MAX ? new Error('trop lourd') : null, morceau);
      },
    });
    try {
      await pipeline(req, limite, fs.createWriteStream(partiel));
      const debut = Buffer.alloc(16);
      const fd = fs.openSync(partiel, 'r');
      fs.readSync(fd, debut, 0, 16, 0);
      fs.closeSync(fd);
      if (!format.signature(debut)) throw new Error('signature');
      fs.renameSync(partiel, cible);
    } catch (err) {
      fs.rmSync(partiel, { force: true });
      const message = err.message === 'signature' ? 'Le contenu du fichier ne correspond pas à son format.' : 'Envoi interrompu.';
      return json(res, 400, { ok: false, message });
    }

    const q = adresse.searchParams;
    const spot = {
      id,
      fichier,
      nom: String(q.get('nom') || 'Sans nom').trim().slice(0, 80) || 'Sans nom',
      type: format.type,
      duree: format.type === 'video' ? nombre(q.get('duree'), 1, 3600, 10) : DUREE_IMAGE,
      l: nombre(q.get('l'), 0, 20000, 0),
      h: nombre(q.get('h'), 0, 20000, 0),
      taille: recu,
      ajoute: Date.now(),
    };
    etat.bibliotheque.unshift(spot);
    sauver();
    return json(res, 200, { ok: true, spot });
  }

  function trouverSpot(id) {
    const s = etat.bibliotheque.find((x) => x.id === id);
    if (!s) throw 'Spot introuvable.';
    return s;
  }
  function trouverLigne(uid) {
    const i = etat.playlist.findIndex((p) => p.uid === uid);
    if (i < 0) throw 'Ce spot n’est plus en diffusion.';
    return i;
  }

  const ACTIONS = {
    diffuser(d) {
      const s = trouverSpot(d.id);
      etat.playlist.push({ uid: crypto.randomBytes(6).toString('hex'), id: s.id, duree: DUREE_IMAGE });
    },
    retirer(d) {
      etat.playlist.splice(trouverLigne(d.uid), 1);
    },
    deplacer(d) {
      const i = trouverLigne(d.uid);
      const j = i + (Number(d.sens) < 0 ? -1 : 1);
      if (j < 0 || j >= etat.playlist.length) return;
      [etat.playlist[i], etat.playlist[j]] = [etat.playlist[j], etat.playlist[i]];
    },
    duree(d) {
      etat.playlist[trouverLigne(d.uid)].duree = nombre(d.duree, 1, 600, DUREE_IMAGE);
    },
    renommer(d) {
      const nom = String(d.nom || '').trim().slice(0, 80);
      if (nom) trouverSpot(d.id).nom = nom;
    },
    supprimer(d) {
      const s = trouverSpot(d.id);
      etat.bibliotheque = etat.bibliotheque.filter((x) => x.id !== s.id);
      etat.playlist = etat.playlist.filter((p) => p.id !== s.id);
      fs.rmSync(path.join(dossier, s.fichier), { force: true });
    },
    lancer() {
      if (!etat.playlist.length) throw 'Mets au moins un spot en diffusion.';
      etat.actif = true;
    },
    arreter() {
      etat.actif = false;
    },
  };

  function action(d) {
    const f = ACTIONS[d.action];
    if (!f) throw 'Action inconnue.';
    f(d);
    if (!etat.playlist.length) etat.actif = false;
    sauver();
  }

  // Arrêt demandé par le match (coup d'envoi, but, retour au score). Renvoie true si des spots passaient.
  function arreterPourLeMatch() {
    if (!etat.actif) return false;
    etat.actif = false;
    sauver();
    return true;
  }

  // Sert un fichier, avec prise en charge des « Range » (lecture vidéo fluide).
  function servir(req, res, nom) {
    if (!/^[0-9a-f]{16}\.(mp4|webm|png|jpg|webp)$/.test(nom)) return json(res, 404, { ok: false });
    const chemin = path.join(dossier, nom);
    let infos;
    try {
      infos = fs.statSync(chemin);
    } catch {
      return json(res, 404, { ok: false });
    }
    const entetes = {
      'Content-Type': TYPES_MIME[path.extname(nom)],
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=86400',
    };
    const plage = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (plage && (plage[1] || plage[2])) {
      let debut = plage[1] ? Number(plage[1]) : infos.size - Number(plage[2]);
      let fin = plage[1] && plage[2] ? Number(plage[2]) : infos.size - 1;
      debut = Math.max(0, debut);
      fin = Math.min(fin, infos.size - 1);
      if (debut > fin) {
        res.writeHead(416, { 'Content-Range': `bytes */${infos.size}` });
        return res.end();
      }
      res.writeHead(206, { ...entetes, 'Content-Range': `bytes ${debut}-${fin}/${infos.size}`, 'Content-Length': fin - debut + 1 });
      return fs.createReadStream(chemin, { start: debut, end: fin }).pipe(res);
    }
    res.writeHead(200, { ...entetes, 'Content-Length': infos.size });
    fs.createReadStream(chemin).pipe(res);
  }

  return { publique, complete, televerser, action, arreterPourLeMatch, servir };
}

module.exports = { creer };
