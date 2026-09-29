# ADR-0014 — Catalogue OUAF WARE v3 : 38 jeux, 5 mondes en diorama, manches faciles, direction artistique « papier »

**Date** : 2026-09-30 · **Statut** : accepté · Remplace le catalogue et les mondes de l'[ADR-0013](0013-catalogue-ouaf-ware.md) (méthode d'intégration de l'ADR-0012 inchangée)

## Contexte

L'utilisateur a fourni la version suivante du prototype, `OUAF_WARE (1).html` (30/09, 6,5 Mo), avec la consigne : refaire la même intégration que pour la v2 (jeux réécrits nativement, plein écran, transitions / consigne / mèche / verdicts Boucan, duels jugés par le serveur), puis **supprimer tous les jeux absents de ce fichier**.

Le prototype v3 joue 28 solos et 10 duels (listes `POOL` et `DUELS`), dans 5 mondes (`BGMAP` : prairie, désert, trésor, futur, ville). Nouveautés : 7 solos et 1 duel, les mondes forêt / neige remplacés par prairie / désert / trésor construits en « diorama » (image de fond + pièces de décor posées, bande de sol en papier, brume, éclairage, particules), des objets en images « autocollant » (os, caisse, œufs, fusée, fruits, assiettes…), un contour papier blanc autour des personnages, du « juice » procédural sur les poses, trois sons enregistrés, et une liste de jeux « faciles » pour les premières manches.

## Décision

- **Catalogue = exactement les jeux jouables du prototype v3** : 28 solos et 10 duels.
  - **Retirés** (absents du fichier) : le solo `skate` et le duel `roi` (client, module serveur, planche `sprites/skate`, tests).
  - **Nouveaux solos** : `porte` (trésor), `ampoule` (futur, alternance), `gobelet` (trésor, bonneteau), `pasteque` (prairie, trancher les fruits sans toucher les bombes), `ballon` (désert, jauge de force maintenue), `photo` (futur, soucoupe dans le viseur), `assiettes` (désert, garder la pile en équilibre).
  - **Nouveau duel** `pieces` (futur) : chacun sur sa piste sous la même pluie de pièces et de bombes, le plus riche gagne. Autorité serveur (`modules/pieces.ts`) : chutes tirées par le serveur et publiées au départ, déplacements compensés en latence (`meta.at`), objet ramassé s'il touche le sol au-dessus du joueur (fenêtre de 120 ms), bombe = −2 pièces et 600 ms d'étourdissement ; déplacement local prédit.
  - **Jeux existants revus selon la v3** : chaque jeu est replacé dans son monde v3 ; `combo` (sac de frappe), `caisse`, `plateau` (œuf cassé), `hautbas` (bombe volante), `fusee` (image de fusée ; vitesse réduite en tactile), `corde` (corde en image), `gardien` (stade en image, vue du gardien), `panier` (gymnase peint), `ping` (table et raquettes en image, raquette qui suit le doigt), `soleil` (feu tricolore, regard du guetteur, feu orange pendant le demi-tour, plus long : 340 ms, tolérance 120 ms), `esquive` (nouvelle rue peinte). Identifiants conservés.
- **Mondes** : `ZONES = prairie | desert | tresor | futur | ville`. Les décors `foret` et `neige` sont supprimés. `ville` ne porte que `esquive` et `gardien` : elle n'est pas proposée seule dans le salon (MONDE : Mélange, Prairie, Désert, Trésor, Futur) mais reste jouée en Mélange. Valeurs d'une énumération changées ⇒ **`PROTOCOL_VERSION` 4**, `CONTRACT_REVISION` 4.0.0.
- **Manches faciles** : le catalogue marque `easy` les solos de la liste facile du prototype ; pendant les `rhythm.easyRounds` premières manches (4 par défaut, `game-config.ts`), le serveur tire dans ce sous-ensemble quand il en reste un dans le monde choisi (`pickMicrogame(…, early)`), sinon dans tout le monde.
- **Direction artistique v3, réécrite dans le moteur** :
  - `backdrops.ts` : `sceneBg(monde, sol, défilement, cielSeul, graine)` compose le diorama (image, pièces de décor tirées par la graine du jeu, bande de sol papier, brume, lumière, particules) et le met en cache ; `skyline()` pour les scènes 3D qui peignent leur propre sol.
  - Contour papier (`outline` par planche dans `manifest.json`, découpé une fois au chargement) et `juice()` (respiration, rebond de course, écrasement, recul…) appliqués à tous les personnages.
  - `item()` / `stretch()` dessinent les objets en images (`assets/images/items`), avec **repli dessiné** si l'image manque ; décor dans `images/decor`, scènes pleines dans `images/scenes`.
  - Sons `hit`, `select`, `fanfare` en fichiers (`assets/sounds`), les autres restent synthétisés.
- **Hors périmètre, volontairement non repris** (méta-jeu propre au prototype, qui entrerait en conflit avec le salon, les vies et l'autorité serveur de Boucan) : atouts (perks), roue / roulette, XP et titres, événements et sabotages, jeu en ligne PeerJS, 7 vies, duel en ligne `reflexe`, texture de papier plein écran, parallaxe à la souris.

## Conséquences

- 38 micro-jeux (28 solos, 10 duels, 0 boss). Un client en protocole 3 est refusé proprement (`PROTOCOL_MISMATCH`).
- Tests : fumée de tous les solos (dont les 7 nouveaux, en tactile aussi), chaque duel de bout en bout dont `pieces`, règles de `pieces` côté serveur ; 145 tests ; `npm run check:integration --full` 20/20.
- Le fichier HTML source n'est pas nécessaire au jeu : images et sons en ont été extraits une fois vers `client/public/assets`.
