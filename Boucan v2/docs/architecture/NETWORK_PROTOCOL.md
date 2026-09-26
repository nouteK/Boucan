# Protocole réseau — v1

> Propriétaire : Claude. `PROTOCOL_VERSION = 1`, `CONTRACT_REVISION = 1.0.0`.
> Source de vérité : [`shared/src/contracts/`](../../shared/src/contracts/) (schémas Zod). JSON Schema générés : [`shared/schemas/`](../../shared/schemas/). Exemples réels : [`shared/fixtures/`](../../shared/fixtures/).
> En cas de divergence entre ce document et les schémas, **les schémas font foi**.

## 1. Transport

- **WebSocket**, URL `ws(s)://<hôte>:<port>/ws`, un objet JSON par trame texte (trames binaires refusées).
- Taille max d'un message : 16 Ko (`ServerInfo.limits.maxMessageBytes`).
- HTTP sur le même port : `GET /health` (état, version), `GET /api/info` (= `ServerInfo` sans `connectionId`, + `websocketPath`).

### Enveloppes

```jsonc
// client → serveur
{ "type": "room.join", "rid": "r12", "payload": { "code": "BCDF", "nickname": "Zoé" } }

// serveur → client : réponse à une requête portant un rid
{ "type": "reply", "rid": "r12", "ok": true,  "payload": { ... } }
{ "type": "reply", "rid": "r12", "ok": false, "error": { "code": "ROOM_FULL", "category": "request", "message": "...", "details": { } } }

// serveur → client : message poussé
{ "type": "room.snapshot", "payload": { ... } }
```

Règles :

- `rid` (chaîne ≤ 32 caractères, choisie par le client) ⇒ **exactement une** `reply`.
- Sans `rid` : succès silencieux ; un refus arrive sous forme de message `error` (limité à 5/s par connexion). Utilisé pour `minigame.input` (haute fréquence).
- Le client **doit ignorer** les champs, types de messages, kinds d'événements inconnus (évolutions compatibles).
- `payload` absent = `{}`.

## 2. Versionnement

| Constante | Quand elle change | Effet |
| --- | --- | --- |
| `PROTOCOL_VERSION` (entier) | changement **cassant** (champ renommé/supprimé, sens modifié, validation plus stricte) | le serveur refuse l'ancien client : `PROTOCOL_MISMATCH` puis fermeture `4000` |
| `CONTRACT_REVISION` (`MAJEUR.MINEUR.CORRECTIF`, majeur = protocole) | ajout compatible (champ optionnel, message, code d'erreur, kind d'événement) | aucun ; le SDK émet un `warning` si les révisions diffèrent |

Le client envoie sa version dans `hello`. Chaque changement est consigné dans [CLAUDE_TO_ASTRA.md](../handoff/CLAUDE_TO_ASTRA.md) et [CHANGELOG.md](../../CHANGELOG.md).

## 3. Séquence type

```
C: hello {protocolVersion:1}                       S: reply ServerInfo
C: time.sync {t0} ×5                               S: reply {t0, serverTime}
C: room.create {nickname}                          S: reply {playerId, sessionToken, snapshot}
                                                   S: room.snapshot / room.event … (à chaque changement)
C: player.ready {ready:true}                       S: room.snapshot, reply {}
C: match.start (host)                              S: room.snapshot (MATCH_STARTING), room.event phaseChanged, reply {}
                                                   S: room.snapshot (MINIGAME_PREPARING : minigame annoncé)
C: minigame.ready {sessionId}                      S: room.snapshot (MINIGAME_COUNTDOWN : activeAt, endsAt)
C: minigame.input / minigame.report …              S: minigame.state / minigame.event …
                                                   S: room.snapshot (ENDING → RESULTS → INTERMISSION → … → MATCH_RESULTS)
C: match.returnToLobby (host)                      S: room.snapshot (LOBBY)
```

Ordre garanti pour une commande : la diffusion du **snapshot** (et des événements qu'elle a produits) **précède** la `reply` au demandeur. Les événements (`room.event`) d'un changement suivent toujours le snapshot qui le contient.

## 4. Messages client → serveur

Erreurs possibles pour **tous** les messages : `BAD_MESSAGE`, `UNKNOWN_MESSAGE`, `INVALID_PAYLOAD`, `HANDSHAKE_REQUIRED`, `RATE_LIMITED`, `INTERNAL`.
« Siège requis » = la connexion doit être liée à un joueur (sinon `NOT_IN_ROOM`).

| Message | Payload | Réponse | Erreurs spécifiques | Valide quand |
| --- | --- | --- | --- | --- |
| `hello` | `{ protocolVersion, client? }` | `ServerInfo` | `PROTOCOL_MISMATCH` (+ fermeture 4000) | premier message, obligatoire (timeout 10 s → fermeture 4001) |
| `time.sync` | `{ t0 }` | `{ t0, serverTime }` | — | toujours |
| `room.create` | `{ nickname, characterId?, config?: { rounds?, minigamePool? } }` | `JoinedReply` | `ALREADY_IN_ROOM`, `NICKNAME_INVALID`, `NICKNAME_NOT_ALLOWED`, `CHARACTER_INVALID`, `CONFIG_INVALID`, `SERVER_FULL` | sans siège |
| `room.join` | `{ code, nickname, characterId? }` (code insensible à la casse) | `JoinedReply` | `ALREADY_IN_ROOM`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `MATCH_IN_PROGRESS`, `NICKNAME_*`, `CHARACTER_INVALID` | sans siège ; room en `LOBBY` |
| `room.resume` | `{ sessionToken }` | `JoinedReply` | `SESSION_NOT_FOUND`, `ALREADY_IN_ROOM` | toute phase (reprend le siège ; l'ancienne connexion reçoit `session.ended: replaced`) |
| `room.leave` | `{}` | `{}` | — | siège requis ; toute phase |
| `room.kick` | `{ playerId }` | `{}` | `NOT_HOST`, `INVALID_PHASE`, `PLAYER_NOT_FOUND` | host, `LOBBY` |
| `player.update` | `{ nickname?, characterId? \| null }` (au moins un) | `{}` | `INVALID_PHASE`, `NICKNAME_*`, `CHARACTER_INVALID` | `LOBBY` |
| `player.ready` | `{ ready }` | `{}` | `INVALID_PHASE` | `LOBBY` |
| `match.configure` | `{ rounds?, minigamePool? \| null }` (au moins un) | `{}` | `NOT_HOST`, `INVALID_PHASE`, `CONFIG_INVALID` (`details.reason = unknownMinigame`) ; `rounds` hors {3,5,8,10} → `INVALID_PAYLOAD` | host, `LOBBY` |
| `match.start` | `{}` | `{}` | `NOT_HOST`, `INVALID_PHASE`, `NOT_ENOUGH_PLAYERS`, `NOT_ALL_READY`, `CONFIG_INVALID` (`noEligibleMinigame`) | host, `LOBBY`, tous les joueurs **connectés** prêts |
| `match.abort` | `{}` | `{}` | `NOT_HOST`, `INVALID_PHASE` | host, en match |
| `match.returnToLobby` | `{}` | `{}` | `NOT_HOST`, `INVALID_PHASE` | host, `MATCH_RESULTS` |
| `minigame.ready` | `{ sessionId }` | `{}` | `STALE_SESSION`, `INVALID_PHASE`, `NOT_PARTICIPANT` | `MINIGAME_PREPARING` (accepté aussi en COUNTDOWN/ACTIVE, sans effet) |
| `minigame.input` | `{ sessionId, input, at?, seq? }` | `{}` si `rid` | `STALE_SESSION`, `INVALID_PHASE`, `NOT_PARTICIPANT`, `INPUT_REJECTED` (`details.reason`), `RATE_LIMITED` (`reason: inputRate`) | `MINIGAME_ACTIVE` (+ 150 ms après la fin, compensation de latence) ; module qui accepte des entrées |
| `minigame.report` | `{ sessionId, result: PlayerResult }` | `{}` | `STALE_SESSION`, `INVALID_PHASE`, `NOT_PARTICIPANT`, `REPORT_REJECTED` (`reason`: `notAccepted`, `duplicate`, `dnfReserved`, `tooEarly`, `timeOutOfBounds`, ou raison du module) | `MINIGAME_ACTIVE` / `MINIGAME_ENDING` ; module `acceptsReports` ; une fois par session |

`JoinedReply = { playerId, sessionToken, snapshot: RoomSnapshot }` — conserver `sessionToken` pour `room.resume`.

`minigame.input.input` est **spécifique au micro-jeu** (validé par le module ; voir `ServerInfo.minigames[].acceptsInputs` et [MINIGAME_BACKEND.md](MINIGAME_BACKEND.md)). `at` = estimation par le client de l'heure serveur de l'action (horloge synchronisée) ; le serveur la borne à `[maintenant − 150 ms, maintenant]`.

## 5. Messages serveur → client

| Message | Payload | Quand |
| --- | --- | --- |
| `reply` | voir §1 | réponse à une requête avec `rid` |
| `room.snapshot` | `RoomSnapshot` | à chaque changement d'état de la room (au plus un par commande / tick) |
| `room.event` | `RoomEvent` | moments sémantiques, après le snapshot correspondant |
| `minigame.state` | `{ sessionId, seq, serverTime, state }` | état partagé d'un micro-jeu `relay`/`server`, throttlé (≈ 10 Hz par défaut) et seulement s'il a changé |
| `minigame.event` | `{ sessionId, serverTime, event: { type, … } }` | événement ponctuel d'un micro-jeu (à la room ou à un joueur) |
| `error` | `ErrorPayload & { about? }` | refus d'un message sans `rid` ; erreur protocole |
| `session.ended` | `{ reason: kicked \| replaced \| expired \| roomClosed }` | le siège est perdu : retour à l'accueil |

### `RoomEvent` (`kind`)

| kind | Champs | Sens |
| --- | --- | --- |
| `playerJoined` | `playerId` | arrivée |
| `playerLeft` | `playerId`, `reason: left \| kicked \| timeout` | départ définitif (ou `left` en match) |
| `playerDisconnected` | `playerId` | connexion perdue, siège conservé |
| `playerReconnected` | `playerId` | retour |
| `hostChanged` | `hostId`, `previousHostId` | nouveau host |
| `phaseChanged` | `phase`, `previousPhase`, `round` | transition de la machine à états |
| `matchAborted` | `reason: host \| noPlayers` | match annulé, retour lobby |

## 6. Modèle de données

Définitions exactes : [`model.ts`](../../shared/src/contracts/model.ts). Résumé :

```ts
RoomSnapshot { rev, serverTime, lobby: Lobby, match: MatchState }

Lobby { code, hostId, players: Player[], config: MatchConfig, maxPlayers, canStart }
Player { id, nickname, characterId | null, seat (0-7), isHost, ready,
         connection: 'connected' | 'disconnected' | 'left', score, joinedAt }
MatchConfig { rounds: 3|5|8|10, minigamePool: string[] | null }

MatchState {
  matchId | null, phase, phaseStartedAt, phaseEndsAt | null, phaseEndsExactly,
  round (0 avant la 1re manche), totalRounds,
  minigame: MiniGameSession | null,    // de PREPARING à RESULTS
  lastRound: RoundResults | null,      // résultats de la dernière manche jouée
  standings: Standing[],               // classement général courant
  final: MatchResults | null           // en MATCH_RESULTS
}
MiniGameSession {
  sessionId, minigameId, round, authority: 'local'|'relay'|'server',
  seed (uint32 public), params (JSON public du module), participants, solo,
  readyPlayerIds, finishedPlayerIds,
  timing { preparingAt, countdownAt, activeAt, endsAt, endedAt, durationMs }
}
PlayerResult { outcome: 'success'|'failure'|'dnf', score?, timeMs?, accuracy?, errors?, rank?, normalized?, stats? }
RoundResults { round, sessionId, minigameId, solo, entries: RoundEntry[] }   // triés du meilleur au moins bon
RoundEntry { playerId, result: PlayerResult, rank, points }
Standing { playerId, rank, score, previousRank | null, delta }
MatchResults { standings, winnerIds, rounds }
ServerInfo { protocolVersion, contractRevision, serverVersion, environment, serverTime, connectionId,
             limits, timings, reconnect, minigames: MiniGameDefinition[] }
MiniGameDefinition { id, authority, minPlayers, maxPlayers, durationMs, scoring, acceptsReports, acceptsInputs, inputRate }
```

Horodatages : millisecondes epoch **du serveur**. Rangs : classement « compétition » (ex æquo = même rang : 1, 1, 3).

## 7. Erreurs

`ErrorPayload = { code, category, message, details? }`. `message` est destiné aux développeurs (anglais) : le texte joueur est choisi par le frontend à partir de `code` / `details`.

| Catégorie | Codes | Interprétation |
| --- | --- | --- |
| `protocol` | `BAD_MESSAGE`, `UNKNOWN_MESSAGE`, `INVALID_PAYLOAD`, `PROTOCOL_MISMATCH`, `HANDSHAKE_REQUIRED` | le client ne respecte pas le contrat (bug d'adapter ou version) |
| `request` | `ALREADY_IN_ROOM`, `NOT_IN_ROOM`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `MATCH_IN_PROGRESS`, `INVALID_PHASE`, `NOT_HOST`, `NOT_ALL_READY`, `NOT_ENOUGH_PLAYERS`, `NICKNAME_INVALID`, `NICKNAME_NOT_ALLOWED`, `CHARACTER_INVALID`, `CONFIG_INVALID`, `PLAYER_NOT_FOUND`, `SESSION_NOT_FOUND`, `STALE_SESSION`, `NOT_PARTICIPANT`, `INPUT_REJECTED`, `REPORT_REJECTED` | refus normal des règles du jeu : à expliquer au joueur ou à éviter côté UI |
| `rate` | `RATE_LIMITED`, `SERVER_FULL` | ralentir / réessayer plus tard |
| `server` | `INTERNAL` | bug backend (voir logs serveur) |

`details` utiles : `NICKNAME_INVALID.reason` ∈ `empty | tooShort | tooLong | invalidChars | noLetter` ; `INVALID_PAYLOAD.{path, issue, detail}` ; `PROTOCOL_MISMATCH.{serverVersion, clientVersion}` ; `CONFIG_INVALID.reason` ; `INPUT_REJECTED.reason` / `REPORT_REJECTED.reason`.

### Codes de fermeture WebSocket

| Code | Sens | Reconnexion ? |
| --- | --- | --- |
| 1000 / 1001 | normal / arrêt du serveur | 1001 : oui |
| 4000 | `PROTOCOL_MISMATCH` | non (mettre à jour le client) |
| 4001 | pas de `hello` dans les 10 s | oui |
| 4002 | session reprise ailleurs (autre onglet) | non |
| 4008 | trop d'erreurs protocole | non (bug client) |
| autres | perte réseau | oui (`room.resume`) |

## 8. Limites de débit

| Limite | Valeur (config) |
| --- | --- |
| messages par connexion | 60 en rafale, 40/s soutenu |
| `minigame.input` par joueur | `MiniGameDefinition.inputRate` par seconde |
| erreurs protocole | 25 / 10 s puis fermeture 4008 |
| diffusions d'état de micro-jeu | `stateHz` du module (10 Hz par défaut), seulement si modifié |
