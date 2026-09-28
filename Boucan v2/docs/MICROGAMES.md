# Micro-jeux

32 micro-jeux, tous issus du prototype OUAF WARE et réécrits dans cette architecture ([ADR-0012](adr/0012-nouveaux-mini-jeux.md), [ADR-0013](adr/0013-catalogue-ouaf-ware.md)) : 22 solos et 10 duels, sans boss. Liste et réglages : `shared/src/contracts/catalog.ts`.

Chaque micro-jeu se passe dans l'un des 4 **mondes** (le « monde » choisi dans le salon, ou « Mélange ») :

| Monde | Solos | Duels |
| --- | --- | --- |
| Forêt | `saute`, `bouge`, `caisse`, `glisse` | `patate`, `roi`, `corde`, `radeau` |
| Ville | `cours`, `but`, `baisse`, `skate`, `esquive`, `fusee` | `gardien`, `sauter`, `boxe` |
| Neige | `hautbas`, `degage`, `plateau`, `puree` | `degaine`, `soleil` |
| Futur | `attrape`, `combo`, `panier`, `lancer`, `rythme`, `laser`, `bulle`, `soupe` | `ping` |

Quelques identifiants sont historiques (`puree` = boules de neige, `soupe` = fiole, `plateau` = œufs, `panier`, `bulle`) : ils restent stables pour la liste blanche `BOUCAN_MICROGAMES` et les tests.

### En une ligne

| id | Consigne | Geste (tactile · clavier) | Principe |
| --- | --- | --- | --- |
| `cours` | COURS ! | martèlement | sprinter jusqu'au drapeau ; plus le jeu accélère, moins chaque appui donne |
| `saute` | SAUTE PAR-DESSUS ! | appui · ↑ / Espace | trois bombes roulent, chacune à sa vitesse : sauter par-dessus |
| `attrape` | ATTRAPE ! | toucher l'endroit · ← → maintenus | se placer sous l'os qui tombe (le vent le balance dès le niveau 2) |
| `bouge` | NE BOUGE PAS ! | rien | ne rien toucher malgré l'abeille (et les faux « TAPE ! ») |
| `but` | MARQUE UN BUT ! | appui | frapper le ballon quand il arrive au pied |
| `combo` | SUIS LE COMBO ! | gauche / droite · ← → | après « PRÊT… GO ! », reproduire la suite, chaque coup dans son temps |
| `baisse` | BAISSE-TOI ! | appui · ↓ | se baisser juste avant chaque ballon |
| `panier` | DANS LE PANIER ! | appui | gymnase en 3D : tirer pour que le panier mobile soit sur la ligne à l'arrivée |
| `lancer` | LANCE LE PLUS LOIN ! | 2 appuis | force puis angle ; dépasser l'objectif |
| `skate` | RESTE SUR LA RAMPE ! | maintien gauche / droite · ← → | contre-braquer le vent pour rester sur la route |
| `esquive` | ESQUIVE LES BOMBES ! | gauche / droite · ← → | changer de voie (3 voies) pour laisser passer les bombes |
| `hautbas` | SAUTE ET BAISSE-TOI ! | moitié droite = saut, gauche = baisse · ↑ ↓ | sauter les bombes au sol, se baisser sous les bombes volantes |
| `rythme` | RÉPÈTE LE RYTHME ! | appuis | écouter le tambour, puis répéter le rythme |
| `fusee` | ESQUIVE LA FUSÉE ! | boutons ◀ ▶ + SAUTE · ← → ↑ | trois fusées annoncées : rasante, haute, en piqué ou à tête chercheuse |
| `laser` | CACHE-TOI DES LASERS ! | garder le doigt où aller · flèches | avant le tir, se cacher derrière le métal (le verre ne protège pas) |
| `caisse` | CASSE LA CAISSE ! | martèlement | casser la caisse avant la fin |
| `degage` | SHOOTE LES BOMBES ! | appui en rythme | quatre bombes arrivent en cadence : shooter chacune dans la zone jaune |
| `bulle` | GONFLE LA BULLE ! | alternance | pomper gauche, droite, gauche… |
| `glisse` | GLISSE SOUS LES TRONCS ! | appui · ↓ | glisser sous chaque tronc (défilement) |
| `plateau` | RATTRAPE LES ŒUFS ! | appui juste avant | deux œufs lancés l'un après l'autre : lever les bras au dernier moment |
| `puree` | ÉVITE LA NEIGE ! | toucher / glisser · ← → | s'écarter de l'ombre des boules de neige |
| `soupe` | REMPLIS LA FIOLE ! | appui | lâcher la potion du drone pile au-dessus de ta fiole |
| `patate` (duel) | PATATE CHAUDE ! | appui | passer la bombe avant qu'elle explose |
| `degaine` (duel) | ATTENDS LE SIGNAL… | appui | appuyer dès « TAPE ! », jamais avant ; le plus lent perd |
| `soleil` (duel) | 1, 2, 3… SOLEIL ! | alternance (guetteur : → se retourner, ← feinte) | un guetteur tiré au sort contre les coureurs |
| `roi` (duel) | LE ROI DE LA COLLINE ! | boutons ◀ ▶ (+ BOMBE pour le roi) · ← → ↑ | le roi bombarde la pente ; les grimpeurs montent seuls et esquivent |
| `gardien` (duel) | TIRS AU BUT ! | toucher gauche / milieu / droite | un gardien contre 3 tireurs max |
| `sauter` (duel) | CORDE À SAUTER ! | appui | sauter à chaque passage de la corde, qui tourne de plus en plus vite |
| `ping` (duel) | PING-PONG ! | boutons ◀ ▶ + FRAPPE · ← → ↑ | matchs à deux (l'impair contre la bombe), premier à 2 points |
| `corde` (duel) | TIRE LA CORDE ! | alternance | deux équipes au hasard |
| `radeau` (duel) | RAME ! | alternance | deux équipes ; ralentir avant les rapides |
| `boxe` (duel) | BOXE ! | droite = frappe, maintien gauche = garde | 1 contre 1 (le joueur impair boxe la bombe) |

## Principe

Un micro-jeu dure ~4 à 7 s à vitesse normale (`durationMs` dans le catalogue). Après chaque « PLUS VITE ! », le temps de jeu court `tempo` fois plus vite : on conçoit le jeu une fois, il s'accélère tout seul. `ctx.level` (1 → 3) monte à la fin de chaque niveau : c'est là qu'on durcit (plus d'obstacles, fenêtres plus courtes). Les duels ne s'accélèrent pas.

Tous les joueurs reçoivent la même graine (`ctx.rng`, `ctx.seed`) : même situation pour tout le monde. L'aléa purement visuel (éclats, étincelles) passe par `fxRand()` pour ne jamais décaler cette graine.

Chaque jeu s'affiche en plein écran 1280×720 dans le déroulé Boucan : interlude (compteur, bandeaux) → zoom dans l'écran → consigne + icône de geste → jeu avec la mèche → verdict sur la scène du monde.

## Commandes

Tout se joue au doigt **ou** au clavier (flèches, ZQSD / WASD, Espace / Entrée). Événements reçus par `input(e)` : `down` / `up` / `move` (pointeur, avec son `id` : plusieurs doigts à la fois), `key` (avec `repeat`), `keyup`.

Pour les jeux à plusieurs actions simultanées (se déplacer **et** sauter / frapper / lancer), `pad.ts` fournit des **boutons à l'écran** : ronds, en bas à gauche / à droite, dessinés seulement en mode tactile (`ctx.touch`) ; chaque doigt presse son bouton, glisser d'un bouton à l'autre bascule. Au clavier, le même `Pad` affiche des touches au même endroit et reçoit les flèches ; Espace, un clic ou un appui hors des boutons déclenchent l'action `tap`, et `halves` fait jouer les moitiés d'écran à la souris.

```ts
const pad = new Pad(ctx, [
  { action: 'left', label: '◀', x: PAD_LEFT[0], y: PAD_Y, keys: ['left'] },
  { action: 'right', label: '▶', x: PAD_LEFT[1], y: PAD_Y, keys: ['right'] },
  { action: 'jump', label: 'SAUTE', x: PAD_RIGHT[0], y: PAD_Y, keys: ['up'], big: true },
], { tap: 'jump' });
// input(e) : for (const ev of pad.input(e)) if (ev.down && ev.action === 'jump') …
// update   : pad.axis('left', 'right')      draw : pad.draw()
```

## Ajouter un micro-jeu solo

Aucun code serveur.

1. **Catalogue** — `shared/src/contracts/catalog.ts` : `{ id, kind: 'solo', zones: ['ville'], durationMs, hint }`. `hint` choisit l'icône de geste affichée avec la consigne (`tap`, `mash`, `hold`, `move`, `drag`, `wait`, `alternate`, `updown`). `weight` optionnel. (`kind: 'boss'` reste possible : le moteur clôt alors chaque niveau par un boss, +1 vie en cas de réussite ; le catalogue actuel n'en a pas.)
2. **Client** — `client/src/microgames/games/<id>.ts` :

   ```ts
   export default defineMicrogame({
     id: 'saute',
     verb: 'SAUTE !',            // consigne affichée : courte, impérative, en capitales (24 caractères max)
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
4. `npm test` : un test vérifie que le client implémente exactement le catalogue, que chaque consigne est valide, et joue chaque micro-jeu en entier (3 niveaux, 3 graines dont une en mode tactile, entrées aléatoires) sur un faux canvas.

`ctx.win()` / `ctx.lose()` envoient le résultat au serveur immédiatement ; la scène continue jusqu'à la fin de la mèche (comme dans WarioWare). Les bots serveur sont simulés automatiquement (réussite selon leur niveau et le tempo).

Boîte à outils :
- `common.ts` : `hero(ctx)` (ton personnage), `npc(ctx, i)` (un figurant qui porte le personnage d'un autre joueur), `isPress(e)` (appui volontaire, sans auto-répétition), `sideOf(e)` (gauche / droite), `byLevel`, `between`, `fxRand`, sol `GY`.
- `backdrops.ts` : `sceneBg(monde, solY, défilement, cielSeul)` — le décor peint du monde, calé sur le sol du jeu.
- `road.ts` : la route vue de dos (`esquive`, `skate`) : `drawRoad`, `roadPoint(distance, côté)`, `enterRoad()`.
- `pad.ts` : boutons à l'écran / touches (voir *Commandes*).
- `props.ts` : bombe, explosion, drapeau, abeille, panneau, œuf, fiole, drone, boules de neige, `keyCap` (touche / flèche à l'écran), `ringTimer`, `gauge`.
- `engine/draw.ts` (formes au trait épais, texte contouré, étoiles, bulles), `ctx.sfx(nom)`, `ctx.shake(ms)`.
- Poses de personnage (manifeste) : `idle`, `run`, `start`, `stop`, `punch`, `kick`, `throw`, `duck`, `slide`, `ready`, `hold`, `catch`, `carry`, `hurt`, `win`, `lose`, `box*`, `paddle*`, `pull*`, `ping*`. `assets.hasPoseArt(perso, pose)` dit si le personnage a son propre dessin (sinon le jeu dessine l'accessoire).

## Ajouter un duel

Un duel réunit tous les joueurs en vie dans une arène commune : le serveur simule et tranche.

1. **Catalogue** — entrée `kind: 'duel'`.
2. **Serveur** — `server/src/engine/minigames/modules/<id>.ts` (`defineMiniGame`) puis ajout dans `DUEL_MODULES` (`catalog.ts` du même dossier) :
   - `input: { schema, ratePerSecond }` — schéma Zod des intentions acceptées ;
   - `start(ctx)` renvoie `onInput`, `onTick`, `isComplete`, `results` ;
   - `ctx.setState(état)` (diffusé à `stateHz`), `ctx.emit(événement)`, `ctx.settle(joueur, issue)` dès qu'une issue est connue ;
   - les bots jouent via `ctx.isBot` / `ctx.skillOf` ; juger les appuis sur `meta.at` (temps compensé de la latence) et, pour un geste qui dépend d'un instant précis (saut, frappe), trancher un peu *après* cet instant pour laisser arriver les paquets en retard (`sauter`, `ping`) ;
   - `kits/duel.ts` : `twoTeams`, `Alternation` (gauche / droite), `BotClock`, schéma `Side`.
   Un module ne touche jamais aux sockets, phases, vies ou timers. L'état publié doit être du JSON pur (pas d'`Infinity`), horodatages entiers.
3. **Client** — `games/<id>.ts` : dessiner l'état reçu (`onState`, `onEvent`), envoyer les intentions (`ctx.send(input)`), `duel-common.ts` pour placer les combattants. Prédire localement ce qui doit réagir tout de suite (son propre appui, son propre déplacement, sa propre frappe) et extrapoler les positions entre deux états (`roi`, `ping`).
4. **Tests** — `server/test/*duels*.test.ts` (horloge simulée) ; le test client `client/test/duels.test.ts` fait tourner automatiquement le module réel avec le rendu ; `npm run check:integration` contre un serveur lancé.

## Vérifier en jeu

- `?preview=<id>` (dev uniquement) : un micro-jeu seul, en boucle ; `&level=2`, `&seed=5`, `&players=4`, `&freeze=1500` (avance directement à cet instant par pas de 16 ms, puis fige l'image : captures fiables même quand l'onglet est ralenti). Les duels y tournent avec leur module serveur et des bots.
- `?offline` : partie solo avec bots, sans serveur ; `&games=boxe,skate` (liste blanche), `&duelEvery=1`, `&bots=5`.
- `BOUCAN_MICROGAMES=saute,patate` côté serveur pour ne jouer que certains micro-jeux.

## Modifier ou retirer

- Réglages (durée, monde, poids) : le catalogue uniquement.
- Désactiver sans supprimer : `BOUCAN_MICROGAMES` (liste blanche d'ids).
- Retirer : supprimer l'entrée du catalogue, le fichier client et son import (et le module serveur pour un duel). Le test de couverture signale tout oubli.
