#!/usr/bin/env bash
# Player Raspberry : affiche l'écran LED en plein écran sur la sortie HDMI, et relance le
# navigateur s'il se ferme ou plante. Lancé par demarrage-affichage.sh, une fois l'app prête
# (et donc déjà mise à jour).
# Tout est dans une fonction : une mise à jour du fichier pendant qu'il tourne ne le perturbe pas.
principal() {
  local url="http://localhost:8080/ecran"
  local profil="$HOME/ecran-led/data/navigateur-ecran"
  local chromium
  chromium="$(command -v chromium || command -v chromium-browser)"
  # Premier lancement après l'allumage : l'écran joue d'abord l'animation Philibert CVS.
  local cible="$url?intro=1"
  while true; do
    # Après une coupure de courant : pas de verrou orphelin ni de bandeau « restaurer les pages ».
    rm -f "$profil/SingletonLock" "$profil/SingletonSocket" "$profil/SingletonCookie"
    if [ -f "$profil/Default/Preferences" ]; then
      sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"[^"]*"/"exit_type":"Normal"/' "$profil/Default/Preferences"
    fi
    "$chromium" \
      --kiosk \
      --noerrdialogs \
      --disable-infobars \
      --no-first-run \
      --password-store=basic \
      --disable-session-crashed-bubble \
      --disable-features=Translate \
      --autoplay-policy=no-user-gesture-required \
      --check-for-update-interval=31536000 \
      --user-data-dir="$profil" \
      "$cible"
    cible="$url" # après un plantage du navigateur : directement le score
    sleep 3
  done
}
principal "$@"
exit 0
