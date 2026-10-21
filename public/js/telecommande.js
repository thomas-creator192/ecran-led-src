// Télécommande sur téléphone.
(() => {
  const $ = (id) => document.getElementById(id);
  let etat = null;
  if (new URLSearchParams(location.search).has('integre')) document.body.classList.add('integre');

  // ---------- Petits outils ----------
  let minuteurToast;
  function toast(texte, erreur = false) {
    // Intégrée dans la régie : le message s'affiche dans la régie, toujours visible.
    if (document.body.classList.contains('integre') && window.parent.afficherToast) return window.parent.afficherToast(texte, erreur);
    const t = $('toast');
    t.textContent = texte;
    t.classList.toggle('erreur', erreur);
    t.classList.add('visible');
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(() => t.classList.remove('visible'), erreur ? 3500 : 1800);
  }
  function lirePrenom() {
    try { return localStorage.getItem('prenom') || ''; } catch { return ''; }
  }

  async function agir(type, donnees = {}, confirmation = null) {
    if (confirmation && !confirm(confirmation)) return;
    if (navigator.vibrate) navigator.vibrate(30);
    const r = await Commun.envoyer(type, donnees);
    if (r.refuse) return $('voile-refuse').classList.add('visible');
    if (!r.ok) toast(r.message, true);
  }
  // Pour les actions qui changent de phase : le serveur refuse si l'état a changé entre-temps.
  const attendu = () => ({ attendu: `${etat.phase}:${etat.periode}` });

  // ---------- Bouton principal selon le moment du match ----------
  function actionsPrincipales(e) {
    const prolongations = e.reglages.dureeProl > 0;
    const confirmFin = 'Terminer le match ?';
    const finMatch = { type: 'fin_match', texte: '⏹ Fin du match', classe: 'stop', confirmation: confirmFin };
    const tirsAuBut = { type: 'tirs_au_but', texte: '🎯 Tirs au but', classe: 'go', confirmation: 'Lancer la séance de tirs au but ?' };
    if (e.phase === 'avant') return [{ type: 'coup_envoi', texte: "▶ Coup d'envoi 1re mi-temps", classe: 'go' }];
    if (e.phase === 'fin') {
      return [{ type: 'nouveau_match', texte: 'Nouveau match (remet à 0-0)', classe: 'go', confirmation: 'Remettre le score à 0-0 et le chrono à zéro ?' }];
    }
    if (e.phase === 'tab') {
      return [{ type: 'fin_match', texte: 'Arrêter les tirs au but (fin du match)', classe: 'discret', confirmation: 'Arrêter la séance sans vainqueur ?' }];
    }
    if (e.phase === 'jeu') {
      if (e.periode === 1) return [{ type: 'fin_periode', texte: '⏹ Fin de la 1re mi-temps', classe: 'stop' }];
      // Fin de la 2e mi-temps : fin du match, ou prolongation (ou tirs au but si pas de prolongation).
      if (e.periode === 2) {
        return [finMatch, prolongations
          ? { type: 'prolongation', texte: '⏱ Prolongation', classe: 'go', confirmation: 'Passer en prolongation ?' }
          : tirsAuBut];
      }
      if (e.periode === 3) return [{ type: 'fin_periode', texte: '⏹ Fin de la 1re mi-temps de la prolongation', classe: 'stop' }];
      return [finMatch, tirsAuBut];
    }
    // pause
    if (e.periode === 1) return [{ type: 'coup_envoi', texte: "▶ Coup d'envoi 2e mi-temps", classe: 'go' }];
    const suivante = e.periode === 2 ? '1re' : '2e';
    return [
      { type: 'coup_envoi', texte: `▶ Début de la ${suivante} mi-temps de la prolongation`, classe: 'go' },
      { type: 'fin_match', texte: 'Terminer le match', classe: 'discret', confirmation: confirmFin },
    ];
  }

  let clePrincipale = '';
  function rendrePrincipal() {
    const actions = actionsPrincipales(etat);
    const cle = actions.map((a) => a.type + a.texte).join('|');
    if (cle === clePrincipale) return;
    clePrincipale = cle;
    $('principal').replaceChildren(...actions.map((a) => {
      const b = document.createElement('button');
      b.className = a.classe === 'discret' ? 'discret' : `gros ${a.classe}`;
      b.textContent = a.texte;
      b.onclick = () => agir(a.type, attendu(), a.confirmation);
      return b;
    }));
  }

  // ---------- Temps additionnel ----------
  const puces = $('puces-add');
  for (const m of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    const b = document.createElement('button');
    b.textContent = m ? '+' + m : 'Aucun';
    b.dataset.minutes = m;
    b.onclick = () => agir('temps_add', { minutes: m });
    puces.append(b);
  }

  // ---------- Affichage ----------
  function rendreChrono() {
    if (!etat) return;
    const c = Commun.affichageChrono(etat);
    $('chrono').textContent = c.texte;
    $('chrono').classList.toggle('depasse', c.depasse);
    const st = Commun.scoreTab(etat);
    $('extra').textContent = st ? `T.A.B. ${st.dom}-${st.ext}` : c.depasse ? `${c.extra} joué en plus` : '';
    $('phase').textContent = Commun.libellePhase(etat);
  }

  function rendu(message) {
    const r = etat.reglages;
    document.querySelectorAll('.n-dom').forEach((el) => (el.textContent = r.nomDom));
    document.querySelectorAll('.n-ext').forEach((el) => (el.textContent = r.nomExt));
    $('s-dom').textContent = etat.score.dom;
    $('s-ext').textContent = etat.score.ext;
    rendreChrono();
    rendrePrincipal();

    rendreTab();
    const enJeu = etat.phase === 'jeu';
    $('bloc-add').style.display = enJeu ? '' : 'none';
    puces.querySelectorAll('button').forEach((b) => b.classList.toggle('actif', Number(b.dataset.minutes) === (etat.tempsAdd || 0)));
    const spotsActifs = !!(message.spots && message.spots.actif);
    $('note-spots').hidden = !spotsActifs;
    document.querySelectorAll('[data-ecran]').forEach((b) => b.classList.toggle('actif', !spotsActifs && b.dataset.ecran === etat.ecran));

    const pause = $('pause-chrono');
    pause.disabled = !enJeu;
    pause.textContent = etat.chrono.enCours ? 'Mettre le chrono en pause' : 'Relancer le chrono';

    const annuler = $('annuler');
    annuler.disabled = !message.annulable;
    annuler.textContent = message.annulable ? `↶ Annuler : ${message.annulable}` : '↶ Annuler';

    Commun.rendreJournal($('journal'), etat.journal, 5);
  }

  // ---------- Tirs au but : BUT / Manqué pour chaque équipe, résumé des tirs ----------
  function rendreTab() {
    const tab = etat.phase === 'tab';
    $('tab-resume').hidden = !etat.tab;
    document.querySelectorAll('[data-manque]').forEach((b) => (b.hidden = !tab));
    document.querySelectorAll('.ligne-buts').forEach((l) => l.classList.toggle('tab', tab));
    $('aide-buts').textContent = tab
      ? 'Tirs au but : BUT ou Manqué pour chaque tir, chaque équipe à son tour.'
      : 'Le bouton BUT ajoute le point et lance l’animation sur l’écran.';
    $('corrige-tab').hidden = !etat.tab;
    $('corrige-match').hidden = tab;
    $('titre-score-match').hidden = !etat.tab;
    if (!etat.tab) return;
    const st = Commun.scoreTab(etat);
    for (const eq of ['dom', 'ext']) {
      const tirs = etat.tab[eq];
      $('ronds-' + eq).textContent = [0, 1, 2, 3, 4].map((i) => (tirs[i] === true ? '🟢' : tirs[i] === false ? '🔴' : '⚪')).join('') +
        (tirs.length > 5 ? `  +${tirs.length - 5}` : '');
      $('tab-' + eq).textContent = st[eq];
    }
  }

  // ---------- Boutons ----------
  document.querySelectorAll('[data-but]').forEach((b) => {
    b.onclick = () => (etat && etat.phase === 'tab'
      ? agir('tab', { equipe: b.dataset.but, reussi: true })
      : agir('but', { equipe: b.dataset.but }));
  });
  document.querySelectorAll('[data-manque]').forEach((b) => (b.onclick = () => agir('tab', { equipe: b.dataset.manque, reussi: false })));
  document.querySelectorAll('[data-tab-retirer]').forEach((b) => {
    b.onclick = () => agir('tab_corriger', { equipe: b.dataset.tabRetirer, mode: 'retirer' }, 'Retirer le dernier tir au but de cette équipe ?');
  });
  document.querySelectorAll('[data-tab-inverser]').forEach((b) => {
    b.onclick = () => agir('tab_corriger', { equipe: b.dataset.tabInverser, mode: 'inverser' });
  });
  document.querySelectorAll('[data-score]').forEach((b) => {
    b.onclick = () => agir('score', { equipe: b.dataset.score, delta: Number(b.dataset.delta) });
  });
  document.querySelectorAll('[data-ajuster]').forEach((b) => (b.onclick = () => agir('ajuster', { delta: Number(b.dataset.ajuster) })));
  document.querySelectorAll('[data-ecran]').forEach((b) => (b.onclick = () => agir('ecran', { mode: b.dataset.ecran })));
  $('pause-chrono').onclick = () => agir(etat.chrono.enCours ? 'chrono_pause' : 'chrono_reprise');
  $('annuler').onclick = () => agir('annuler');
  $('nouveau').onclick = () => agir('nouveau_match', attendu(), 'Remettre le score à 0-0 et le chrono à zéro ?');

  // ---------- Prénom et accès ----------
  function demanderPrenom() {
    $('prenom').value = lirePrenom();
    $('voile-prenom').classList.add('visible');
  }
  // Le prénom est enregistré par le serveur dans la session de ce téléphone
  // (c'est lui qui l'écrit dans le journal, on ne peut pas se faire passer pour un autre).
  async function enregistrerPrenom(prenom) {
    try { localStorage.setItem('prenom', prenom); } catch {}
    const r = await Commun.poster('/api/prenom', { prenom });
    if (r.refuse) $('voile-refuse').classList.add('visible');
  }
  $('form-prenom').onsubmit = (ev) => {
    ev.preventDefault();
    enregistrerPrenom($('prenom').value.trim());
    $('voile-prenom').classList.remove('visible');
  };
  $('changer-prenom').onclick = demanderPrenom;

  // ---------- Éteindre / redémarrer le player (code administrateur demandé) ----------
  $('eteindre').onclick = () => {
    $('form-arret').reset();
    $('erreur-arret').hidden = true;
    $('modale-arret').classList.add('visible');
  };
  $('annuler-arret').onclick = () => $('modale-arret').classList.remove('visible');
  $('afficher-arret').onclick = () => {
    const champ = $('code-arret');
    champ.type = champ.type === 'text' ? 'password' : 'text';
    $('afficher-arret').textContent = champ.type === 'text' ? 'Masquer' : 'Afficher';
  };
  $('form-arret').onsubmit = async (ev) => {
    ev.preventDefault();
    const action = ev.submitter && ev.submitter.value === 'redemarrer' ? 'redemarrer' : 'eteindre';
    const r = await Commun.poster('/api/player/arret', { code: $('code-arret').value, action });
    if (!r.ok) {
      $('erreur-arret').textContent = r.message || 'Impossible pour le moment.';
      $('erreur-arret').hidden = false;
      return;
    }
    $('modale-arret').classList.remove('visible');
    toast(action === 'redemarrer' ? 'Le player redémarre (environ 1 minute).' : 'Le player s’éteint.');
  };

  fetch('/api/moi').then((r) => r.json()).then((m) => {
    if (!m.autorise) return $('voile-refuse').classList.add('visible');
    // Bouton d'extinction : sur le player uniquement, et pas dans la régie (qui a le sien en haut).
    $('eteindre').hidden = !m.player || document.body.classList.contains('integre');
    if (m.regie) return $('changer-prenom').remove(); // régie : notée « Régie » dans le journal
    if (m.prenom) return;
    // Téléphone qui a rescanné le QR code : on reprend son prénom habituel.
    if (lirePrenom()) enregistrerPrenom(lirePrenom());
    else demanderPrenom();
  });

  Commun.connecter(
    (e, message) => { etat = e; rendu(message); },
    (ok) => $('connexion').classList.toggle('ok', ok)
  );
  setInterval(rendreChrono, 250);
})();
