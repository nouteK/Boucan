# Architecture

BOUCAN est un monorepo npm (workspaces) en TypeScript strict. Un seul processus Node sert en production la page du jeu **et** le WebSocket.

```
shared/   @boucan/shared   contrat client ↔ serveur (Zod), catalogue des micro-jeux, règles communes
server/   @boucan/server   moteur de partie (sans IO) + passerelle protocole + transport Node (WS/HTTP/statique)
sdk/      @boucan/sdk      client réseau (BoucanClient), serveur local en mémoire, bots, scripts de dev
client/   @boucan/client   le jeu dans le navigateur : écrans DOM + rendu Canvas 2D des matchs
```

Dépendances : `client → sdk → shared` ; `sdk/local → server` (moteur embarqué, chargé à la demande) ; `server → shared`.

## Déroulé d'une partie

```
MENU ─créer/rejoindre─► SALON ─lancer─► STAGE_INTRO ─► INTERLUDE ─► MICROGAME ─► VERDICT ─┐
 ▲                        ▲                               ▲                                │
 │                        │                               └────── micro-jeu suivant ◄──────┘
 └── quitter ─────────────┴──── retour au salon ◄──── STAGE_RESULTS ◄── (1 survivant / dernier niveau)
```

- **Menu** (DOM) : créer une partie, rejoindre par code, musique/sons. Rien d'autre.
- **Salon** (DOM) : code + lien d'invitation, pseudo, personnage, joueurs (humains + bots serveur), réglages de l'hôte (monde, vies, durée), prêt / lancer.
- **Match** (Canvas 1280×720 letterboxé) : piloté par l'horloge serveur. Intro et interludes posés sur l'image du monde (forêt, ville, neige, futur) : compteur, « PLUS VITE ! », « NIVEAU 2 ! », « TOUS ENSEMBLE ! » ; zoom dans l'écran, micro-jeu de ~4 à 7 s en plein écran, verdict, vies perdues, éliminations, classement final.

Règles (moteur, `server/src/engine/match/match.ts`) : chaque niveau = `gamesPerLevel` micro-jeux (puis un boss si le catalogue en a un — ce n'est pas le cas aujourd'hui, [ADR-0013](adr/0013-catalogue-ouaf-ware.md)). Micro-jeux tirés dans le monde choisi (ou dans tous, « Mélange »). Accélération tous les `speedUpEvery` micro-jeux ; un duel tous les `duelEvery` (≥ 2 joueurs en vie). Échec = −1 vie, boss réussi = +1 vie (plafond `GAME_RULES.maxLives`). 0 vie = éliminé : le joueur continue en « fantôme » sans compter. Fin : un seul survivant (multijoueur), le joueur solo éliminé, ou le dernier niveau terminé. Tous les réglages sont dans `server/src/config/game-config.ts` et `shared/src/contracts/rules.ts`.

## Serveur

| Dossier | Rôle |
| --- | --- |
| `engine/` | **logique pure, sans IO ni horloge** : `RoomManager`, `Room` (sièges, hôte, grâces de reconnexion, bots), `Match` (machine à états, vies, rythme), `selection` (choix des micro-jeux), `minigames/` (sessions, kit local, modules de duel) |
| `gateway/` | protocole : handshake `hello`, validation Zod de chaque message, limites de débit, routage des requêtes, diffusion des snapshots/événements |
| `transport/` | adaptateurs Node : WebSocket (`ws`), HTTP (`/health`, `/api/info`), fichiers statiques du client (cache, byte ranges) |
| `config/` | variables d'environnement validées (`env.ts`) et réglages du jeu (`game-config.ts`) |
| `logging/` | logs console (`pretty` en dev, `json` en prod) |

Le moteur reçoit `now` en paramètre et émet vers une interface de sortie : il tourne à l'identique dans Node, dans les tests (horloge simulée, un match complet en millisecondes) et dans le navigateur (`@boucan/sdk/local`, mode `?offline`). Voir [ADR-0009](adr/0009-moteur-sans-io.md).

État en mémoire, un seul processus, pas de base de données ([ADR-0008](adr/0008-etat-en-memoire.md)) : un redémarrage ferme les parties en cours ; les clients reviennent au menu avec un message.

### Autorité

- **Solo (et boss)** : chaque client joue sa copie (même graine = même situation) et envoie son résultat (`minigame.report`) dès qu'il est décidé. Le serveur accepte le rapport pendant la fenêtre de jeu (+ `reportGraceMs`), simule les bots, et compte « dnf » pour les absents.
- **Duel** : tous les joueurs en vie dans une arène commune simulée par le serveur (`server/src/engine/minigames/modules/`). Les clients envoient des intentions (`minigame.input`), le serveur diffuse l'état (`minigame.state`) et les événements (`minigame.event`) et décide des issues.

Voir [ADR-0010](adr/0010-vies-et-autorite-v2.md).

### Temps

Le serveur fait foi. Le client échantillonne l'horloge (`time.sync`, type NTP) et calcule `serverNow()`. Chaque manche annonce `timing.activeAt` / `endsAt` pendant l'interlude : tous les clients démarrent le micro-jeu au même instant serveur. Le temps de jeu court `tempo` fois plus vite après chaque accélération ; un micro-jeu est conçu une fois à vitesse normale.

### Déconnexions

Jeton de session en `sessionStorage` : un rechargement de page reprend la place (`room.resume`). Grâces : 30 s en salon, 90 s en match (`reconnect` dans `game-config.ts`) ; l'hôte est transféré après 5 s d'absence ; une room sans humain connecté est fermée après 60 s.

## Client

| Dossier | Rôle |
| --- | --- |
| `app/` | `App` (orchestration menu → salon → match, connexion, session, musique), `menu.ts` (menu principal), `logo.ts` (titre BOUCAN vectoriel), `lobby.ts` (salon), `audio-toggles.ts`, `room-code.ts` (validation du code + messages d'erreur joueurs), `dom.ts` (helpers DOM et SVG, attente de la police, confirmation en deux temps, toast, profil local), `portraits.ts`, `ui.css` |
| `engine/` | `screen` (canvas logique 1280×720 letterboxé, HiDPI), `draw` (primitives dessinées), `input` (pointeurs multiples / flèches / ZQSD → entrées logiques, mode tactile), `assets` (manifest, atlas, poses, décors des mondes, fallback dessiné), `audio` (sons synthétisés + pistes, préférences) |
| `match/` | `MatchView` (interlude, zoom, micro-jeu, verdict pilotés par l'horloge serveur ; libère le micro-jeu précédent via `dispose`), `interlude` (scène sur l'image du monde), `ceremonies` (intro, résultats), `hud` (mèche, consigne, puces), `roster` |
| `microgames/` | un fichier par micro-jeu dans `games/`, registre `index.ts`, API `api.ts`, décors des mondes (`backdrops.ts` : `sceneBg`), route vue de dos (`road.ts`), boutons tactiles / touches (`pad.ts`), accessoires (`props.ts`), helpers (`common.ts`, `duel-common.ts`) — voir [MICROGAMES.md](MICROGAMES.md) |
| `dev/` | `preview.ts` : `?preview=<id>`, un micro-jeu seul en boucle (dev uniquement, absent du build) |

### Menu principal

Une vraie interface DOM, sans aucune image dans les boutons : fond `assets/menu/fond.webp` (nuit bleue à motifs, `cover`, centré, jamais déformé ni répété), titre BOUCAN vectoriel (`logo.ts` : SVG en ligne, lettres Luckiest Guy en couches — ombre, contour noir, liseré bleu → rouge → jaune, contour, face blanche — rayons et couronne ; net à toute taille), `CRÉER UNE PARTIE` (bouton jaune) puis le champ du code et `REJOINDRE` (bouton bleu, bouton d'envoi du formulaire). Les boutons sont dessinés en CSS : contour noir, lèvre sombre en bas, socle noir sur lequel ils s'enfoncent à l'appui, un reflet. `MUSIQUE` / `SONS` sont dans le coin haut droit de l'écran (icônes SVG en ligne, `currentColor`). Le menu reste masqué tant que Luckiest Guy n'est pas chargée (2,5 s au plus) pour éviter le flash de police de secours.

Mise en page : une scène 16:9 (`.stage`, `container-type: size`) centrée et letterboxée ; tout le menu est dimensionné avec une seule unité `--u` (1 % de la largeur de la scène ; plus grande en portrait), donc identique de 1280×720 à 2560×1440. En portrait étroit (`max-aspect-ratio: 4/5`), la scène passe en colonne. Le salon utilise le même fond, le même logo et les mêmes boutons audio.

Comportement : `CRÉER UNE PARTIE` → room créée → salon. `REJOINDRE` : bouton **et** Entrée ; validation instantanée (vide, longueur, caractères impossibles) puis erreurs serveur (code inconnu, partie complète, partie commencée, serveur injoignable) dans une bulle à côté de l'action, reliée au champ (`aria-invalid`, `aria-describedby`). Boutons désactivés pendant la requête. `?room=CODE` pré-remplit le champ (lien d'invitation du salon).

### Audio

`engine/audio.ts` : deux bus WebAudio (effets synthétisés, musique). Pistes `menu` (menu + salon) et `match` (partie ; volume baissé pendant le micro-jeu, lecture accélérée avec le tempo). Préférences `MUSIQUE` / `SONS` persistées en `localStorage` (`boucan.audio`), appliquées immédiatement et partagées par tous les boutons (menu, salon, match). Déblocage au premier geste (politique des navigateurs).

### Assets

Tout visuel ou son passe par `client/public/assets/manifest.json` (voir [client/public/assets/README.md](../client/public/assets/README.md)). Chaque asset a un rendu de secours dessiné : le jeu tourne sans aucun fichier.

## Modes

- `npm run dev` : serveur (tsx watch, :3001) + client (Vite, :5180, proxy `/ws` et `/health`).
- `?offline` : partie solo avec bots, moteur dans la page (aucun serveur) ; `&games=a,b`, `&duelEvery=N`, `&bots=N` pour tester.
- `?preview=<id>` (dev) : un micro-jeu seul en boucle, duels compris (module serveur dans la page) ; `&freeze=ms` avance directement à cet instant et fige l'image.
- `?server=ws://hôte:port/ws` : client branché sur un autre serveur.
- Production : `npm run build && npm start` (un seul port) — voir [DEPLOYMENT.md](DEPLOYMENT.md).
