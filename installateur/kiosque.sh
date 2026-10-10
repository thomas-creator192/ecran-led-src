#!/usr/bin/env bash
# Player Raspberry : affiche l'écran LED en plein écran sur la sortie HDMI,
# et relance le navigateur s'il se ferme ou plante.
# Lancé automatiquement à l'ouverture de la session (voir installer-raspberry.sh).

# Une seule copie à la fois.
exec 9>"/tmp/ecran-led-kiosque.lock"
flock -n 9 || exit 0

PORT=8080
URL="http://localhost:$PORT/ecran"
PROFIL="$HOME/ecran-led/data/navigateur-ecran"
CHROMIUM="$(command -v chromium || command -v chromium-browser)"

# Attendre que l'app réponde (2 minutes maximum après le démarrage).
for _ in $(seq 1 120); do
  curl -fs -o /dev/null "http://localhost:$PORT/api/moi" && break
  sleep 1
done

while true; do
  # Après une coupure de courant : pas de verrou orphelin ni de bandeau « restaurer les pages ».
  rm -f "$PROFIL/SingletonLock" "$PROFIL/SingletonSocket" "$PROFIL/SingletonCookie"
  if [ -f "$PROFIL/Default/Preferences" ]; then
    sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"[^"]*"/"exit_type":"Normal"/' "$PROFIL/Default/Preferences"
  fi
  "$CHROMIUM" \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --no-first-run \
    --password-store=basic \
    --disable-session-crashed-bubble \
    --disable-features=Translate \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 \
    --user-data-dir="$PROFIL" \
    "$URL"
  sleep 3
done
