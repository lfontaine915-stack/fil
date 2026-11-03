# Guide : mettre le Fil en ligne et l'installer sur ton téléphone

Durée : environ 15 minutes. Tout est gratuit.

---

## Étape 1 — Créer ton compte GitHub (5 min)

GitHub garde le code de ton appli et fait tourner le robot qui la met à jour.

1. Va sur **https://github.com/signup**
2. Entre ton e-mail, choisis un mot de passe et un **pseudo** (il apparaîtra dans l'adresse de ton appli, par exemple `lucas-f`).
3. Valide le code reçu par e-mail.
4. Si GitHub te pose des questions (équipe, usage…), tu peux toutes les passer. Choisis l'offre **Free**.

## Étape 2 — Créer le dossier de l'appli (1 min)

1. Une fois connecté, clique sur le **+** en haut à droite puis **New repository**.
2. **Repository name** : `fil`
3. Coche **Public** (obligatoire pour l'hébergement gratuit ; il n'y a rien de personnel dedans).
4. **Ne coche rien d'autre** (pas de README, pas de .gitignore).
5. Clique **Create repository**.

➡️ **Dis-moi ton pseudo GitHub** : j'envoie le code depuis ton PC. Une fenêtre GitHub va s'ouvrir dans ton navigateur pour que tu autorises l'envoi. Clique **Authorize** ou **Sign in with your browser**. Je ne vois jamais ton mot de passe.

## Étape 3 — Activer le site (1 min)

1. Sur la page de ton dossier `fil`, clique sur **Settings** (l'onglet avec un engrenage, en haut).
2. Dans le menu de gauche, clique sur **Pages**.
3. Sous **Build and deployment** › **Source**, choisis **GitHub Actions**.

C'est tout, rien d'autre à remplir.

## Étape 4 — Lancer le robot une première fois (2 min)

1. Clique sur l'onglet **Actions** (en haut).
2. Si GitHub affiche un bouton vert *« I understand my workflows, go ahead and enable them »*, clique dessus.
3. À gauche, clique **Mise à jour du fil**, puis à droite **Run workflow** › **Run workflow** (bouton vert).
4. Attends 2–3 minutes : une coche verte ✅ apparaît.
5. Clique sur la ligne terminée : l'adresse de ton appli s'affiche sous **collecte**. Elle ressemble à
   **`https://TON-PSEUDO.github.io/fil/`**

Ensuite, le robot tourne tout seul **6 fois par jour** (5h, 8h, 11h, 14h, 17h, 20h environ), même PC éteint.

## Étape 5 — Installer l'appli sur ton Android (1 min)

1. Ouvre **Chrome** sur ton téléphone et va à l'adresse `https://TON-PSEUDO.github.io/fil/`
2. Touche les **⋮** (trois points en haut à droite).
3. Touche **Ajouter à l'écran d'accueil**, puis **Installer**.
4. L'icône **Fil** (quatre barres de couleur) apparaît sur ton écran d'accueil. Elle s'ouvre en plein écran, comme une vraie appli.

## Sur ton PC

Ouvre la même adresse dans Chrome ou Edge. Pour l'installer comme une appli : icône **⊕ Installer** à droite de la barre d'adresse.
Raccourcis : **↑ ↓** défiler · **L** j'aime · **S** sauver · **O** ouvrir · **T** traduire · **Espace** lire la vidéo.

---

## Utiliser le Fil

| Geste | Effet |
|---|---|
| Glisser vers le haut | carte suivante |
| Double-tape sur la carte | j'aime ❤️ |
| Tape sur le texte | affiche tout l'extrait |
| ▶ au centre | lit la vidéo dans la carte |
| Marque-page | ajoute aux **Favoris** (bouton en haut à droite) |
| ⋯ en haut à droite | ce que le fil a appris, état des sources, sauvegarde |

**Ce que le fil apprend** : il fait remonter les sources, thèmes et mots que tu likes, sauvegardes, ouvres ou regardes longtemps, et fait descendre ce que tu zappes en moins d'une seconde et demie. Une carte sur cinq est tirée au hasard pour te faire découvrir autre chose.

**Bon à savoir** : tes likes, favoris et goûts sont enregistrés **sur l'appareil**. Pour les passer du téléphone au PC : menu ⋯ › **Exporter**, puis **Importer** sur l'autre appareil.

---

## Modifier les sources toi-même

1. Sur GitHub, ouvre ton dossier `fil` puis clique sur **sources.yaml**.
2. Clique sur le **crayon ✏️** (en haut à droite du fichier).
3. Modifie (le fichier explique comment en haut), puis bouton vert **Commit changes**.
4. Le robot se relance tout seul dans la minute.

Même chose pour **filtres.yaml** : les mots qui écartent un contenu, les mots de chaque thème, et tes mots favoris.

⚠️ Garde bien les espaces en début de ligne. Si le robot affiche une croix rouge ❌ dans **Actions** après ta modification, c'est souvent un décalage d'espaces. Envoie-moi une capture, je corrige.

## Si quelque chose ne va pas

| Problème | Solution |
|---|---|
| Une source est marquée « en pause » dans ⋯ | YouTube et certains sites ont des pannes passagères. Ses anciens contenus restent, elle revient au passage suivant. |
| Le fil ne se met plus à jour | Onglet **Actions** : si GitHub a mis le robot en pause, un bandeau propose **Enable workflow**. Clique dessus. |
| L'appli affiche une ancienne version | Ferme-la complètement et rouvre-la. |
| « Tu as tout vu » | Bravo ! Le prochain arrivage est indiqué. Tu peux aussi « Revoir d'anciens contenus ». |
