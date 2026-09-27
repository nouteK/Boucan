# ADR-0012 — Mini-jeux repris du prototype OUAF WARE

**Date** : 2026-09-27 · **Statut** : accepté

## Contexte

L'utilisateur a fourni `OUAF_WARE.html` : un prototype autonome (une page, canvas 1280×800, 4 joueurs dont 3 renards IA, assets en base64) contenant 38 micro-jeux. Boucan en avait déjà repris 15 (mêmes identifiants : `cours`, `saute`, `attrape`, `stop`, `degage`, `bouge`, `plateau`, `queue`, `puree`, `devore`, `renverse`, `soupe`, `patate`, `degaine`, et `course4` = notre `course`). La demande : intégrer les autres comme de vrais micro-jeux Boucan, sans substituer l'architecture du prototype à celle du jeu.

## Décision

- **Rien du prototype n'est exécuté tel quel.** Chaque jeu est réécrit dans l'architecture existante : solo = `defineMicrogame` côté client (issue signalée par `ctx.win()` / `ctx.lose()`, bots simulés par le module local du serveur) ; duel = module serveur autoritaire (`defineMiniGame`, état diffusé, événements, bots serveur) + rendu client. Même annonce, même mèche, mêmes verdicts, vies, rythme et sélection que les autres.
- **21 jeux ajoutés** : 11 solos (`but`, `baisse`, `panier`, `caisse`, `combo`, `glisse`, `skate`, `lancer`, `recette`, `gemmes`, `bulle`) et 10 duels (`cristal`, `boules`, `glace`, `corde`, `radeau`, `boxe`, `soleil`, `roi`, `gardien`, `noir`).
- **2 jeux écartés car doublons** d'un jeu existant : `recoit` (= RATTRAPE LE PLATEAU) et `evite` (= ÉVITE LA PURÉE). Les variantes « œufs / boules de neige / potion » de `plateau`, `puree`, `soupe`, `renverse` restent celles de Boucan.
- **Identifiants renommés** quand le nom du prototype ne décrivait plus le jeu : `ketchup` → `bulle`, `compose` → `gemmes`, `lance` → `panier`, `part` → `cristal`, `bouffe` → `boules`, `self` → `glace`.
- **Commandes** : le prototype utilisait 6 touches (A E Z Q S D). Boucan reste jouable à un doigt ou au clavier : appui, **alternance gauche / droite** (moitiés d'écran ou ← →, nouvelle icône de geste `alternate`), maintien (doigt posé ou ↓), croix directionnelle à l'écran quand il faut 4 directions (`gemmes`). ZQSD / WASD s'ajoutent aux flèches ; l'auto-répétition d'une touche maintenue ne compte plus comme un martèlement.
- **Rôles asymétriques** (`soleil`, `roi`, `gardien`, `noir`) : le rôle spécial est tiré au sort par le module serveur (aléa secret) et publié dans l'état ; chaque joueur voit la scène depuis son rôle. `gardien` limite les tireurs à 3 (les autres regardent depuis les tribunes, sans risque) pour garder une durée de duel raisonnable.
- **Équipes** (`corde`, `radeau`) : deux équipes tirées au sort, force divisée par la taille de l'équipe (un effectif impair n'est pas un handicap).
- **Personnages** : ceux de Boucan uniquement. La planche du chien du prototype est un sur-ensemble de la nôtre (mêmes images + `kick`, `duck`, `slide`, `throw`) : elle la remplace. Ses poses spéciales (gants de boxe, pagaie, corde) sont branchées via le manifeste (`poses` → `{ sprite, anim, scale }`) ; un personnage sans ces planches retombe sur une pose générique (renard : `sx` / `sy` / `rot` / `dx`), et le jeu dessine alors l'accessoire (pagaie) lui-même.
- **Assets** extraits du HTML vers `client/public/assets/` (manifeste) : planche du chien, `chien-boxe`, `chien-boxe-ko`, `chien-rame`, `chien-corde`, `balle`, `skate`, `radeau`, et 4 décors (`foret`, `ville`, `neige`, `futur`) avec leur ligne de sol (`sceneBg()` les cale sur le sol du jeu). Non repris : la planche de nourriture (aucun jeu ajouté ne l'utilise), le renard et la bombe (identiques aux nôtres), la police Bricolage Grotesque (Luckiest Guy partout), le son synthétisé (remplacé par le bus audio de Boucan, + 3 effets `hit`, `block`, `splash`).

## Conséquences

- Catalogue : 44 micro-jeux (28 solos, 13 duels, 3 boss). Contrat compatible : `CONTRACT_REVISION` 2.1.0 (nouvelles entrées, nouvel indice `alternate`, nouvelles entrées / états / événements de duels) ; pas de changement de `PROTOCOL_VERSION`.
- Les duels du prototype duraient souvent 10–12 s ; ils sont raccourcis (6–10 s, 15 s max pour `gardien` qui se termine dès le dernier tir) et rééquilibrés pour les bots de Boucan.
- Tests : fumée de tous les solos (3 niveaux × 3 graines, entrées aléatoires, faux canvas), chaque duel de bout en bout (module serveur réel + rendu client, 2 / 3 / 5 joueurs), règles des nouveaux duels côté serveur.
- Outil de dev `?preview=<id>` (retiré du build) pour jouer un micro-jeu seul, figer une image (`&freeze=`), y compris les duels (module serveur exécuté dans la page).
- Le fichier HTML source n'est plus nécessaire au jeu.
