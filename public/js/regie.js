// Page de régie, sur le PC qui fait tourner le serveur.
(() => {
  const $ = (id) => document.getElementById(id);
  const form = $('reglages');
  let infos = null;
  let etat = null;
  let reglagesCharges = false;
  let quitte = false;

  let minuteurToast;
  // Aussi utilisé par les commandes du match intégrées (leurs messages s'affichent ici).
  window.afficherToast = toast;
  function toast(texte, erreur = false) {
    const t = $('toast');
    t.textContent = texte;
    t.classList.toggle('erreur', erreur);
    t.classList.add('visible');
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(() => t.classList.remove('visible'), erreur ? 4000 : 2000);
  }

  // ---------- QR code, téléphones, diffusion ----------
  function afficherQr() {
    const ip = $('reseau').value;
    if (!ip) {
      $('qr').removeAttribute('src');
      $('url').textContent = 'Aucun réseau détecté : connecte le PC au Wi-Fi du stade.';
      return;
    }
    $('qr').src = `/api/qr.svg?ip=${encodeURIComponent(ip)}&t=${infos.code.slice(0, 6)}`;
    $('url').textContent = `http://${ip}:${infos.port}`;
  }

  function rendreAppareils() {
    const liste = $('appareils');
    if (!infos.sessions.length) {
      const li = document.createElement('li');
      li.className = 'vide';
      li.textContent = 'Aucun téléphone pour l’instant.';
      return liste.replaceChildren(li);
    }
    liste.replaceChildren(...infos.sessions.map((s) => {
      const li = document.createElement('li');
      const nom = document.createElement('span');
      nom.textContent = s.prenom || 'Sans prénom';
      const vu = document.createElement('small');
      vu.textContent = 'actif ' + new Date(s.vu).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const retirer = document.createElement('button');
      retirer.className = 'court';
      retirer.textContent = 'Retirer';
      retirer.onclick = async () => {
        if (!confirm(`Retirer l'accès de ${s.prenom || 'ce téléphone'} ?`)) return;
        await Commun.poster('/api/sessions/revoquer', { id: s.id });
        chargerInfos();
      };
      li.append(nom, vu, retirer);
      return li;
    }));
  }

  function rendreDiffusion() {
    $('lancer').hidden = infos.diffusion;
    $('arreter').hidden = !infos.diffusion;
    $('etat-diffusion').textContent = infos.diffusion
      ? 'Diffusion en cours. Pour la couper sur l’écran LED : bouton rouge ci-dessus.'
      : 'L’affichage s’ouvre en plein écran sur l’écran choisi.';
  }

  async function chargerInfos() {
    const r = await fetch('/api/regie');
    if (!r.ok) return;
    infos = await r.json();
    $('version').textContent = 'version ' + infos.version;
    const choix = $('reseau');
    const ancien = choix.value;
    choix.replaceChildren(...infos.adresses.map((a) => new Option(`${a.nom} — ${a.adresse}`, a.adresse)));
    if (infos.adresses.some((a) => a.adresse === ancien)) choix.value = ancien;
    $('choix-reseau').hidden = infos.adresses.length < 2;
    afficherQr();
    rendreAppareils();
    rendreDiffusion();
  }
  $('reseau').onchange = afficherQr;

  async function chargerSysteme() {
    const s = await fetch('/api/systeme').then((r) => r.json());
    const choix = $('choix-ecran');
    const prefere = etat && etat.reglages.ecranLed;
    choix.replaceChildren(...s.ecrans.map((e) => new Option(
      `Écran ${e.numero} — ${e.l} × ${e.h}${e.principal ? ' (écran principal du PC)' : ''}`, e.id)));
    const defaut = s.ecrans.find((e) => e.id === prefere) || s.ecrans.find((e) => !e.principal) || s.ecrans[0];
    if (defaut) choix.value = defaut.id;
    if (s.ecrans.length === 1) {
      $('etat-diffusion').textContent = 'Un seul écran détecté : l’écran LED n’est pas vu par Windows (vérifie le câble ou le logiciel de l’écran).';
    }
    const alerte = $('alerte-reseau');
    alerte.hidden = !s.reseauxPublics.length;
    alerte.textContent = s.reseauxPublics.length
      ? `Le réseau « ${s.reseauxPublics.join(', ')} » est en mode « Public » : Windows empêche les téléphones de se connecter. ` +
        'Paramètres Windows → Réseau et Internet → Wi-Fi → ce réseau → choisir « Réseau privé ».'
      : '';
  }

  $('lancer').onclick = async () => {
    $('lancer').disabled = true;
    const r = await Commun.poster('/api/diffusion', { ecran: $('choix-ecran').value });
    $('lancer').disabled = false;
    if (!r.ok) toast(r.message, true);
    chargerInfos();
  };
  $('arreter').onclick = async () => {
    if (!confirm('Couper l’affichage sur l’écran LED ?')) return;
    await Commun.poster('/api/diffusion/arret');
    chargerInfos();
  };
  $('nouveau-code').onclick = async () => {
    if (!confirm('Déconnecter tous les téléphones et créer un nouveau QR code ?')) return;
    await Commun.poster('/api/nouveau-code');
    await chargerInfos();
    toast('Nouveau code créé : les bénévoles doivent rescanner.');
  };
  $('quitter').onclick = async () => {
    if (!confirm('Arrêter l’app ? L’écran LED et les téléphones seront coupés.')) return;
    quitte = true;
    await Commun.poster('/api/quitter');
    $('voile-quitte').classList.add('visible');
  };
  $('ouvrir-ecran').onclick = () => window.open('/ecran', 'ecranled', 'popup,width=900,height=300');

  // ---------- Commandes du match ----------
  // Le cadre prend la hauteur de la télécommande : pas de seconde barre de défilement.
  const cadre = $('commandes');
  function ajusterCommandes() {
    const corps = cadre.contentDocument && cadre.contentDocument.body;
    if (corps) cadre.style.height = corps.offsetHeight + 'px';
  }
  cadre.addEventListener('load', () => {
    ajusterCommandes();
    new ResizeObserver(ajusterCommandes).observe(cadre.contentDocument.body);
  });

  // ---------- Réglages ----------
  function remplirReglages(r) {
    const el = form.elements;
    el.nomDom.value = r.nomDom;
    el.nomExt.value = r.nomExt;
    el.dureeMT.value = r.dureeMT;
    el.dureeProl.value = r.dureeProl;
    el.mode.value = r.zone.mode;
    for (const k of ['x', 'y', 'l', 'h']) el[k].value = r.zone[k];
  }
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const el = form.elements;
    await Commun.poster('/api/reglages', {
      nomDom: el.nomDom.value,
      nomExt: el.nomExt.value,
      dureeMT: el.dureeMT.value,
      dureeProl: el.dureeProl.value,
      zone: { mode: el.mode.value, x: el.x.value, y: el.y.value, l: el.l.value, h: el.h.value },
    });
    reglagesCharges = false; // recharge les valeurs corrigées par le serveur
    toast('Réglages enregistrés');
  };

  $('stop-spots').onclick = () => Commun.poster('/api/spots', { action: 'arreter' });

  Commun.connecter(
    (e, m) => {
      $('bandeau-spots').hidden = !(m.spots && m.spots.actif);
      const premier = !etat;
      etat = e;
      if (!reglagesCharges) {
        remplirReglages(etat.reglages);
        reglagesCharges = true;
      }
      Commun.rendreJournal($('journal'), etat.journal, 60);
      const z = etat.reglages.zone;
      $('apercu-reel').width = z.l;
      $('apercu-reel').height = z.h;
      $('taille-led').textContent = `${z.l} × ${z.h}`;
      if (premier) chargerSysteme();
    },
    (ok) => {
      $('statut').textContent = ok ? 'app en marche' : 'app arrêtée — relance-la depuis l’icône du bureau';
      if (!ok && quitte) $('voile-quitte').classList.add('visible');
    }
  );
  chargerInfos();
  setInterval(chargerInfos, 5000); // téléphones connectés, état de la diffusion
})();
