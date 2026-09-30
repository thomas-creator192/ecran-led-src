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
    if (e.phase === 'avant') return [{ type: 'coup_envoi', texte: "▶ Coup d'envoi 1re mi-temps", classe: 'go' }];
    if (e.phase === 'fin') {
      return [{ type: 'nouveau_match', texte: 'Nouveau match (remet à 0-0)', classe: 'go', confirmation: 'Remettre le score à 0-0 et le chrono à zéro ?' }];
    }
    if (e.phase === 'jeu') {
      if (e.periode === 1) return [{ type: 'fin_periode', texte: '⏹ Fin de la 1re mi-temps', classe: 'stop' }];
      if (e.periode === 2) {
        const liste = [{ type: 'fin_match', texte: '⏹ Fin du match', classe: 'stop', confirmation: confirmFin }];
        if (prolongations) liste.push({ type: 'fin_periode', texte: 'Fin du temps réglementaire → prolongations', classe: 'discret' });
        return liste;
      }
      if (e.periode === 3) return [{ type: 'fin_periode', texte: '⏹ Fin de la prolongation 1', classe: 'stop' }];
      return [{ type: 'fin_match', texte: '⏹ Fin du match', classe: 'stop', confirmation: confirmFin }];
    }
    // pause
    if (e.periode === 1) return [{ type: 'coup_envoi', texte: "▶ Coup d'envoi 2e mi-temps", classe: 'go' }];
    const suivante = e.periode === 2 ? 'prolongation 1' : 'prolongation 2';
    return [
      { type: 'coup_envoi', texte: `▶ Coup d'envoi ${suivante}`, classe: 'go' },
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
    const c = Commun.chrono(etat);
    let texte = c.texte;
    if (etat.phase === 'pause') texte = etat.periode === 1 ? 'MI-TEMPS' : 'PAUSE';
    if (etat.phase === 'fin') texte = 'FIN';
    $('chrono').textContent = texte;
    $('chrono').classList.toggle('depasse', etat.phase === 'jeu' && c.depasse);
    $('extra').textContent = etat.phase === 'jeu' && c.depasse ? `${c.extra} joué en plus` : '';
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

  // ---------- Boutons ----------
  document.querySelectorAll('[data-but]').forEach((b) => (b.onclick = () => agir('but', { equipe: b.dataset.but })));
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

  fetch('/api/moi').then((r) => r.json()).then((m) => {
    if (!m.autorise) return $('voile-refuse').classList.add('visible');
    if (m.local) return $('changer-prenom').remove(); // PC de régie : noté « Régie »
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
