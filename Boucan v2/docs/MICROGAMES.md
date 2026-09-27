# Micro-jeux

44 micro-jeux : 28 solo, 13 duels, 3 boss (un par lieu). Liste et réglages : `shared/src/contracts/catalog.ts`. Les 21 derniers viennent du prototype OUAF WARE, réécrits dans cette architecture ([ADR-0012](adr/0012-nouveaux-mini-jeux.md)).

| Lieu | Solo | Boss |
| --- | --- | --- |
| Cour de récré | `cours`, `saute`, `attrape`, `stop`, `degage`, `bouge` (aussi en classe), `but`, `baisse`, `panier`, `caisse`, `combo`, `glisse`, `skate`, `lancer` | `boss-recre` |
| Cantine | `plateau`, `queue`, `puree`, `devore`, `renverse`, `soupe`, `recette` | `boss-cantine` |
| Classe | `efface`, `copie`, `avion`, `main`, `taille`, `gemmes`, `bulle` | `boss-classe` |
| Duels (tous lieux) | `degaine`, `patate`, `course`, `cristal`, `boules`, `glace`, `corde`, `radeau`, `boxe`, `soleil`, `roi`, `gardien`, `noir` | — |

### Les nouveaux en une ligne

| id | Consigne | Geste | Principe |
| --- | --- | --- | --- |
| `but` | MARQUE UN BUT ! | appui | frapper le ballon quand il arrive au pied |
| `baisse` | BAISSE-TOI ! | appui / ↓ | se baisser juste avant chaque ballon |
| `panier` | DANS LE PANIER ! | appui | anticiper le panier qui monte et descend |
| `caisse` | CASSE LA CAISSE ! | martèlement | casser la caisse avant la fin |
| `combo` | SUIS LE COMBO ! | gauche / droite | reproduire la suite affichée, chaque coup dans son temps |
| `glisse` | GLISSE SOUS LES TRONCS ! | appui / ↓ | glisser sous chaque tronc (défilement) |
| `skate` | RESTE SUR LA RAMPE ! | maintien gauche / droite | contre-braquer pour rester sur la rampe |
| `lancer` | LANCE LE PLUS LOIN ! | 2 appuis | force puis angle ; dépasser l'objectif |
| `recette` | RETIENS LA RECETTE ! | appui (← → + Espace) | mémoriser le burger puis l'empiler dans l'ordre |
| `gemmes` | RAMASSE LES GEMMES ! | ← ↑ → ↓ / croix à l'écran | la bonne flèche avant la fin de l'anneau |
| `bulle` | GONFLE LA BULLE ! | alternance | pomper gauche, droite, gauche… |
| `cristal` (duel) | ATTRAPE UN CRISTAL ! | attendre puis appui | un cristal de moins que de joueurs |
| `boules` (duel) | ESQUIVE LES BOULES ! | appui / ↓ | la même volée pour tous ; le plus touché perd |
| `glace` (duel) | COURSE SUR GLACE ! | martèlement dosé | trop pousser fait surchauffer et glisser |
| `corde` (duel) | TIRE LA CORDE ! | alternance | deux équipes au hasard |
| `radeau` (duel) | RAME ! | alternance | deux équipes ; ralentir avant les rapides |
| `boxe` (duel) | BOXE ! | droite = frappe, maintien gauche = garde | 1 contre 1 (le joueur impair boxe la bombe) |
| `soleil` (duel) | 1, 2, 3… SOLEIL ! | alternance (guetteur : → se retourner, ← feinte) | un guetteur tiré au sort contre les coureurs |
| `roi` (duel) | LE ROI DE LA COLLINE ! | alternance + maintien (roi : ← →) | un roi tiré au sort contre les grimpeurs |
| `gardien` (duel) | TIRS AU BUT ! | toucher gauche / milieu / droite | un gardien contre 3 tireurs max |
| `noir` (duel) | CACHE-CACHE ! | maintien gauche / droite, milieu = action | un chasseur à la lampe contre les proies |

## Principe

Un micro-jeu dure ~4 s à vitesse normale (`durationMs` dans le catalogue ; quelques-uns plus, comme `lancer` ou `recette`). Après chaque « PLUS VITE ! », le temps de jeu court `tempo` fois plus vite : on conçoit le jeu une fois, il s'accélère tout seul. `ctx.level` (1 → 3) monte après chaque boss : c'est là qu'on durcit (plus d'obstacles, fenêtres plus courtes). Les duels ne s'accélèrent pas.

Tous les joueurs reçoivent la même graine (`ctx.rng`, `ctx.seed`) : même situation pour tout le monde. L'aléa purement visuel (éclats, étincelles) passe par `fxRand()` pour ne jamais décaler cette graine.

## Ajouter un micro-jeu solo ou boss

Aucun code serveur.

1. **Catalogue** — `shared/src/contracts/catalog.ts` : `{ id, kind: 'solo' | 'boss', zones, durationMs, hint }`. `hint` choisit l'icône de geste affichée avec la consigne (`tap`, `mash`, `hold`, `move`, `drag`, `wait`, `alternate`). `weight` optionnel.
2. **Client** — `client/src/microgames/games/<id>.ts` :

   ```ts
   export default defineMicrogame({
     id: 'saute',
     verb: 'SAUTE !',            // consigne affichée : courte, impérative, en capitales
     create(ctx) {
       return {
         input(e) { /* e.type : 'down' | 'up' | 'move' | 'key' (flèches, ZQSD) | 'keyup' */ },
         update(dt, t) { /* dès que l'issue est connue : ctx.win() ou ctx.lose() */ },
         draw(t) { /* toute la scène 1280×720 */ },
         timeout: () => 'failure', // issue si rien n'est décidé à la fin de la mèche
         dispose() { /* facultatif : libérer une ressource hors closure */ },
       };
     },
   });
   ```

3. **Registre** — importer le fichier dans `client/src/microgames/index.ts` (`MICROGAME_DEFS`).
4. `npm test` : un test vérifie que le client implémente exactement le catalogue, que chaque consigne est valide, et joue chaque micro-jeu en entier (3 niveaux, entrées aléatoires) sur un faux canvas.

`ctx.win()` / `ctx.lose()` envoient le résultat au serveur immédiatement ; la scène continue jusqu'à la fin de la mèche (comme dans WarioWare). Les bots serveur sont simulés automatiquement (réussite selon leur niveau et le tempo).

Boîte à outils :
- `common.ts` : `hero(ctx)` (ton personnage), `npc(ctx, i)` (un figurant qui porte le personnage d'un autre joueur), `isPress(e)` (appui volontaire, sans auto-répétition), `sideOf(e)` (gauche / droite), `byLevel`, `between`, `fxRand`, sol `GY`.
- `backdrops.ts` : décors récré / cantine / classe dessinés, et `sceneBg(id, solY, défilement, cielSeul)` pour les décors peints `foret`, `ville`, `neige`, `futur` (calés sur le sol du jeu).
- `props.ts` : bombe, drapeau, plateau, abeille, prof…, `keyCap` (touche / flèche à l'écran), `ringTimer`, `gauge`, `gem`, `crystal`, `chest`, `snowBall`.
- `engine/draw.ts` (formes au trait épais, texte contouré, étoiles, bulles), `ctx.sfx(nom)`, `ctx.shake(ms)`.
- Poses de personnage (manifeste) : `idle`, `run`, `start`, `stop`, `punch`, `kick`, `throw`, `duck`, `slide`, `ready`, `hold`, `catch`, `carry`, `hurt`, `win`, `lose`, `box*`, `paddle*`, `pull*`. `assets.hasPoseArt(perso, pose)` dit si le personnage a son propre dessin (sinon le jeu dessine l'accessoire).

## Ajouter un duel

Un duel réunit tous les joueurs en vie dans une arène commune : le serveur simule et tranche.

1. **Catalogue** — entrée `kind: 'duel'`.
2. **Serveur** — `server/src/engine/minigames/modules/<id>.ts` (`defineMiniGame`) puis ajout dans `DUEL_MODULES` (`catalog.ts` du même dossier) :
   - `input: { schema, ratePerSecond }` — schéma Zod des intentions acceptées ;
   - `start(ctx)` renvoie `onInput`, `onTick`, `isComplete`, `results` ;
   - `ctx.setState(état)` (diffusé à `stateHz`), `ctx.emit(événement)`, `ctx.settle(joueur, issue)` dès qu'une issue est connue ;
   - les bots jouent via `ctx.isBot` / `ctx.skillOf` ; juger les appuis sur `meta.at` (temps compensé de la latence) ;
   - `kits/duel.ts` : `twoTeams`, `Alternation` (gauche / droite), `BotClock`, schéma `Side`.
   Un module ne touche jamais aux sockets, phases, vies ou timers. L'état publié doit être du JSON pur (pas d'`Infinity`).
3. **Client** — `games/<id>.ts` : dessiner l'état reçu (`onState`, `onEvent`), envoyer les intentions (`ctx.send(input)`), `duel-common.ts` pour placer les combattants. Prédire localement ce qui doit réagir tout de suite (son propre appui, son propre déplacement).
4. **Tests** — `server/test/*duels*.test.ts` (horloge simulée) ; le test client `client/test/duels.test.ts` fait tourner automatiquement le module réel avec le rendu ; `npm run check:integration` contre un serveur lancé.

## Vérifier en jeu

- `?preview=<id>` (dev uniquement) : un micro-jeu seul, en boucle ; `&level=2`, `&seed=5`, `&players=4`, `&freeze=1500` (image figée). Les duels y tournent avec leur module serveur et des bots.
- `?offline` : partie solo avec bots, sans serveur ; `&games=boxe,skate` (liste blanche), `&duelEvery=1`, `&bots=5`.
- `BOUCAN_MICROGAMES=saute,patate` côté serveur pour ne jouer que certains micro-jeux.

## Modifier ou retirer

- Réglages (durée, lieux, poids) : le catalogue uniquement.
- Désactiver sans supprimer : `BOUCAN_MICROGAMES` (liste blanche d'ids).
- Retirer : supprimer l'entrée du catalogue, le fichier client et son import (et le module serveur pour un duel). Le test de couverture signale tout oubli.
