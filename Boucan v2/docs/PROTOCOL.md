# Protocole réseau (v3)

Source de vérité : les schémas Zod de `shared/src/contracts/` (`messages.ts`, `model.ts`, `phases.ts`, `errors.ts`). Ce document les résume ; en cas de doute, le code fait foi. Le client du jeu passe par le SDK (`BoucanClient`, `sdk/src/client.ts`), qui implémente tout ce qui suit.

## Transport

- WebSocket sur `/ws` (même port que la page en production), un objet JSON par trame. [ADR-0001](adr/0001-websocket-json.md)
- HTTP : `GET /health` (état, version du protocole, compteurs), `GET /api/info` (micro-jeux activés, durées de phase).

```
client → serveur : { "type": "<message>", "rid"?: "<id>", "payload"?: {...} }
serveur → client : { "type": "<push>", "payload": {...} }
                   { "type": "reply", "rid": "<id>", "ok": true,  "payload": {...} }
                   { "type": "reply", "rid": "<id>", "ok": false, "error": { "code", "category", "message", "details"? } }
```

Un message avec `rid` reçoit exactement une `reply`. Sans `rid`, un succès est silencieux et un échec revient en push `error`.

## Versions

`PROTOCOL_VERSION` (entier, cassant) et `CONTRACT_REVISION` (semver, ajouts compatibles) dans `shared/src/contracts/version.ts`. Le premier message doit être `hello { protocolVersion }` ; une autre version est refusée (`PROTOCOL_MISMATCH`, le client affiche « recharge la page »). Les clients ignorent champs, événements et types inconnus.

## Messages client → serveur

| Message | Payload | Quand | Réponse |
| --- | --- | --- | --- |
| `hello` | `protocolVersion`, `client?` | premier message | `ServerInfo` (version, micro-jeux, durées) |
| `time.sync` | `t0` | à tout moment | `{ t0, serverTime }` |
| `room.create` | `nickname`, `characterId?`, `config?` | hors room | `{ playerId, sessionToken, snapshot }` |
| `room.join` | `code`, `nickname`, `characterId?` | hors room, en salon | idem |
| `room.resume` | `sessionToken` | après reconnexion | idem |
| `room.leave` | — | en room | — |
| `room.kick` | `playerId` | salon, hôte | — |
| `room.addBot` | — | salon, hôte | — |
| `player.update` | `nickname?`, `characterId?` | salon | — |
| `player.ready` | `ready` | salon | — |
| `match.configure` | `zone?`, `lives?`, `length?` | salon, hôte | — |
| `match.start` | — | salon, hôte, tous prêts | — |
| `match.abort` | — | hôte | — |
| `match.returnToLobby` | — | `STAGE_RESULTS`, hôte | — |
| `minigame.report` | `roundId`, `result { outcome, score? }` | `MICROGAME` (solo/boss) | — |
| `minigame.input` | `roundId`, `input`, `at?`, `seq?` | `MICROGAME` (duel) | — |

`MatchConfig` : `zone` (le monde) = `mix` \| `prairie` \| `desert` \| `tresor` \| `futur` \| `ville` (protocole 4) ; `lives` = 3 \| 4 \| 5 ; `length` = `court` \| `normal` \| `long` (1, 2 ou 3 niveaux).

Règles de validation communes (`GAME_RULES`) : 1 à 8 joueurs ; pseudo 2–16 caractères (graphèmes), filtre de mots ; code de room 4 caractères dans `BCDFGHJKMNPQRTVWXZ234679` (pas de voyelles ni de caractères ambigus).

## Messages serveur → client

| Push | Contenu |
| --- | --- |
| `room.snapshot` | état complet de la room (`RoomSnapshot { rev, serverTime, lobby, match }`) à chaque changement ; `rev` croît de 1 |
| `room.event` | événement sémantique : `playerJoined`, `playerLeft`, `playerDisconnected`, `playerReconnected`, `hostChanged`, `phaseChanged`, `matchAborted` |
| `minigame.state` | état partagé d'un duel (`roundId`, `seq`, `serverTime`, `state`) |
| `minigame.event` | événement de duel (`roundId`, `serverTime`, `event { type, … }`) |
| `error` | erreur d'un message sans `rid` |
| `session.ended` | fin de la place : `kicked`, `replaced`, `expired`, `roomClosed` → retour au menu |

Snapshots complets plutôt que deltas ([ADR-0003](adr/0003-snapshots-et-evenements.md)).

### `match` dans le snapshot

`phase` (`LOBBY`, `STAGE_INTRO`, `INTERLUDE`, `MICROGAME`, `VERDICT`, `STAGE_RESULTS`), `phaseStartedAt`, `phaseEndsAt`, `zone`, `level` / `levels`, `tempo`, `counter`, puis :

- `round` (interlude → verdict) : `roundId`, `index`, `microgameId`, `kind` (`solo`/`boss`/`duel`), `zone`, `seed`, `level`, `tempo`, `speedUp`, `levelUp`, `participants`, `progress` (issues déjà connues), `timing { interludeAt, activeAt, endsAt, durationMs }` ;
- `verdict` : par joueur `outcome` (`success`/`failure`/`dnf`), `counted` (false = fantôme), `livesDelta`, `lives`, `eliminated` ;
- `final` (fin de partie) : classement (`rank`, `alive`, `lives`, `wins`, `eliminatedAt`), `winnerIds`, `microgamesPlayed`.

Les joueurs (`lobby.players`) portent `lives`, `wins`, `alive`, `connection` (`connected` / `disconnected` / `left`), `isBot`, `isHost`, `ready`, `seat`.

## Temps

Le serveur fait foi. Le SDK échantillonne `time.sync` à la connexion, garde le meilleur RTT et expose `client.serverNow()`. Toutes les échéances (`activeAt`, `endsAt`, `phaseEndsAt`) sont en temps serveur (ms epoch). Les entrées de duel peuvent porter `at` (estimation du temps serveur) : le serveur compense dans la limite de `maxLagCompensationMs`. [ADR-0006](adr/0006-temps-et-synchronisation.md)

## Erreurs

Chaque code a une catégorie (`shared/src/contracts/errors.ts`) :

- `protocol` : `BAD_MESSAGE`, `UNKNOWN_MESSAGE`, `INVALID_PAYLOAD`, `PROTOCOL_MISMATCH`, `HANDSHAKE_REQUIRED` — bug client ;
- `request` : refus par les règles (`ROOM_NOT_FOUND`, `ROOM_FULL`, `MATCH_IN_PROGRESS`, `NOT_HOST`, `NOT_ALL_READY`, `NICKNAME_INVALID`, `NICKNAME_NOT_ALLOWED`, `INPUT_REJECTED`, `REPORT_REJECTED`, …) ;
- `rate` : `RATE_LIMITED`, `SERVER_FULL` ;
- `server` : `INTERNAL`.

Côté SDK s'ajoutent les erreurs réseau (`CONNECTION_FAILED`, `CONNECTION_LOST`, `NOT_CONNECTED`, `TIMEOUT`). Le client traduit tout en messages joueurs dans `client/src/app/room-code.ts` (`errorMessage`) : aucun code brut n'est affiché.

## Reconnexion

Le SDK se reconnecte automatiquement (backoff) et renvoie `room.resume` avec le jeton de session (stocké en `sessionStorage` par le client, donc aussi après un rechargement). Si la place n'existe plus (serveur redémarré, grâce dépassée), le client revient au menu avec un message. Grâces et transfert d'hôte : voir [ARCHITECTURE.md](ARCHITECTURE.md#déconnexions).

## Vérifier un serveur

```bash
npm run check:integration -- --url ws://hote:3001/ws --players 4 --rounds 3   # partiel puis arrêt
npm run check:integration -- --full                                            # partie complète
```

20 étapes ✓/✗ (santé, version, refus de pseudo et de code inconnu, création, synchronisation des joueurs, timestamps identiques, verdicts, classement final, conformité de chaque message au contrat) avec le diagnostic du côté fautif.
