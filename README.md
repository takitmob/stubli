# Parcours annuel — Croissance chrétienne

Application web statique (HTML/CSS/JS pur, aucune dépendance à installer) pour suivre
ton parcours de croissance chrétienne sur 52 semaines : lecture, évaluation,
notes et fiche d'étude complète — avec synchronisation entre tous tes appareils
via ton propre dépôt GitHub.

**100 % gratuit, 100 % open source, aucun service tiers.** Les seules briques
utilisées sont : GitHub Pages (hébergement), l'API GitHub (stockage de tes
données dans ton propre dépôt), et les polices Google Fonts (Fraunces, Inter,
IBM Plex Mono).

## 1. Mettre le site en ligne (GitHub Pages)

1. Crée un nouveau dépôt GitHub, par exemple `parcours-croissance-chretienne`
   (public ou privé — privé fonctionne aussi avec GitHub Pages sur un compte
   payant ; en public, n'importe qui avec le lien pourra voir la page, mais
   pas éditer tes données sans ton token).
2. Dépose tous les fichiers de ce dossier (`index.html`, `css/`, `js/`, `data/`)
   à la racine du dépôt, puis commit + push.
3. Dans le dépôt : **Settings → Pages → Source : Deploy from a branch**,
   branche `main`, dossier `/ (root)`. Sauvegarde.
4. Après une minute environ, ton site est accessible à
   `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/`.
5. Ajoute ce lien à l'écran d'accueil de ton téléphone (Safari/Chrome →
   « Ajouter à l'écran d'accueil ») pour l'ouvrir comme une app.

## 2. Activer la synchronisation entre appareils

L'app fonctionne déjà hors-ligne (elle sauvegarde tout dans le navigateur).
Pour retrouver ta progression sur un autre appareil, connecte le même dépôt
GitHub depuis l'onglet **Synchronisation** :

1. Crée un token d'accès personnel **fine-grained**, limité à ce seul dépôt :
   [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
   - **Repository access** : "Only select repositories" → choisis ton dépôt
   - **Permissions** → **Contents** : **Read and write**
   - Génère et copie le token (il ne sera plus jamais affiché).
2. Dans l'app, onglet **Synchronisation** : renseigne le propriétaire
   (ton pseudo GitHub), le nom du dépôt, la branche (`main` par défaut) et
   colle le token.
3. Clique **Enregistrer & charger depuis GitHub**. L'app crée automatiquement
   `data/progress.json` dans ton dépôt lors de la première sauvegarde.
4. Répète l'étape 2-3 sur chacun de tes appareils avec le même dépôt
   (un token différent par appareil est recommandé, mais pas obligatoire).
5. Coche « Synchroniser automatiquement » si tu veux que chaque modification
   soit poussée sur GitHub 2-3 secondes après ta saisie. Sinon, utilise le
   bouton **Sauvegarder maintenant sur GitHub**.

Le token n'est jamais transmis ailleurs qu'à `api.github.com`, directement
depuis ton navigateur : il n'y a pas de serveur intermédiaire. Il reste stocké
dans le `localStorage` de chaque appareil — pense à le régénérer/révoquer si
tu changes d'appareil ou si tu soupçonnes une fuite
(github.com/settings/tokens).

## 3. Comment fonctionne la synchronisation

- Chaque enregistrement local ajoute un horodatage (`updatedAt`).
- Au chargement, l'app compare l'horodatage local et celui du fichier
  `progress.json` sur GitHub, et garde automatiquement le plus récent.
- En cas de sauvegarde simultanée depuis deux appareils, GitHub renvoie un
  conflit que l'app résout en récupérant la dernière version avant de
  réessayer.
- Une sauvegarde manuelle (bouton **Exporter**) reste toujours possible en
  secours, dans l'onglet Synchronisation.

## 4. Structure du projet

```
index.html          → structure de la page (3 onglets : dashboard, sentier, sync)
css/style.css        → design (thème "manuscrit / sentier de pèlerinage")
js/app.js             → logique de l'app + synchronisation GitHub
data/seed.json        → les 52 semaines extraites de ton fichier Excel d'origine
```

Aucune étape de build : tu peux aussi ouvrir `index.html` directement en local
pour tester (double-clic, ou `python3 -m http.server` dans ce dossier).

## 5. Vie privée

Toutes tes données (évaluations, notes, fiches d'étude) restent soit dans le
navigateur de ton appareil, soit dans le dépôt GitHub que tu contrôles.
Aucune donnée n'est envoyée à un service autre que GitHub et Google Fonts
(chargement des polices uniquement).
