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

  function surEtat(nouvel, message) {
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
    rendu();
  }

  function rendu() {
    if (!etat) return;
    placer(); // aussi en continu : certains PC ne signalent pas le changement de résolution
    const logo = etat.ecran === 'logo';
    $('vue-logo').classList.toggle('visible', logo);
    $('vue-score').classList.toggle('visible', !logo);

    $('nom-dom').textContent = etat.reglages.nomDom;
    $('nom-ext').textContent = etat.reglages.nomExt;
    $('s-dom').textContent = etat.score.dom;
    $('s-ext').textContent = etat.score.ext;

    const ligne = $('ligne-chrono');
    const add = $('add');
    let libelle = null;
    if (etat.phase === 'pause') libelle = etat.periode === 1 ? 'MI-TEMPS' : 'PAUSE';
    if (etat.phase === 'fin') libelle = 'FIN';
    const c = Commun.chrono(etat);
    ligne.classList.toggle('libelle', !!libelle);
    // Au-delà de 45:00 / 90:00 le chrono continue de tourner, en rouge.
    ligne.classList.toggle('depasse', !libelle && etat.phase === 'jeu' && c.depasse);
    $('chrono').textContent = libelle || c.texte;
    const montrerAdd = !libelle && etat.phase === 'jeu' && etat.tempsAdd;
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

  Commun.connecter(surEtat);
  setInterval(rendu, 200);
})();
