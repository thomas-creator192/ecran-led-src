// Page affichée sur l'écran LED.
(() => {
  const $ = (id) => document.getElementById(id);
  const apercu = new URLSearchParams(location.search).has('apercu');
  if (apercu) document.body.classList.add('apercu');

  const DUREE_BUT = 6000;
  const zone = $('zone');
  const scene = $('scene');
  let etat = null;
  let premierMessage = true;
  let butVu = null; // id du dernier but déjà traité
  let butAnime = null; // id du but en cours d'animation
  let finAnimation = null;
  let pulsesEnAttente = [];

  function placer() {
    const z = etat && !apercu && etat.reglages.zone.mode === 'zone' ? etat.reglages.zone : null;
    Object.assign(zone.style, z
      ? { left: z.x + 'px', top: z.y + 'px', width: z.l + 'px', height: z.h + 'px' }
      : { left: '0', top: '0', width: innerWidth + 'px', height: innerHeight + 'px' });
    const l = z ? z.l : innerWidth;
    const h = z ? z.h : innerHeight;
    const k = Math.min(l / 1200, h / 400);
    const transform = `translate(${(l - 1200 * k) / 2}px, ${(h - 400 * k) / 2}px) scale(${k})`;
    if (scene.style.transform !== transform) scene.style.transform = transform;
  }
  addEventListener('resize', placer);

  // Double-clic : plein écran (pratique sur le PC de l'écran LED).
  document.addEventListener('dblclick', () => {
    if (apercu) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });

  function pulser(id) {
    const el = $(id);
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  function arreterBut() {
    clearTimeout(finAnimation);
    $('but').classList.remove('actif');
    butAnime = null;
    pulsesEnAttente.forEach(pulser);
    pulsesEnAttente = [];
  }

  function jouerBut(but) {
    const el = $('but');
    el.classList.remove('actif', 'ext');
    void el.offsetWidth; // relance les animations CSS
    el.classList.toggle('ext', but.equipe === 'ext');
    $('but-equipe').textContent = etat.reglages.nomExt;
    el.classList.add('actif');
    butAnime = but.id;
    clearTimeout(finAnimation);
    finAnimation = setTimeout(arreterBut, DUREE_BUT);
  }

  // ---------- Spots annonceurs : lecture en boucle de la playlist ----------
  const vueSpots = $('vue-spots');
  let lecteur = { cle: '', uid: null, playlist: [], minuteur: null };

  function majSpots(spots) {
    const actifs = !!(spots && spots.actif && spots.playlist.length);
    vueSpots.classList.toggle('visible', actifs);
    if (!actifs) return arreterSpots();
    const cle = JSON.stringify(spots.playlist.map((p) => [p.uid, p.duree]));
    if (cle === lecteur.cle) return;
    lecteur.cle = cle;
    lecteur.playlist = spots.playlist;
    // Le spot en cours va jusqu'au bout ; s'il a été retiré, on passe au premier.
    if (!lecteur.uid || !spots.playlist.some((p) => p.uid === lecteur.uid)) jouerSpot(0);
  }
  function arreterSpots() {
    clearTimeout(lecteur.minuteur);
    if (lecteur.uid) vueSpots.replaceChildren();
    lecteur = { cle: '', uid: null, playlist: [], minuteur: null };
  }
  function spotSuivant() {
    const i = lecteur.playlist.findIndex((p) => p.uid === lecteur.uid);
    const j = (i + 1) % lecteur.playlist.length;
    // Un seul spot : on le relance sur place, sans clignotement.
    const media = vueSpots.firstElementChild;
    if (j === i && media) {
      clearTimeout(lecteur.minuteur);
      const spot = lecteur.playlist[j];
      if (spot.type === 'video') {
        media.currentTime = 0;
        media.play().catch(() => {});
        lecteur.minuteur = setTimeout(spotSuivant, spot.duree * 1000 + 3000);
      } else {
        lecteur.minuteur = setTimeout(spotSuivant, spot.duree * 1000);
      }
      return;
    }
    jouerSpot(j);
  }
  function jouerSpot(i) {
    clearTimeout(lecteur.minuteur);
    const spot = lecteur.playlist[i];
    if (!spot) return;
    lecteur.uid = spot.uid;
    let el;
    if (spot.type === 'video') {
      el = document.createElement('video');
      el.muted = true;
      el.playsInline = true;
      el.src = spot.url;
      el.onended = spotSuivant;
      el.onerror = () => { lecteur.minuteur = setTimeout(spotSuivant, 1000); };
      el.play().catch(() => {});
      // Filet de sécurité si la vidéo ne signale pas sa fin.
      lecteur.minuteur = setTimeout(spotSuivant, spot.duree * 1000 + 3000);
    } else {
      el = new Image();
      el.src = spot.url;
      lecteur.minuteur = setTimeout(spotSuivant, spot.duree * 1000);
    }
    el.className = 'media';
    vueSpots.replaceChildren(el);
  }

  // Après une mise à jour de l'app, ou sur demande de la régie, l'écran se recharge tout seul.
  let signature = null;
  function verifierRechargement(message) {
    const s = `${message.version}|${message.rechargement}`;
    if (signature && s !== signature) location.reload();
    signature = s;
  }

  // ---------- Vainqueur des tirs au but ----------
  const DUREE_VAINQUEUR = 8000;
  let vainqueurVu = null;
  let vainqueurAnime = null;
  let finVainqueur = null;
  function arreterVainqueur() {
    clearTimeout(finVainqueur);
    $('vainqueur').classList.remove('actif');
    vainqueurAnime = null;
  }
  function jouerVainqueur(v) {
    const el = $('vainqueur');
    el.classList.remove('actif', 'ext');
    void el.offsetWidth; // relance les animations CSS
    el.classList.toggle('ext', v.equipe === 'ext');
    $('vainqueur-equipe').textContent = v.equipe === 'ext' ? etat.reglages.nomExt : etat.reglages.nomDom;
    el.classList.add('actif');
    ajusterVainqueur();
    vainqueurAnime = v.id;
    clearTimeout(finVainqueur);
    finVainqueur = setTimeout(arreterVainqueur, DUREE_VAINQUEUR);
  }
  // « VAINQUEUR ! » doit tenir sur une ligne, à côté du logo (SRC) ou seul (visiteur).
  function ajusterVainqueur() {
    const el = $('vainqueur');
    const logo = el.querySelector('.but-logo');
    const dispo = 1200 - 80 - (el.classList.contains('ext') ? 0 : logo.offsetWidth + 40);
    for (const t of el.querySelectorAll('.vainqueur-equipe, .vainqueur-texte')) {
      t.style.fontSize = '';
      const largeur = t.scrollWidth;
      if (largeur > dispo) t.style.fontSize = `${parseFloat(getComputedStyle(t).fontSize) * dispo / largeur}px`;
    }
  }
  function majVainqueur() {
    const v = etat.vainqueur;
    if (vainqueurAnime && (!v || v.id !== vainqueurAnime)) arreterVainqueur();
    if (v && v.id !== vainqueurVu) {
      vainqueurVu = v.id;
      if (Commun.maintenant() - v.t < DUREE_VAINQUEUR - 500) jouerVainqueur(v);
    }
  }

  // ---------- Tirs au but : 5 ronds par équipe (vert marqué, rouge manqué), puis le score ----------
  function rendreTab() {
    $('tab-nom-dom').textContent = etat.reglages.nomDom;
    $('tab-nom-ext').textContent = etat.reglages.nomExt;
    const score = Commun.scoreTab(etat);
    for (const eq of ['dom', 'ext']) {
      const tirs = etat.tab[eq];
      const conteneur = $('tirs-' + eq);
      // Reconstruit seulement si un tir a changé (sinon l'animation des ronds se relancerait).
      const cle = tirs.slice(0, 5).join(',');
      if (conteneur.dataset.cle !== cle) {
        conteneur.dataset.cle = cle;
        conteneur.replaceChildren(...[0, 1, 2, 3, 4].map((i) => {
          const rond = document.createElement('span');
          rond.className = 'rond' + (tirs[i] === true ? ' marque' : tirs[i] === false ? ' rate' : '');
          return rond;
        }));
      }
      $('tab-s-' + eq).textContent = score[eq];
    }
  }

  // ---------- Animation Philibert CVS : au démarrage (?intro) et avant l'extinction ----------
  const DUREE_INTRO = 24000;
  let introMinuteur = null;
  let extinctionVue = null;
  function ajusterIntro() {
    // Chaque texte doit tenir sur une ligne dans la largeur disponible.
    for (const t of document.querySelectorAll('#intro .ajuster')) {
      t.style.fontSize = '';
      const parent = getComputedStyle(t.parentElement);
      const dispo = t.parentElement.clientWidth - parseFloat(parent.paddingLeft) - parseFloat(parent.paddingRight);
      const largeur = t.scrollWidth;
      if (largeur > dispo) t.style.fontSize = `${parseFloat(getComputedStyle(t).fontSize) * dispo / largeur}px`;
    }
  }
  function jouerIntro(sortie) {
    const el = $('intro');
    el.classList.remove('actif');
    void el.offsetWidth; // relance les animations CSS
    el.classList.add('actif');
    ajusterIntro();
    clearTimeout(introMinuteur);
    // Au démarrage, l'app prend la suite ; à l'extinction, l'écran reste noir.
    if (!sortie) introMinuteur = setTimeout(() => el.classList.remove('actif'), DUREE_INTRO);
  }
  function majExtinction(message) {
    const x = message.extinction;
    if (!x || x.id === extinctionVue) return;
    extinctionVue = x.id;
    if (Commun.maintenant() - x.t < DUREE_INTRO) jouerIntro(true);
  }
  // Au démarrage du player, l'animation se joue une seule fois, dès que l'app répond
  // (même si le navigateur plein écran a été lancé sans ?intro, ou se recharge ensuite).
  let introLancee = false;
  if (new URLSearchParams(location.search).has('intro')) {
    history.replaceState(null, '', location.pathname + (apercu ? '?apercu=1' : ''));
    introLancee = true;
    jouerIntro(false);
  }
  function introAuDemarrage(message) {
    if (apercu || !message.player || !message.demarrage) return;
    const cle = 'intro-' + message.demarrage;
    let dejaVue = false;
    try {
      dejaVue = !!sessionStorage.getItem(cle);
      sessionStorage.setItem(cle, '1');
    } catch {}
    if (dejaVue || introLancee) return;
    introLancee = true;
    if (Commun.maintenant() - message.demarrage < 120000) jouerIntro(false);
  }

  function surEtat(nouvel, message) {
    verifierRechargement(message);
    introAuDemarrage(message);
    majExtinction(message);
    const ancien = etat;
    etat = nouvel;
    placer();
    majSpots(message.spots);

    const but = etat.but;
    // Un but annulé pendant son animation : on coupe l'animation.
    if (butAnime && (!but || but.id !== butAnime)) arreterBut();
    if (but && but.id !== butVu) {
      butVu = but.id;
      const recent = Commun.maintenant() - but.t < DUREE_BUT - 500;
      if (recent) jouerBut(but);
    }

    if (ancien && !premierMessage) {
      for (const eq of ['dom', 'ext']) {
        if (etat.score[eq] !== ancien.score[eq]) {
          if (butAnime) pulsesEnAttente.push('s-' + eq);
          else pulser('s-' + eq);
        }
      }
    }
    premierMessage = false;
    majVainqueur();
    rendu();
  }

  function rendu() {
    if (!etat) return;
    placer(); // aussi en continu : certains PC ne signalent pas le changement de résolution
    const logo = etat.ecran === 'logo';
    const tab = etat.phase === 'tab';
    $('vue-logo').classList.toggle('visible', logo);
    $('vue-tab').classList.toggle('visible', !logo && tab);
    $('vue-score').classList.toggle('visible', !logo && !tab);
    if (etat.tab) rendreTab();
    const st = Commun.scoreTab(etat);
    $('tab-final').hidden = !(st && etat.phase === 'fin');
    $('tab-final').textContent = st ? `TIRS AU BUT ${st.dom}-${st.ext}` : '';

    $('nom-dom').textContent = etat.reglages.nomDom;
    $('nom-ext').textContent = etat.reglages.nomExt;
    $('s-dom').textContent = etat.score.dom;
    $('s-ext').textContent = etat.score.ext;

    const ligne = $('ligne-chrono');
    const add = $('add');
    const c = Commun.affichageChrono(etat);
    ligne.classList.toggle('libelle', c.libelle);
    // Au-delà de 45:00, 90:00, 105:00 et 120:00, le chrono continue de tourner, en rouge.
    ligne.classList.toggle('depasse', c.depasse);
    $('chrono').textContent = c.texte;
    const montrerAdd = !c.libelle && etat.phase === 'jeu' && etat.tempsAdd;
    add.classList.toggle('visible', !!montrerAdd);
    add.textContent = montrerAdd ? '+' + etat.tempsAdd : '';
    ajusterLargeur(ligne);
  }

  // Réduit le chrono s'il est plus large que la colonne du centre.
  const LARGEUR_MAX = 600;
  function ajusterLargeur(el) {
    const largeur = el.scrollWidth;
    const k = largeur > LARGEUR_MAX ? LARGEUR_MAX / largeur : 1;
    const transform = k < 1 ? `scale(${k})` : '';
    if (el.style.transform !== transform) el.style.transform = transform;
  }

  Commun.connecter(surEtat, undefined, { rechargerSiMaj: false }); // rechargement géré ci-dessus
  setInterval(rendu, 200);
})();
