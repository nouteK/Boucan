# BOUCAN — notes pour les sessions Claude

Jeu multijoueur façon WarioWare. Monorepo npm dans ce dossier (racine git : le dossier parent `Boucan-v2/`, voir « Git » plus bas) : `shared/` (contrat Zod), `server/` (moteur + protocole), `sdk/` (client réseau, moteur local, bots), `client/` (le jeu). Claude est seul responsable de tout le projet (Astra n'est plus utilisé). Vue d'ensemble : `docs/ARCHITECTURE.md`.

## Commandes

- `npm run dev` → serveur :3001 + client http://localhost:5180 (`PORT=3002 BOUCAN_SERVER_PORT=3002 npm run dev` si 3001 est pris)
- `npm test` · `npm run typecheck` · `npm run build` (doivent passer avant de rendre la main)
- `npm run check:integration -- --url ws://127.0.0.1:<port>/ws [--full]` contre un serveur lancé

## Git

- Dépôt `origin` = https://github.com/nouteK/Boucan (compte GitHub de l'utilisateur : nouteK). La copie de travail est sur `dev`.
- `main` = version en ligne. On n'y touche **que** quand l'utilisateur le demande (après avoir testé `dev`) : fusion de `dev` dans `main`, push, puis `Mettre en ligne.bat`.
- `dev` = tous les commits, poussés sur `origin/dev` (CI GitHub : tests + build). Ne committer que ce qui passe `npm test` et `npm run build`.
- L'utilisateur teste `dev` avec `Tester la version dev.bat` (http://localhost:3002 + lien public) ; `Mettre en ligne.bat` déploie `main`. Les deux construisent depuis la branche git, pas depuis le dossier.
- Plusieurs sessions Claude peuvent travailler en même temps dans cette copie : ne committer que ses propres fichiers (`git commit -- <chemins>`), jamais `stash`, `reset --hard`, `checkout -- <fichier>` ou `clean` sur le travail d'une autre session. Pour un chantier isolé : `git worktree add` hors de OneDrive.

## Règles

- Contrat : `shared/src/contracts/*.ts` (Zod) fait foi. Changement cassant ⇒ `PROTOCOL_VERSION`+1 ; compatible ⇒ `CONTRACT_REVISION` mineur ; toujours noter dans `CHANGELOG.md`.
- `server/src/engine` et `server/src/gateway` : aucune API Node, jamais `Date.now()` (le temps est passé en paramètre) — ils tournent aussi dans le navigateur (`?offline`).
- Micro-jeux : les 38 jeux du prototype OUAF WARE v3 (ADR-0014), chacun dans un des 5 mondes (`prairie`, `desert`, `tresor`, `futur`, `ville`) ; décors en diorama (`sceneBg`), objets en images avec repli dessiné (`item`), solos `easy` pour les premières manches. Micro-jeu solo = entrée du catalogue partagé + `client/src/microgames/games/<id>.ts` + import dans `index.ts`. Duel = en plus un module dans `server/src/engine/minigames/modules/`. Deux actions à la fois sur écran tactile : `pad.ts`. Voir `docs/MICROGAMES.md`. Les tests jouent chaque micro-jeu en entier (faux canvas) et chaque duel avec son module serveur. Pour regarder un jeu : `?preview=<id>&freeze=1500` (dev).
- Assets : uniquement via `client/public/assets/manifest.json` (sauf le fond des écrans `assets/menu/fond.webp`). Personnages = ceux du manifeste ; une pose spéciale passe par `poses` (éventuellement sur une planche `sprite`), avec une pose de repli pour les autres personnages.
- Menu principal : titre vectoriel (`logo.ts`), CRÉER UNE PARTIE, champ code + REJOINDRE, MUSIQUE / SONS en haut à droite — rien d'autre ; boutons dessinés en CSS, aucune image dans les boutons. Polices : Luckiest Guy (titres/boutons), Inter (champs, petits textes). Palette jaune / bleu / crème / noir sur le fond nuit.
- Valeurs réglables : `server/src/config/game-config.ts` ou `shared/src/contracts/rules.ts`. Pas de constantes magiques.
- Ne jamais tuer tous les processus `node` : arrêter le PID qui écoute sur le port concerné.
- Un conteneur Docker de l'utilisateur peut occuper le port 3001 : ne pas y toucher, utiliser un autre port.
