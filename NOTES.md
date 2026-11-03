# Fil (fil d'actu perso façon TikTok) — notes

## État (03/11/2026)
- Code fini et testé en local (robot + appli mobile/PC). **Pas encore en ligne** : en attente du compte GitHub de Lucas (voir GUIDE.md).
- Dernier passage local : 468 contenus, 45/52 sources OK. Les échecs viennent de pannes passagères de YouTube (404 ou 500 au hasard).

## Architecture
- `robot/collecte.py` (Python, feedparser + PyYAML) lit `sources.yaml` et `filtres.yaml`, puis écrit `docs/data/feed.json` et `etat.json`.
  - Fusion avec le fil précédent : une source en panne garde ses contenus. Âge max : 21 j pour les articles, 60 j pour les vidéos. 30 contenus max par source.
  - Image : celle du flux, agrandie (miniatures WordPress et Batiactu), sinon og:image de la page (120 pages max par passage).
  - Doublons : URL canonique + ressemblance (Jaccard) des titres ≥ 0,55 sur ±3 j. Le champ `aussi` liste les autres sources.
  - Les pubs Batiactu (`cap_pub`, `batiregie`) sont écartées.
- `robot/ia.py` : `enrichir(item)` vide, prévue pour l'IA. Champs `resume` et `score_ia` déjà lus par l'appli.
- `docs/` : PWA en JS vanilla, sans build. L'apprentissage se fait dans le localStorage (`fil.v1`) : poids par source, thème et mot.
  - Réglages dans `REGLES` (app.js) : zappé < 1,5 s → -0,25 ; > 8 s → +0,25 ; > 20 s → +0,45 ; like ±1 ; sauver +1,2 ; ouvrir +0,6 ; lecture vidéo +0,4 ; 1 carte sur 5 en découverte ; oubli de 3 %/jour.
- `.github/workflows/mise-a-jour.yml` : cron 6 fois par jour, commit de `docs/data` puis déploiement Pages (source = GitHub Actions).
- Prévisualisation locale : config `fil` dans `C:\Users\ezsed\Desktop\Claude\.claude\launch.json` (port 8765).

## Décisions
- GitHub Pages plutôt que Vercel : un seul compte.
- Envoi du code par git depuis le PC. L'authentification passe par Git Credential Manager (fenêtre navigateur), donc aucun jeton dans la conversation.
- Sources retirées : Batiactu TV et TELT (flux vides), Megaprojects et Tomorrow's Build (introuvables), Fully Charged (devenue une chaîne voitures), Xpair et Chaud Froid Performance (RSS cassé ou erreur SSL), Energy-Storage.news (aucune image accessible), Tunnels & Tunnelling et Archpaper (403).
- The Engineering Mindset (CVC, très pertinent) est en `actif: non` : flux 404 répété le 03/11. À réessayer.

## Prochaines étapes
1. Lucas crée son compte et le dépôt `fil` → `git init`, commit, `git remote add`, `git push` depuis `projets/fil-actu`.
2. Pages en mode « GitHub Actions », lancer le workflow, vérifier `etat.json` en ligne (les IP GitHub peuvent être bloquées par certains sites).
3. Installer sur son Android.
4. Plus tard : réessayer The Engineering Mindset, ajuster les filtres selon ses retours, brancher l'IA dans `ia.py`.
