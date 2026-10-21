// Code partagé par l'écran, la régie et la télécommande :
// connexion en direct au serveur, calcul du chrono, envoi des actions.
const Commun = (() => {
  // Écart entre l'horloge du serveur et celle de cet appareil.
  let decalage = 0;
  const maintenant = () => Date.now() + decalage;

  const NOMS_PERIODE = {
    1: '1re mi-temps',
    2: '2e mi-temps',
    3: '1re mi-temps de la prolongation',
    4: '2e mi-temps de la prolongation',
  };

  // `rechargerSiMaj` : la page se recharge toute seule quand l'app a été mise à jour,
  // pour ne jamais garder d'anciens boutons (régie et télécommande).
  function connecter(surEtat, surStatut = () => {}, { rechargerSiMaj = true } = {}) {
    let version = null;
    const source = new EventSource('/api/flux');
    source.onopen = () => surStatut(true);
    source.onerror = () => surStatut(false);
    source.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (rechargerSiMaj && version && m.version && m.version !== version) return location.reload();
      version = m.version || version;
      decalage = m.maintenant - Date.now();
      surEtat(m.etat, m);
    };
  }

  function mmss(ms) {
    const s = Math.floor(Math.max(0, ms) / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  // [minute de départ, durée] de chaque période.
  function bornesPeriode(etat, p) {
    const r = etat.reglages;
    return {
      1: [0, r.dureeMT],
      2: [r.dureeMT, r.dureeMT],
      3: [2 * r.dureeMT, r.dureeProl],
      4: [2 * r.dureeMT + r.dureeProl, r.dureeProl],
    }[p];
  }

  // Le chrono monte (0 → 45, 45 → 90…) et continue au-delà de la durée de la période
  // (`depasse` : affiché en rouge) ; le temps joué en plus est dans `extra`.
  function chrono(etat) {
    const bornes = bornesPeriode(etat, etat.periode);
    if (!bornes) return { texte: '00:00', depasse: false, extra: '' };
    const c = etat.chrono;
    const ecoule = c.cumul + (c.enCours ? Math.max(0, maintenant() - c.debut) : 0);
    const limite = bornes[1] * 60000;
    const depasse = ecoule >= limite;
    return {
      texte: mmss(bornes[0] * 60000 + ecoule),
      depasse,
      extra: depasse ? '+' + mmss(ecoule - limite) : '',
    };
  }

  // Ce qu'affiche la ligne du chrono selon le moment du match.
  // `libelle` : un mot (MI-TEMPS, FIN…) plutôt qu'un temps.
  function affichageChrono(etat) {
    if (etat.phase === 'fin') return { texte: 'FIN', libelle: true, depasse: false };
    if (etat.phase === 'tab') return { texte: 'TIRS AU BUT', libelle: true, depasse: false };
    if (etat.phase === 'pause') {
      // Mi-temps du match, et mi-temps de la prolongation.
      if (etat.periode === 1 || etat.periode === 3) return { texte: 'MI-TEMPS', libelle: true, depasse: false };
      // Avant la prolongation : le temps est remis à 90:00.
      const suivante = bornesPeriode(etat, etat.periode + 1);
      if (suivante && etat.reglages.dureeProl) return { texte: mmss(suivante[0] * 60000), libelle: false, depasse: false };
      return { texte: 'PAUSE', libelle: true, depasse: false };
    }
    const c = chrono(etat);
    return { texte: c.texte, libelle: false, depasse: etat.phase === 'jeu' && c.depasse, extra: c.extra };
  }

  // Score des tirs au but (buts marqués), ou null s'il n'y a pas eu de tirs au but.
  function scoreTab(etat) {
    if (!etat.tab) return null;
    return { dom: etat.tab.dom.filter(Boolean).length, ext: etat.tab.ext.filter(Boolean).length };
  }

  function libellePhase(etat) {
    if (etat.phase === 'avant') return 'Avant-match';
    if (etat.phase === 'fin') return etat.tab ? 'Fin du match (tirs au but)' : 'Fin du match';
    if (etat.phase === 'tab') return 'Tirs au but';
    if (etat.phase === 'pause') {
      return { 1: 'Mi-temps', 2: 'Avant la prolongation', 3: 'Mi-temps de la prolongation' }[etat.periode] || 'Pause';
    }
    return NOMS_PERIODE[etat.periode] + (etat.chrono.enCours ? '' : ' (chrono en pause)');
  }

  // POST JSON vers le serveur (le serveur n'accepte que du JSON venant de ses propres pages).
  async function poster(url, donnees = {}) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(donnees),
      });
      return await r.json();
    } catch {
      return { ok: false, message: 'Pas de connexion au PC de régie.' };
    }
  }
  const envoyer = (type, donnees = {}) => poster('/api/action', { type, ...donnees });

  function rendreJournal(liste, journal, max) {
    liste.replaceChildren(...journal.slice(0, max).map((j) => {
      const li = document.createElement('li');
      const heure = document.createElement('time');
      heure.textContent = new Date(j.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const qui = document.createElement('b');
      qui.textContent = j.qui;
      li.append(heure, qui, ' · ' + j.texte);
      return li;
    }));
  }

  return { connecter, maintenant, chrono, affichageChrono, scoreTab, libellePhase, envoyer, poster, mmss, rendreJournal };
})();
