# Écran LED — SRC La Clayette

Pilotage de l'écran LED du stade : chrono, score, animation de but, logo du club.
Les bénévoles le commandent depuis leur téléphone (QR code), sur le Wi-Fi du stade. Pas besoin d'Internet pendant le match.

## Installer sur le PC du stade (une seule fois)

1. Télécharger **EcranLED-SRC.zip**, clic droit → **Extraire tout**.
2. Dans le dossier extrait, double-cliquer **Installer.cmd**.
   - Si Windows affiche « Windows a protégé votre ordinateur » : **Informations complémentaires → Exécuter quand même**.
   - Une fenêtre Windows demande d'autoriser les téléphones dans le pare-feu : **Oui**.
3. L'icône **« Écran LED SRC »** apparaît sur le Bureau. Le dossier extrait peut ensuite être supprimé.
4. Mettre le Wi-Fi du stade en **« Réseau privé »** (Paramètres → Réseau et Internet → Wi-Fi → le réseau). Sinon les téléphones ne peuvent pas se connecter. La régie affiche un avertissement tant que ce n'est pas fait.

Rien d'autre à installer : le moteur de l'app est inclus.

## Installer sur le player Raspberry Pi 5 (une seule fois)

Montage au stade :
```
Câble RJ45 du club ──▶ [switch 5 ports] ──▶ Novastar (player de l'écran)
                                        └─▶ Raspberry ──HDMI──▶ Novastar
```

**1. Préparer le Raspberry (à la maison, avec un écran, un clavier et une souris)**
1. Il faut **Raspberry Pi OS 64 bits avec bureau** sur la carte microSD. Si la carte du kit ne démarre pas directement dessus :
   installe-le depuis un PC avec **Raspberry Pi Imager** (raspberrypi.com/software), modèle « Raspberry Pi 5 », système « Raspberry Pi OS (64-bit) ».
2. Démarre le Raspberry, suis l'assistant (langue, utilisateur, Wi-Fi ou câble réseau) jusqu'au bureau.
3. Ouvre le **Terminal** (icône écran noir en haut) et colle cette commande :
   ```
   curl -fsSL https://raw.githubusercontent.com/thomas-creator192/ecran-led-src/main/installateur/installer-raspberry.sh | bash
   ```
4. Le script installe tout (quelques minutes), puis te demande de **choisir le code administrateur** (6 caractères minimum, à noter et garder pour toi).
5. À la fin, il affiche l'adresse de la régie et redémarre. Au redémarrage, l'écran affiche tout seul le score en plein écran.

**2. Au stade**
1. Branche le Raspberry : courant, câble réseau vers le switch, HDMI vers l'entrée HDMI du Novastar.
2. Dans **ViPlex**, passe le Novastar sur son **entrée HDMI** (mode synchrone / HDMI prioritaire) et règle la mise à l'échelle pour que l'image remplisse les 288 × 96 pixels.
3. Depuis un ordinateur ou un téléphone du réseau du club, ouvre la régie : `http://ecran-src.local:8080/regie`
   (ou `http://ADRESSE-DU-RASPBERRY:8080/regie`, affichée à la fin de l'installation), puis entre le code administrateur.
4. Si l'écran LED ne montre qu'un coin de l'image : régie → Réglages → Zone d'affichage → « Un rectangle précis », X = 0, Y = 0, 288 × 96.
5. Conseil : dans la box du club, réserve l'adresse du Raspberry (« bail DHCP statique ») pour qu'elle ne change jamais, puis imprime le QR code des bénévoles.

**Comment il se comporte**
- On l'allume : l'app démarre, l'écran affiche le score. Rien à faire.
- Coupure de courant : il redémarre et reprend le match là où il en était. Un petit onduleur est conseillé (protège la carte microSD).
- Mises à jour : à chaque démarrage, et la nuit entre 3 h et 5 h (jamais pendant un match). L'affichage se recharge tout seul.
- Régie → « ↻ Recharger l'affichage » relance l'affichage de l'écran LED à distance.
- Pour réinstaller (en gardant score, réglages, spots et code) : relancer la même commande dans le Terminal.

## Le jour du match

1. Double-clic sur l'icône **« Écran LED SRC »** : la régie s'ouvre.
2. **« Lancer la diffusion »** : l'affichage s'ouvre en plein écran sur l'écran LED.
3. Les bénévoles scannent le **QR code** avec leur téléphone (connecté au Wi-Fi du stade) et tapent leur prénom.
4. Sur le téléphone : **Coup d'envoi**, **BUT**, **temps additionnel**, **fin de mi-temps**… Le bouton orange **Annuler** rattrape n'importe quelle erreur.
5. Après le match : **« Quitter l'app »** en haut de la régie.

## Spots annonceurs (avant et après les matchs)

Dans la régie, bouton **« 📺 Spots annonceurs »** :
1. **Ajouter des fichiers** : glisser ou choisir des vidéos (MP4, WebM), des images (JPG, PNG, WebP) ou des PDF. Chaque page d'un PDF devient une image.
   Format idéal : **3:1**, par exemple 288 × 96 ou 864 × 288. Sinon, le spot est affiché en entier avec des bandes noires, et l'outil le signale.
2. **👁 ou clic sur un spot** : aperçu au format de l'écran LED.
3. **« ＋ Diffuser »** : le spot passe dans la colonne « En diffusion ». On peut y changer l'ordre, la durée des images, et **« Retirer »** un spot de la diffusion sans le supprimer de l'outil. La corbeille 🗑 le supprime de l'outil.
4. **« ▶ Diffuser les spots »** : les spots passent en boucle sur l'écran LED.

Les spots s'arrêtent tout seuls au **coup d'envoi**, à un **but**, ou quand un bénévole appuie sur **« Score »** : le match reprend toujours l'écran.
Les fichiers sont rangés avec les données de l'app et ne sont jamais touchés par les mises à jour.

## Bon à savoir

- **Deux bénévoles appuient sur BUT en même temps** : le but ne compte qu'une fois.
- **Le chrono** continue de tourner après 45:00 et 90:00, mais passe en **rouge**. Le temps additionnel annoncé s'affiche à côté (« +3 »).
- **Si le PC redémarre** en plein match : double-clic sur l'icône, le score et le chrono reprennent où ils en étaient.
- **Jeunes catégories** : durée des mi-temps et des prolongations dans les réglages de la régie.
- **Si l'écran LED n'affiche qu'une partie de l'image** : Réglages → Zone d'affichage → « Un rectangle précis », avec la position et la taille données par le logiciel de l'écran.

## Sécurité

- La **régie** et les **spots** s'ouvrent sur l'ordinateur où tourne l'app, ou depuis le réseau avec le **code administrateur** (stocké chiffré, 20 essais ratés en 10 minutes bloquent l'appareil). Changer le code déconnecte les autres administrateurs.
- Un téléphone n'a accès à la télécommande **qu'après avoir scanné le QR code**. Chaque téléphone a son propre accès, visible dans la régie (« Téléphones connectés ») et **retirable** d'un clic. Un accès expire tout seul après 24 h sans utilisation.
- **« Nouveau code »** change le QR code et déconnecte tous les téléphones.
- Le prénom inscrit dans le journal est celui enregistré pour le téléphone : impossible d'agir sous le nom de quelqu'un d'autre.
- Les spots (envoi, fichiers, diffusion) ne sont gérables que depuis le PC du stade. Chaque fichier envoyé est vérifié (vrai format, 500 Mo maximum).
- Les autres pages web ouvertes sur le PC ou les téléphones ne peuvent pas piloter l'app. Le pare-feu n'ouvre l'app qu'aux réseaux privés.

## Mises à jour

À chaque ouverture, si le PC a Internet, l'app vérifie s'il existe une nouvelle version sur GitHub et l'installe en quelques secondes. Le score, les réglages et les téléphones autorisés sont conservés. Sans Internet, elle démarre normalement. Si l'app est déjà ouverte, elle ne se met jamais à jour en plein match.

### Pour publier une nouvelle version (développeur)

1. Modifier le code et tester (`Démarrer.bat` lance la version de développement).
2. Augmenter `version` dans `package.json` (ex. 1.1.0 → 1.2.0).
3. `git commit` puis `git push` : les PC du club la récupèrent à leur prochain démarrage.
4. Le fichier d'installation (`outils\construire.ps1` → `dist\EcranLED-SRC.zip`) n'a besoin d'être refait que pour les nouvelles installations.

Le dépôt GitHub utilisé pour les mises à jour est indiqué dans `maj.json`.
La personne qui contrôle ce compte GitHub contrôle ce qui s'installe sur le PC du club : active la **double authentification** sur ce compte.

## Organisation des fichiers

- `lanceur.js` : point d'entrée de l'app installée (mise à jour, puis serveur).
- `server.js` : le serveur (état du match, accès, diffusion en direct). `systeme.js` : écrans, navigateur, pare-feu.
- `admin.js` : code et sessions administrateur. `maj.js` : mises à jour depuis GitHub. `spots.js` : spots annonceurs.
- `installateur/installer-raspberry.sh` et `kiosque.sh` : installation et affichage plein écran du player Raspberry.
- `public/ecran.html` : l'affichage de l'écran LED (dessiné en 1200 × 400, format 3:1, mis à l'échelle automatiquement).
- `public/telecommande.html` : la télécommande des téléphones. `public/regie.html` : la régie.
- `installateur/` : installation sur un PC. `outils/construire.ps1` : fabrique le fichier d'installation.
- Données de l'app installée : `%LOCALAPPDATA%\EcranLED-SRC\data` (état du match, journal `app.log`).
