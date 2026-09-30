// Page « Spots annonceurs » : bibliothèque de fichiers et playlist de l'écran LED.
import * as pdfjs from '/vendor/pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';

const $ = (id) => document.getElementById(id);
const FORMAT_LED = 3; // l'écran fait 288 × 96 : largeur = 3 × hauteur
let spots = { actif: false, playlist: [], bibliotheque: [] };
let spotOuvert = null;

// ---------- Petits outils ----------
let minuteurToast;
function toast(texte, erreur = false) {
  const t = $('toast');
  t.textContent = texte;
  t.classList.toggle('erreur', erreur);
  t.classList.add('visible');
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => t.classList.remove('visible'), erreur ? 4500 : 2200);
}
function el(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte != null) e.textContent = texte;
  return e;
}
function duree(s) {
  return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}` : `${s} s`;
}
function avisFormat(s) {
  if (!s.l || !s.h) return '';
  const r = s.l / s.h;
  if (Math.abs(r - FORMAT_LED) / FORMAT_LED < 0.05) return '';
  return r < FORMAT_LED ? 'bandes noires à gauche et à droite' : 'bandes noires en haut et en bas';
}

async function agir(donnees) {
  const r = await Commun.poster('/api/spots', donnees);
  if (!r.ok) toast(r.message, true);
  await charger();
  return r.ok;
}

// ---------- Affichage ----------
function rendreEtat() {
  const total = spots.playlist.reduce((t, p) => t + p.duree, 0);
  $('etat-spots').classList.toggle('en-cours', spots.actif);
  $('etat-texte').textContent = spots.actif
    ? `Les spots annonceurs (${spots.playlist.length} spot${spots.playlist.length > 1 ? 's' : ''}, boucle de ${duree(total)})`
    : 'Le match (score et chrono)';
  $('lancer').hidden = spots.actif;
  $('arreter').hidden = !spots.actif;
  $('lancer').disabled = !spots.playlist.length;
  $('boucle').textContent = spots.playlist.length ? `Boucle de ${duree(total)}` : '';
}

function vignette(s) {
  const v = el('div', 'vignette');
  const m = s.type === 'video' ? el('video') : el('img');
  if (s.type === 'video') {
    m.src = s.url + '#t=1';
    m.muted = true;
    m.preload = 'metadata';
  } else {
    m.src = s.url;
    m.alt = '';
  }
  v.append(m);
  return v;
}

function rendreBibliotheque() {
  const liste = $('bibliotheque');
  if (!spots.bibliotheque.length) {
    return liste.replaceChildren(el('li', 'vide', 'Aucun spot pour l’instant : ajoute tes premiers fichiers ci-dessus.'));
  }
  const enDiffusion = new Map();
  for (const p of spots.playlist) enDiffusion.set(p.id, (enDiffusion.get(p.id) || 0) + 1);

  liste.replaceChildren(...spots.bibliotheque.map((s) => {
    const li = el('li', 'carte-spot');
    li.title = 'Cliquer pour voir l’aperçu';
    li.onclick = () => ouvrirApercu(s);

    const infos = el('div', 'infos-spot');
    infos.append(el('strong', 'nom-spot', (s.type === 'video' ? '🎬 ' : '🖼 ') + s.nom));
    const details = el('span', 'details-spot', `${s.type === 'video' ? duree(s.duree) : 'image'} · ${s.l} × ${s.h}`);
    infos.append(details);
    const avis = avisFormat(s);
    if (avis) infos.append(el('span', 'avis-format', `⚠ Pas au format de l’écran : ${avis}`));
    if (enDiffusion.get(s.id)) infos.append(el('span', 'badge', 'En diffusion'));

    const actions = el('div', 'actions-spot');
    const voir = el('button', 'court', '👁');
    voir.title = 'Aperçu';
    const diffuser = el('button', 'court primaire', '＋ Diffuser');
    diffuser.title = 'Mettre en diffusion';
    diffuser.onclick = async (ev) => {
      ev.stopPropagation();
      if (await agir({ action: 'diffuser', id: s.id })) toast(`« ${s.nom} » ajouté à la diffusion`);
    };
    const suppr = el('button', 'court danger', '🗑');
    suppr.title = 'Supprimer de l’outil';
    suppr.onclick = async (ev) => {
      ev.stopPropagation();
      if (!confirm(`Supprimer définitivement « ${s.nom} » de l’outil ?`)) return;
      await agir({ action: 'supprimer', id: s.id });
    };
    actions.append(voir, diffuser, suppr);

    li.append(vignette(s), infos, actions);
    return li;
  }));
}

function rendrePlaylist() {
  const liste = $('playlist');
  if (!spots.playlist.length) {
    return liste.replaceChildren(el('li', 'vide', 'Rien en diffusion. Clique sur « ＋ Diffuser » à côté d’un spot.'));
  }
  liste.replaceChildren(...spots.playlist.map((p, i) => {
    const li = el('li', 'ligne-playlist');
    li.append(el('span', 'rang', String(i + 1)));
    li.append(el('span', 'nom-spot', p.nom));

    const d = el('span', 'duree-spot');
    if (p.type === 'image') {
      const champ = el('input');
      champ.type = 'number';
      champ.min = 1;
      champ.max = 600;
      champ.value = p.duree;
      champ.title = 'Durée d’affichage en secondes';
      champ.onchange = () => agir({ action: 'duree', uid: p.uid, duree: champ.value });
      d.append(champ, ' s');
    } else {
      d.textContent = duree(p.duree);
    }
    li.append(d);

    const monter = el('button', 'court', '↑');
    monter.title = 'Monter';
    monter.disabled = i === 0;
    monter.onclick = () => agir({ action: 'deplacer', uid: p.uid, sens: -1 });
    const descendre = el('button', 'court', '↓');
    descendre.title = 'Descendre';
    descendre.disabled = i === spots.playlist.length - 1;
    descendre.onclick = () => agir({ action: 'deplacer', uid: p.uid, sens: 1 });
    const retirer = el('button', 'court danger', 'Retirer');
    retirer.title = 'Retirer de la diffusion (le spot reste dans « Mes spots »)';
    retirer.onclick = () => agir({ action: 'retirer', uid: p.uid });
    li.append(monter, descendre, retirer);
    return li;
  }));
}

async function charger() {
  const r = await fetch('/api/spots');
  if (!r.ok) return;
  spots = await r.json();
  rendreEtat();
  rendreBibliotheque();
  rendrePlaylist();
}

// ---------- Aperçu au format de l'écran ----------
function ouvrirApercu(s) {
  spotOuvert = s;
  $('modale-titre').textContent = s.nom;
  const media = s.type === 'video' ? el('video') : el('img');
  media.src = s.url;
  if (s.type === 'video') {
    media.muted = true;
    media.autoplay = true;
    media.loop = true;
    media.playsInline = true;
  }
  $('modale-ecran').replaceChildren(media);
  const avis = avisFormat(s);
  $('modale-infos').textContent =
    `Fichier : ${s.l} × ${s.h}${s.type === 'video' ? ' · ' + duree(s.duree) : ''}. Écran LED : 288 × 96 (format 3:1).` +
    (avis ? ` Sur l’écran : ${avis}.` : ' Format parfait pour l’écran.');
  $('modale').classList.add('visible');
}
function fermerApercu() {
  $('modale').classList.remove('visible');
  $('modale-ecran').replaceChildren();
  spotOuvert = null;
}
$('modale-fermer').onclick = fermerApercu;
$('modale').onclick = (ev) => { if (ev.target === $('modale')) fermerApercu(); };
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fermerApercu(); });
$('modale-diffuser').onclick = async () => {
  const s = spotOuvert;
  if (s && await agir({ action: 'diffuser', id: s.id })) toast(`« ${s.nom} » ajouté à la diffusion`);
  fermerApercu();
};

// ---------- Diffusion ----------
$('lancer').onclick = () => agir({ action: 'lancer' });
$('arreter').onclick = () => agir({ action: 'arreter' });

// ---------- Envoi des fichiers ----------
const ACCEPTES = ['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'];

function mesurer(fichier) {
  return new Promise((ok, echec) => {
    const lien = URL.createObjectURL(fichier);
    const fin = (r) => { URL.revokeObjectURL(lien); r ? ok(r) : echec(); };
    if (fichier.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => fin({ l: v.videoWidth, h: v.videoHeight, duree: Math.max(1, Math.round(v.duration)) });
      v.onerror = () => fin(null);
      v.src = lien;
    } else {
      const i = new Image();
      i.onload = () => fin({ l: i.naturalWidth, h: i.naturalHeight, duree: 10 });
      i.onerror = () => fin(null);
      i.src = lien;
    }
  });
}

function envoyer(corps, type, nom, mesures, ligne) {
  return new Promise((ok) => {
    const q = new URLSearchParams({ nom, duree: mesures.duree, l: mesures.l, h: mesures.h });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/spots/televerser?' + q);
    xhr.setRequestHeader('Content-Type', type);
    xhr.setRequestHeader('X-Spot', '1');
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) ligne.barre.style.width = Math.round((ev.loaded / ev.total) * 100) + '%';
    };
    xhr.onload = () => {
      let r = {};
      try { r = JSON.parse(xhr.responseText); } catch {}
      ok(r.ok ? { ok: true } : { ok: false, message: r.message || 'Envoi refusé.' });
    };
    xhr.onerror = () => ok({ ok: false, message: 'Envoi interrompu.' });
    xhr.send(corps);
  });
}

function ligneEnvoi(nom) {
  const li = el('li', 'envoi');
  li.append(el('span', 'nom-spot', nom));
  const piste = el('span', 'piste');
  const barre = el('span', 'barre');
  piste.append(barre);
  li.append(piste);
  $('envois').append(li);
  return { li, barre, finir: (message, erreur) => {
    li.replaceChildren(el('span', erreur ? 'avis-format' : 'nom-spot', message));
    setTimeout(() => li.remove(), erreur ? 8000 : 2500);
  } };
}

const sansExtension = (nom) => nom.replace(/\.[^.]+$/, '');

// PDF → une image PNG par page, rendue nette pour l'écran.
async function envoyerPdf(fichier) {
  const doc = await pdfjs.getDocument({ data: await fichier.arrayBuffer(), isEvalSupported: false }).promise;
  for (let n = 1; n <= doc.numPages; n++) {
    const nom = doc.numPages > 1 ? `${sansExtension(fichier.name)} — page ${n}` : sansExtension(fichier.name);
    const ligne = ligneEnvoi(nom);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const echelle = Math.min(4, Math.max(1, 1152 / base.width));
    const vue = page.getViewport({ scale: echelle });
    const toile = document.createElement('canvas');
    toile.width = Math.round(vue.width);
    toile.height = Math.round(vue.height);
    // intent « print » : rendu d'une traite, même si la fenêtre est en arrière-plan.
    await page.render({ canvasContext: toile.getContext('2d'), viewport: vue, intent: 'print' }).promise;
    const image = await new Promise((ok) => toile.toBlob(ok, 'image/png'));
    const r = await envoyer(image, 'image/png', nom, { l: toile.width, h: toile.height, duree: 10 }, ligne);
    ligne.finir(r.ok ? `✓ ${nom}` : `✗ ${nom} : ${r.message}`, !r.ok);
  }
}

async function envoyerFichiers(liste) {
  for (const fichier of liste) {
    const estPdf = fichier.type === 'application/pdf' || /\.pdf$/i.test(fichier.name);
    try {
      if (estPdf) {
        await envoyerPdf(fichier);
      } else if (!ACCEPTES.includes(fichier.type)) {
        const l = ligneEnvoi(fichier.name);
        l.finir(`✗ ${fichier.name} : format non accepté. Convertis-le en MP4 (vidéo) ou JPG/PNG (image).`, true);
      } else {
        const ligne = ligneEnvoi(fichier.name);
        const mesures = await mesurer(fichier).catch(() => null);
        if (!mesures) {
          ligne.finir(`✗ ${fichier.name} : fichier illisible (vidéo : utiliser le codec H.264 en MP4).`, true);
          continue;
        }
        const r = await envoyer(fichier, fichier.type, sansExtension(fichier.name), mesures, ligne);
        ligne.finir(r.ok ? `✓ ${fichier.name}` : `✗ ${fichier.name} : ${r.message}`, !r.ok);
      }
    } catch {
      const l = ligneEnvoi(fichier.name);
      l.finir(`✗ ${fichier.name} : impossible de lire ce fichier.`, true);
    }
    await charger();
  }
}

$('fichiers').onchange = (ev) => {
  envoyerFichiers([...ev.target.files]);
  ev.target.value = '';
};
const depot = $('depot');
depot.ondragover = (ev) => { ev.preventDefault(); depot.classList.add('survol'); };
depot.ondragleave = () => depot.classList.remove('survol');
depot.ondrop = (ev) => {
  ev.preventDefault();
  depot.classList.remove('survol');
  envoyerFichiers([...ev.dataTransfer.files]);
};

// Mise à jour en direct (autre fenêtre, arrêt automatique au coup d'envoi…)
let dernier = '';
Commun.connecter((_e, m) => {
  const cle = JSON.stringify(m.spots);
  if (cle !== dernier) {
    dernier = cle;
    charger();
  }
});
charger();
