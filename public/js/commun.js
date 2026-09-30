// Code partagé par l'écran, la régie et la télécommande :
// connexion en direct au serveur, calcul du chrono, envoi des actions.
const Commun = (() => {
  // Écart entre l'horloge du serveur et celle de cet appareil.
  let decalage = 0;
  const maintenant = () => Date.now() + decalage;

  const NOMS_PERIODE = { 1: '1re mi-temps', 2: '2e mi-temps', 3: 'Prolongation 1', 4: 'Prolongation 2' };

  function connecter(surEtat, surStatut = () => {}) {
    const source = new EventSource('/api/flux');
    source.onopen = () => surStatut(true);
    source.onerror = () => surStatut(false);
    source.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      decalage = m.maintenant - Date.now();
      surEtat(m.etat, m);
    };
  }

  function mmss(ms) {
    const s = Math.floor(Math.max(0, ms) / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  // Le chrono monte (0 → 45, 45 → 90…) et continue au-delà de la durée de la période
  // (`depasse` : affiché en rouge) ; le temps joué en plus est dans `extra`.
  function chrono(etat) {
    const r = etat.reglages;
    const bornes = {
      1: [0, r.dureeMT],
      2: [r.dureeMT, r.dureeMT],
      3: [2 * r.dureeMT, r.dureeProl],
      4: [2 * r.dureeMT + r.dureeProl, r.dureeProl],
    }[etat.periode];
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

  function libellePhase(etat) {
    if (etat.phase === 'avant') return 'Avant-match';
    if (etat.phase === 'fin') return 'Fin du match';
    if (etat.phase === 'pause') return etat.periode === 1 ? 'Mi-temps' : 'Pause';
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

  return { connecter, maintenant, chrono, libellePhase, envoyer, poster, mmss, rendreJournal };
})();
