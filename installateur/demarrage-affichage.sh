#!/usr/bin/env bash
# Player Raspberry : lanceur de l'affichage plein écran, exécuté à l'ouverture de la session.
# Il reste volontairement minimal et ne change jamais :
#   1. il attend que l'app réponde — et l'app ne démarre qu'APRÈS avoir installé ses mises à jour ;
#   2. puis il exécute affichage.sh, donc toujours dans sa dernière version.
# Aucune commande interactive : rien ne peut ouvrir une fenêtre qui bloquerait le démarrage.
# Tout est dans une fonction : bash lit le script en entier avant de l'exécuter, une mise à jour
# du fichier pendant qu'il tourne ne peut donc pas le perturber.
principal() {
  exec 9>"/tmp/ecran-led-affichage.lock"
  flock -n 9 || exit 0
  local i
  for i in $(seq 1 180); do
    curl -fs -o /dev/null "http://localhost:8080/api/moi" && break
    sleep 1
  done
  exec bash "$HOME/ecran-led/app/installateur/affichage.sh"
}
principal "$@"
exit 0
