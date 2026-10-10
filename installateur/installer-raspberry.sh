#!/usr/bin/env bash
# Installation de l'écran LED du SRC La Clayette sur un Raspberry Pi
# (Raspberry Pi OS 64 bits AVEC bureau). À lancer une fois, dans un terminal du Raspberry :
#
#   curl -fsSL https://raw.githubusercontent.com/thomas-creator192/ecran-led-src/main/installateur/installer-raspberry.sh | bash
#
# Relancer la même commande plus tard réinstalle l'app en gardant les données
# (score, réglages, spots, téléphones autorisés, code administrateur).
set -euo pipefail

DEPOT="thomas-creator192/ecran-led-src"
BRANCHE="main"
DOSSIER="$HOME/ecran-led"
PORT=8080
NOM_RESEAU="ecran-src"
UTILISATEUR="$(id -un)"

etape() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
erreur() { printf '\n\033[1;31m%s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" -ne 0 ] || erreur "Lance ce script sans « sudo », avec ton utilisateur habituel."
command -v raspi-config >/dev/null || erreur "Ce script est prévu pour Raspberry Pi OS."

etape "1/7 Installation des logiciels (quelques minutes)"
sudo apt-get update -y
sudo apt-get install -y nodejs unzip curl
if ! command -v chromium >/dev/null && ! command -v chromium-browser >/dev/null; then
  sudo apt-get install -y chromium || sudo apt-get install -y chromium-browser
fi
VERSION_NODE="$(node -p 'process.versions.node.split(".")[0]')"
[ "$VERSION_NODE" -ge 18 ] || erreur "Node.js $VERSION_NODE est trop ancien (18 minimum). Mets à jour Raspberry Pi OS."

etape "2/7 Téléchargement de l'app"
sudo systemctl stop ecran-led 2>/dev/null || true
mkdir -p "$DOSSIER/data"
TMP="$(mktemp -d)"
curl -fsSL "https://codeload.github.com/$DEPOT/zip/refs/heads/$BRANCHE" -o "$TMP/app.zip"
unzip -q "$TMP/app.zip" -d "$TMP/x"
rm -rf "$DOSSIER/app"
mv "$TMP"/x/*/ "$DOSSIER/app"
rm -rf "$TMP"

etape "3/7 Code administrateur (accès à la régie depuis le réseau)"
if [ -f "$DOSSIER/data/admin.json" ] && grep -q '"hash":"' "$DOSSIER/data/admin.json"; then
  echo "Un code existe déjà : il est conservé (il se change depuis la régie)."
else
  while true; do
    read -r -s -p "Choisis le code administrateur (6 caractères minimum) : " CODE1 </dev/tty; echo
    read -r -s -p "Retape-le pour confirmer : " CODE2 </dev/tty; echo
    if [ "$CODE1" = "$CODE2" ] && [ "${#CODE1}" -ge 6 ]; then break; fi
    echo "Codes différents ou trop courts, recommence."
  done
  CODE_ADMIN="$CODE1" ECRAN_LED_DATA="$DOSSIER/data" node "$DOSSIER/app/definir-code.js"
  unset CODE1 CODE2
fi

etape "4/7 Démarrage automatique de l'app"
sudo tee /etc/systemd/system/ecran-led.service >/dev/null <<EOF
[Unit]
Description=Écran LED SRC La Clayette
After=network-online.target
Wants=network-online.target

[Service]
User=$UTILISATEUR
WorkingDirectory=$DOSSIER/app
Environment=ECRAN_LED_DATA=$DOSSIER/data
Environment=PORT=$PORT
ExecStart=$(command -v node) $DOSSIER/app/lanceur.js --sans-navigateur
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now ecran-led.service

etape "5/7 Affichage plein écran sur la sortie HDMI"
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/ecran-led.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Écran LED SRC
Exec=bash $DOSSIER/app/installateur/kiosque.sh
X-GNOME-Autostart-enabled=true
EOF

etape "6/7 Réglages du Raspberry"
sudo raspi-config nonint do_boot_behaviour B4   # démarrage sur le bureau, connexion automatique
sudo raspi-config nonint do_blanking 1          # l'écran ne se met jamais en veille
sudo raspi-config nonint do_hostname "$NOM_RESEAU" || true

etape "7/7 Terminé"
IP="$(hostname -I | awk '{print $1}')"
cat <<EOF

  L'écran LED s'affichera tout seul sur la sortie HDMI à chaque démarrage.

  Régie (depuis un ordinateur ou un téléphone du réseau du club) :
    http://$IP:$PORT/regie
    ou http://$NOM_RESEAU.local:$PORT/regie

  Conseil : dans la box du club, réserve l'adresse $IP pour ce Raspberry
  (« bail DHCP statique ») pour qu'elle ne change jamais.

EOF
read -r -p "Redémarrer maintenant pour terminer ? [O/n] " REPONSE </dev/tty || REPONSE="o"
case "$REPONSE" in
  [nN]*) echo "Pense à redémarrer le Raspberry (sudo reboot)." ;;
  *) sudo reboot ;;
esac
