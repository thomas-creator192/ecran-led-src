// Page de connexion à la régie (code administrateur).
(() => {
  const $ = (id) => document.getElementById(id);

  fetch('/api/admin').then((r) => r.json()).then((a) => {
    if (a.connecte) return location.replace('/regie');
    $(a.defini ? 'form' : 'sans-code').hidden = false;
    if (a.defini) $('code').focus();
  });

  $('form').onsubmit = async (ev) => {
    ev.preventDefault();
    const r = await Commun.poster('/api/admin/connexion', { code: $('code').value });
    if (r.ok) return location.replace('/regie');
    $('erreur').textContent = r.message || 'Connexion impossible.';
    $('erreur').hidden = false;
    $('code').select();
  };
})();
