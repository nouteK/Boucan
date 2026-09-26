# Intégration frontend ↔ backend — guide pour Astra

> Propriétaire : Claude. Protocole v1 / contrat 1.0.0. Tout ce dont le frontend a besoin pour parler au backend, sans lire le code serveur.

## 1. La frontière

```
 composants UI / scènes / HUD (Astra)
          │  lisent l'état, appellent des méthodes
          ▼
 GameStore / adapter du frontend (Astra) ── un seul module
          │
          ▼
 BoucanClient (@boucan/sdk, Claude) ── WebSocket ── serveur
```

- **Un seul point de contact réseau** : une instance de `BoucanClient`, encapsulée dans l'adapter/store d'Astra. Aucun composant n'ouvre de WebSocket ni n'envoie de message lui-même.
- Le frontend ne dépend que de `@boucan/sdk` et `@boucan/shared` (types, schémas, fixtures), **jamais** de `server/`.
- Le SDK est optionnel : un autre client peut implémenter le protocole ([NETWORK_PROTOCOL.md](../architecture/NETWORK_PROTOCOL.md) + JSON Schema dans `shared/schemas/`). Le SDK est cependant testé de bout en bout et gère l'horloge, la reconnexion et les erreurs.

## 2. Installation dans le monorepo

1. Créer `client/` (ex. Vite) avec `"dependencies": { "@boucan/sdk": "*", "@boucan/shared": "*" }`.
2. Ajouter `"client"` à `workspaces` dans le `package.json` racine, puis `npm install`.
3. Les packages sont en TypeScript source (pas de build) : Vite/esbuild les compilent directement.

## 3. Démarrer sans serveur (recommandé pour l'UI)

```ts
import { createLocalGame } from '@boucan/sdk/local';

const game = await createLocalGame({
  bots: 7,             // 0–7 bots qui jouent vraiment chaque micro-jeu
  timeScale: 0.5,      // tout 2× plus vite (1 = timings réels)
  nickname: 'Astra',
  match: { rounds: 5 },
  latencyMs: 40,       // optionnel : simule du réseau
});
const client = game.client;   // VOTRE client (host), identique au mode en ligne
```

C'est **le vrai moteur** qui tourne dans la page (mêmes règles, mêmes messages), pas une simulation approximative. Passer en ligne = remplacer `game.client` par `new BoucanClient({ url })`.

Pour des écrans statiques (maquettes, tests visuels, stories), utiliser les **fixtures** :

```ts
import { FIXTURES } from '@boucan/shared/fixtures';
render(FIXTURES.lobbyEightPlayers.snapshot, FIXTURES.lobbyEightPlayers.you);
```

| Fixture | État |
| --- | --- |
| `serverInfo` | réponse de `hello` : limites, timings, micro-jeux |
| `lobbyOnePlayer` | room juste créée (host seul) — « lobby vide » |
| `lobbyEightPlayers` | 8 joueurs, 5 prêts, 1 déconnecté, persos manquants |
| `lobbyReady` | tous prêts, `canStart = true` |
| `matchStarting` | intro du match |
| `minigamePreparing` / `minigameCountdown` | annonce du micro-jeu / décompte avec `activeAt` |
| `minigameActiveLocal` / `…Server` / `…Relay` | un jeu en cours pour chaque type d'autorité |
| `minigameEnding` / `minigameResults` / `intermission` | fin de manche, résultats, classement intermédiaire |
| `matchResults` | podium final (8 joueurs) |
| `playerDisconnected` / `playerLeft` | joueur déconnecté (dnf) / parti en cours de match |
| `events` | un exemple de chaque `room.event` / `minigame.event` / `minigame.state` |
| `errors` | refus typiques avec leur catégorie |
| `matchLog` | **tous les messages** reçus pendant un match de 3 manches, horodatés (`t` en ms) — rejouable |

Ces fichiers sont générés depuis de vrais matchs (`npm run contract:generate`) et testés contre les schémas : ils ne peuvent pas diverger du contrat.

## 4. Utilisation en ligne

```ts
import { BoucanClient, BoucanError, phaseProgress } from '@boucan/sdk';

const client = new BoucanClient({
  url: import.meta.env.VITE_BOUCAN_URL ?? 'ws://localhost:3001/ws',
  clientName: 'astra-web/0.1.0',
  // Survivre au rechargement de la page (optionnel, votre choix de stockage) :
  sessionStore: {
    get: () => sessionStorage.getItem('boucan.session'),
    set: (t) => (t ? sessionStorage.setItem('boucan.session', t) : sessionStorage.removeItem('boucan.session')),
  },
});

const info = await client.connect();        // hello + sync d'horloge ; info = ServerInfo
if (client.sessionToken) await client.resume().catch(() => {}); // revenir dans sa room après un F5

client.on('snapshot', (snapshot, previous) => store.set(snapshot));
client.on('roomEvent', (event) => fx.onRoomEvent(event));        // toasts, animations d'arrivée…
client.on('minigameEvent', ({ sessionId, event, serverTime }) => currentGame?.onEvent(event, serverTime));
client.on('minigameState', ({ sessionId, state }) => currentGame?.onSharedState(state));
client.on('sessionEnded', (reason) => router.goHome(reason));   // kicked / replaced / expired / roomClosed
client.on('status', (s) => ui.setConnection(s));                 // connecting / connected / reconnecting / closed
client.on('error', (e) => console.warn(e));                      // erreurs non liées à une requête
```

### Actions

| Méthode | Message | Quand |
| --- | --- | --- |
| `createRoom({ nickname, characterId?, config? })` | `room.create` | accueil |
| `joinRoom({ code, nickname, characterId? })` | `room.join` | accueil (code insensible à la casse) |
| `resume(token?)` | `room.resume` | après rechargement (automatique après une coupure) |
| `leaveRoom()` | `room.leave` | quitter |
| `setReady(bool)` | `player.ready` | lobby |
| `updatePlayer({ nickname?, characterId? })` | `player.update` | lobby |
| `kick(playerId)` | `room.kick` | lobby, host |
| `configureMatch({ rounds?, minigamePool? })` | `match.configure` | lobby, host |
| `startMatch()` | `match.start` | lobby, host, `lobby.canStart` |
| `abortMatch()` | `match.abort` | host, en match |
| `returnToLobby()` | `match.returnToLobby` | host, `MATCH_RESULTS` |
| `minigameReady()` | `minigame.ready` | `MINIGAME_PREPARING`, **quand les assets du jeu sont chargés** |
| `sendInput(input)` | `minigame.input` | `MINIGAME_ACTIVE` (jeux `relay`/`server`), sans attente de réponse |
| `reportResult(result)` | `minigame.report` | fin d'un jeu `local` (une fois) |

Toutes les méthodes (sauf `sendInput`) renvoient une `Promise` rejetée avec une `BoucanError` en cas de refus.

## 5. Piloter l'interface avec `match.phase`

```ts
switch (snapshot.match.phase) {
  case 'LOBBY':              /* lobby.players, lobby.canStart, lobby.config */ break;
  case 'MATCH_STARTING':     /* intro du match */ break;
  case 'MINIGAME_PREPARING': /* écran d'annonce ; charger le jeu minigame.minigameId puis client.minigameReady() */ break;
  case 'MINIGAME_COUNTDOWN': /* 3-2-1 jusqu'à minigame.timing.activeAt */ break;
  case 'MINIGAME_ACTIVE':    /* le jeu tourne jusqu'à timing.endsAt (max) */ break;
  case 'MINIGAME_ENDING':    /* « STOP ! » ; les jeux local envoient leur rapport s'ils ne l'ont pas fait */ break;
  case 'MINIGAME_RESULTS':   /* match.lastRound.entries (triés) */ break;
  case 'INTERMISSION':       /* match.standings (previousRank, delta) */ break;
  case 'MATCH_RESULTS':      /* match.final : standings, winnerIds, rounds */ break;
}
```

Pour les transitions animées, utiliser `previous` du listener `snapshot` ou l'événement `room.event { kind: 'phaseChanged' }`.

**Présentation = Astra.** Nom affiché, règles, décor, musique, personnages, effets d'un micro-jeu sont déduits côté client de `minigameId`. Le serveur n'envoie que des données sémantiques.

## 6. Timers fluides sans réseau

```ts
function frame() {
  const s = client.snapshot;
  if (s) {
    const p = phaseProgress(s, client.serverNow());   // { elapsedMs, remainingMs, ratio, exact }
    hud.timer.set(p.remainingMs, p.exact);             // exact=false : borne max, la phase peut finir plus tôt
    const mg = s.match.minigame;
    if (mg?.timing.activeAt) game.update(client.serverNow() - mg.timing.activeAt); // temps de jeu écoulé
  }
  requestAnimationFrame(frame);
}
```

- Toujours `client.serverNow()`, jamais `Date.now()`, pour comparer à un timestamp serveur.
- Le début de jeu est connu **dès le countdown** (`timing.activeAt`) : démarrer le jeu localement à cet instant, sans attendre le snapshot `MINIGAME_ACTIVE`.

## 7. Jouer un micro-jeu selon son autorité

Le type est dans `snapshot.match.minigame.authority` (et `serverInfo.minigames`).

**local** — le jeu se simule entièrement côté client :
```ts
const rng = createRng(session.seed);          // mêmes niveaux pour tout le monde
// … jeu …
await client.reportResult({ outcome: 'success', score: 7, errors: 1, timeMs: 8350 });
```
Envoyer le rapport dès que le joueur a fini (ou au plus tard en `MINIGAME_ENDING`, fenêtre de grâce 3 s). Sans rapport : dnf. Les champs attendus sont listés par micro-jeu dans [MINIGAME_BACKEND.md](../architecture/MINIGAME_BACKEND.md#micro-jeux-actuels-implémentations-de-référence).

**relay** — simulation locale + diffusion :
```ts
client.sendInput({ type: 'progress', distance });          // ≤ inputRate/s
client.on('minigameState', ({ state }) => showRivals(state)); // positions de tous (~10 Hz) : interpoler côté client
```

**server** — intentions uniquement, le serveur juge :
```ts
client.sendInput({ type: 'press' });
client.on('minigameEvent', ({ event }) => { if (event.type === 'bellRang') ring(event.kind); });
```

`session.finishedPlayerIds` indique qui a terminé (pour afficher « 3/8 ont fini »).

## 8. Personnages

`player.characterId` est un **identifiant logique** choisi par le frontend (`updatePlayer({ characterId: 'fox' })`, `null` = pas choisi). Le serveur ne connaît ni sprites, ni couleurs, ni expressions. Plusieurs joueurs peuvent choisir le même. Pour une identité visuelle unique par joueur, utiliser `player.seat` (0–7, stable). Par défaut le serveur accepte tout id au format `^[a-z0-9][a-z0-9_-]{0,31}$` ; quand la distribution est figée, demander dans `ASTRA_TO_CLAUDE.md` d'activer la liste blanche (`ServerInfo.limits.characterIds`).

## 9. Pseudos

Valider d'abord côté client pour le confort, avec **la même règle** que le serveur :

```ts
import { checkNickname } from '@boucan/shared';
const check = checkNickname(input);   // { ok: true, nickname } | { ok: false, reason }
```

`reason` : `empty`, `tooShort`, `tooLong` (2–16 caractères), `invalidChars` (lettres, chiffres, espace, `. _ - ! '`), `noLetter`, `banned`. Le serveur revalide toujours (`NICKNAME_INVALID` + `details.reason`, ou `NICKNAME_NOT_ALLOWED`) et peut ajouter un suffixe en cas de doublon : afficher `player.nickname` du snapshot, pas la saisie.

## 10. Erreurs : qui doit corriger ?

```ts
try { await client.startMatch(); }
catch (e) {
  if (!(e instanceof BoucanError)) throw e;
  switch (e.category) {
    case 'request':  ui.toast(texteJoueur(e.code, e.details)); break; // règle du jeu : normal, expliquer au joueur
    case 'network':  ui.showReconnecting(); break;                    // serveur injoignable / coupure / timeout
    case 'rate':     break;                                           // ralentir
    case 'protocol': console.error('Bug d’adapter ou version incompatible', e); break;
    case 'server':   console.error('Bug backend, voir les logs serveur', e); break;
  }
}
```

- Les textes affichés au joueur sont à la charge d'Astra (mappés depuis `code`) ; `e.message` est technique (anglais).
- En dev, le SDK valide chaque message reçu : un message serveur hors contrat produit une erreur `CONTRACT_VIOLATION` (catégorie `protocol`) → à signaler à Claude.

## 11. Reconnexion

Automatique : sur coupure réseau, le SDK passe en `reconnecting`, se reconnecte (backoff jusqu'à 5 s), refait `hello` + sync, puis `room.resume` avec le jeton. L'UI reçoit ensuite un snapshot à jour. Si le siège a expiré : événement `sessionEnded('expired')`. Politique serveur (grâces 30 s lobby / 90 s match) : [GAME_LIFECYCLE.md](../architecture/GAME_LIFECYCLE.md#déconnexion--reconnexion).

## 12. Vérifier l'intégration

| Outil | Commande | Sert à |
| --- | --- | --- |
| Check d'intégration | `npm run check:integration [-- --url ws://… --players 4]` | 18 étapes : serveur joignable, version, handshake, horloge, room, synchro des joueurs, pseudo refusé, ready, démarrage, annonce, timestamp commun, actions, résultats, scores, manche suivante, classement, retour lobby, conformité de chaque message. Chaque échec indique **[NETWORK] / [PROTOCOL] / [BACKEND] / [FRONTEND]** |
| Bots | `npm run bots -- --code BCDF --count 3` | compléter votre room de test avec des joueurs qui jouent |
| Room de bots | `npm run bots -- --create --count 3` | un bot crée et héberge : rejoindre avec le code affiché |
| Santé | `GET http://localhost:3001/health` | le serveur tourne, version du protocole |
| Infos | `GET http://localhost:3001/api/info` | micro-jeux, timings, limites courantes |
| Accélérer | `BOUCAN_TIME_SCALE=0.2` au lancement du serveur | parties 5× plus rapides en dev |
| Logs | `LOG_LEVEL=debug npm run dev` | voir chaque refus de requête avec room / joueur / raison |

## 13. Besoin d'une évolution ?

Ne pas modifier `shared/`, `server/` ni `sdk/` : écrire dans [`docs/handoff/ASTRA_TO_CLAUDE.md`](../handoff/ASTRA_TO_CLAUDE.md) (quoi, pourquoi, quel micro-jeu, urgence). Claude adapte le contrat, régénère fixtures et schémas, et documente dans [`CLAUDE_TO_ASTRA.md`](../handoff/CLAUDE_TO_ASTRA.md).
