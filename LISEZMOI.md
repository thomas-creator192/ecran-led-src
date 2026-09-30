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

## Le jour du match

1. Double-clic sur l'icône **« Écran LED SRC »** : la régie s'ouvre.
2. **« Lancer la diffusion »** : l'affichage s'ouvre en plein écran sur l'écran LED.
3. Les bénévoles scannent le **QR code** avec leur téléphone (connecté au Wi-Fi du stade) et tapent leur prénom.
4. Sur le téléphone : **Coup d'envoi**, **BUT**, **temps additionnel**, **fin de mi-temps**… Le bouton orange **Annuler** rattrape n'importe quelle erreur.
5. Après le match : **« Quitter l'app »** en haut de la régie.

## Bon à savoir

- **Deux bénévoles appuient sur BUT en même temps** : le but ne compte qu'une fois.
- **Le chrono** continue de tourner après 45:00 et 90:00, mais passe en **rouge**. Le temps additionnel annoncé s'affiche à côté (« +3 »).
- **Si le PC redémarre** en plein match : double-clic sur l'icône, le score et le chrono reprennent où ils en étaient.
- **Jeunes catégories** : durée des mi-temps et des prolongations dans les réglages de la régie.
- **Si l'écran LED n'affiche qu'une partie de l'image** : Réglages → Zone d'affichage → « Un rectangle précis », avec la position et la taille données par le logiciel de l'écran.

## Sécurité

- La **régie** (réglages, QR code, diffusion, arrêt) ne s'ouvre que sur le PC du stade.
- Un téléphone n'a accès à la télécommande **qu'après avoir scanné le QR code**. Chaque téléphone a son propre accès, visible dans la régie (« Téléphones connectés ») et **retirable** d'un clic. Un accès expire tout seul après 24 h sans utilisation.
- **« Nouveau code »** change le QR code et déconnecte tous les téléphones.
- Le prénom inscrit dans le journal est celui enregistré pour le téléphone : impossible d'agir sous le nom de quelqu'un d'autre.
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
- `public/ecran.html` : l'affichage de l'écran LED (dessiné en 1200 × 400, format 3:1, mis à l'échelle automatiquement).
- `public/telecommande.html` : la télécommande des téléphones. `public/regie.html` : la régie.
- `installateur/` : installation sur un PC. `outils/construire.ps1` : fabrique le fichier d'installation.
- Données de l'app installée : `%LOCALAPPDATA%\EcranLED-SRC\data` (état du match, journal `app.log`).
