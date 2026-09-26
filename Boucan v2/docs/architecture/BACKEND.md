# Architecture backend

> Propriétaire : Claude. Dernière mise à jour : 2026-09-26 (protocole v1, contrat 1.0.0).

## Vue d'ensemble

```
 navigateur (frontend Astra)                         serveur Node (1 processus)
┌───────────────────────────┐   WebSocket JSON   ┌──────────────────────────────────────────┐
│ UI ── BoucanClient (sdk)  │ ◄────────────────► │ transport/ws-server  (HTTP /health, /ws) │
└───────────────────────────┘    protocole v1    │        │ Connection (send/close/rtt)      │
                                                 │ gateway/  handshake · validation Zod ·   │
┌───────────────────────────┐   mémoire          │           rate limit · routage · fan-out │
│ UI ── BoucanClient        │ ◄───────┐          │        │ commandes          ▲ sorties     │
│ @boucan/sdk/local         │  même   │          │ engine/  RoomManager → Room → Match      │
│ (moteur réel + bots)      │ Gateway ┘          │          → MiniGameSessionRunner → module│
└───────────────────────────┘                    └──────────────────────────────────────────┘
```

Trois packages npm (workspaces) :

| Package | Rôle | Dépendances |
| --- | --- | --- |
| `@boucan/shared` | **contrat** : schémas Zod, types inférés, codes d'erreur, phases, règles partagées (pseudo, PRNG), fixtures | `zod` |
| `@boucan/server` | moteur + protocole + transport Node | `shared`, `ws`, `zod` |
| `@boucan/sdk` | client réseau de référence, mode local (moteur en mémoire), bots, outils CLI | `shared`, `server` (mode local uniquement) |

## Principes

1. **Backend agnostique de la DA.** Le serveur transmet des états et des événements sémantiques (`connection: "disconnected"`, `{ type: "bellRang", kind: "fake" }`), jamais de sprite, son, couleur ou layout. Le frontend décide de la représentation.
2. **Une seule source de vérité** : les schémas Zod de `shared/src/contracts`. Types TS inférés, JSON Schema et fixtures générés (`npm run contract:generate`, vérifié par `contract:check`).
3. **Moteur sans IO.** `server/src/engine` ne connaît ni socket, ni timer, ni console : il reçoit des commandes avec `now` et un `tick(now)`, et émet vers une interface `EngineOutput`. Conséquences : tests déterministes à horloge simulée, et le même moteur tourne dans le navigateur (`@boucan/sdk/local`). Voir [ADR-0009](adr/0009-moteur-sans-io.md).
4. **Micro-jeux = modules isolés.** Le cœur ne contient aucune règle de micro-jeu. Un module déclare son autorité, sa durée, son scoring, ses entrées ; ajouter un jeu = un dossier + une ligne dans le catalogue. Un module qui plante ne casse pas la partie.
5. **Autorité adaptée à chaque jeu** (`local` / `relay` / `server`), pas de tout-serveur ni de tout-client par principe. Voir [ADR-0004](adr/0004-autorite-par-micro-jeu.md).
6. **Le temps se transmet en timestamps**, jamais en ticks réseau : le client anime ses timers localement avec l'horloge synchronisée. Voir [ADR-0006](adr/0006-temps-et-synchronisation.md).
7. **Configuration centralisée** : `server/src/config/game-config.ts` (tout ce qui se règle) et `shared/src/contracts/rules.ts` (règles communes client/serveur). Aucune constante magique dispersée.

## Modules

### `server/src/engine/` — le moteur (sans IO)

| Fichier | Responsabilité |
| --- | --- |
| `room-manager.ts` | création/recherche des rooms (codes), jetons de session, `tick` global, fermeture des rooms abandonnées ; isole les pannes d'une room |
| `room/room.ts` | une room : joueurs, sièges, host, configuration du match, règles du lobby (ready, pseudo, perso, kick, start), déconnexions/grâces ; produit les snapshots (`rev`) puis les événements |
| `match/match.ts` | **machine à états du match** : phases, manches, sélection, session de micro-jeu, scoring de manche, classement, fin de match |
| `match/selection.ts` | choix du micro-jeu suivant (pool du host, nombre de joueurs, pas de répétition, poids) |
| `minigames/api.ts` | **API des modules** (le seul contrat qu'un micro-jeu implémente) |
| `minigames/session.ts` | exécution générique d'un module : chargement (ready), timestamps, routage + rate-limit des entrées, rapports, diffusion throttlée de l'état partagé, isolation des plantages |
| `minigames/registry.ts` | modules enregistrés/activés, validation au démarrage, définitions publiques |
| `minigames/kits/local.ts` | kit pour micro-jeux `local` (rapports clients) |
| `minigames/modules/<id>/` | un dossier par micro-jeu (`index.ts` = module, `bot.ts` = joueur simulé de dev) |
| `minigames/catalog.ts` | liste des modules et des bots — **le seul fichier à toucher pour ajouter/retirer un jeu** |
| `scoring/scoring.ts` | résultats bruts → rangs → points (stratégies), classement général |
| `errors.ts` | `EngineError` (code du contrat + détails) |
| `logger.ts`, `output.ts` | interfaces injectées (logs, sorties) |

### `server/src/gateway/` — le protocole

`gateway.ts` reçoit des `Connection` (quel que soit le transport) : parse l'enveloppe, impose le handshake (`hello` + version), valide chaque payload avec le schéma du contrat, applique le rate-limit par connexion, ferme les connexions qui envoient trop de messages invalides, route vers `handlers.ts`, répond (`reply`) et diffuse la sortie du moteur aux connexions de la room (sérialisation une seule fois par diffusion). Gère aussi le remplacement de session (même joueur ouvert dans un autre onglet).

### `server/src/transport/ws-server.ts` — Node

Serveur HTTP + WebSocket (`ws`) sur un seul port : `/ws` (jeu), `/health`, `/api/info`. Contrôle d'origine, limite de connexions par IP, taille max des messages, heartbeat ping/pong (détection des sockets morts **et mesure du RTT** utilisée par la compensation de latence), boucle de tick (50 ms).

### `server/src/config/`

- `game-config.ts` : `GameConfig` — timings de phases, grâces de reconnexion, tables de points, paramètres réseau et limites, roster de personnages autorisé (optionnel), micro-jeux activés, `durationScale`, seed fixe (tests).
- `env.ts` : seul point de lecture de `process.env`, validé par Zod ; erreurs lisibles au démarrage.

### `sdk/`

- `BoucanClient` : connexion, handshake, synchronisation d'horloge (NTP simplifié), requêtes typées avec timeout, reconnexion automatique + reprise de session, validation des messages entrants (dev), erreurs typées par catégorie.
- `local/` : `createLocalServer` / `createLocalGame` — le moteur réel en mémoire + bots.
- `bots/` : `BotPlayer`, joueur simulé qui passe par le protocole public.
- `scripts/` : `check:integration`, `bots`.

## Flux d'une commande

```
client ── {"type":"player.ready","rid":"r7","payload":{"ready":true}} ──► gateway
gateway : JSON ok → enveloppe ok → rate limit ok → type connu → handshake ok → payload valide
        → handlers['player.ready'] → room.setReady(playerId, true, now)
room    : règles (siège, phase LOBBY) → état modifié → dirty
        → flush(): snapshot (rev+1) diffusé à la room, puis événements en file
gateway ── {"type":"reply","rid":"r7","ok":true,"payload":{}} ──► client
```

Refus métier : le moteur lève `EngineError(code, details)` → `reply { ok:false, error }` (ou message `error` si pas de `rid`). Exception inattendue : loggée avec contexte, réponse `INTERNAL` (catégorie `server`).

## Logs

Chaque ligne porte son contexte : `room`, `match`, `round`, `minigame`, `session`, `player`, `conn`.

```
20:33:09.976 INFO  round prepared  room=HBJT match=m_uBgz4N9OVI round=2 minigame=course-couloir session=m_uBgz4N9OVI.r2 participants=4
20:33:31.410 INFO  round scored    room=HBJT match=m_uBgz4N9OVI round=2 minigame=course-couloir results="p_a:success#1+10 p_b:failure#2+7"
```

`info` : cycle de vie (room, joueurs, match, manches, scores, host). `debug` : transitions de phase, refus de requêtes, connexions. Aucun log par frame ni par entrée de jeu. Production : `LOG_FORMAT=json`.

## Sécurité (proportionnée)

| Menace | Protection |
| --- | --- |
| payload malformé / inattendu | validation Zod de chaque message ; `INVALID_PAYLOAD` avec chemin du champ |
| messages géants | `maxPayload` WebSocket + contrôle gateway (16 Ko) |
| spam | token bucket par connexion (60 burst, 40/s) + par joueur et par micro-jeu (`input.ratePerSecond`) |
| client cassé / hostile | > 25 erreurs protocole en 10 s → fermeture `4008` |
| connexions en masse | `MAX_CONNECTIONS_PER_IP`, `MAX_ROOMS`, timeout de handshake (10 s) |
| origine tierce | `ALLOWED_ORIGINS` (obligatoire en prod) |
| pseudos | normalisation NFKC, longueur en graphèmes, caractères autorisés (pas de contrôle, zero-width ni bidi), filtre de mots (leet, étirements, séparateurs) — **toujours revalidés côté serveur** |
| actions impossibles | vérification de phase, de siège, de rôle host, de session de micro-jeu (`STALE_SESSION`), de participation |
| triche | selon l'autorité : bornes de plausibilité des rapports, anti-vitesse (relay), jugement serveur + RTT mesuré (server), infos secrètes jamais dérivables de la seed publique |
| vol de session | jeton opaque 192 bits, invalidé à la sortie du joueur ; un seul socket actif par joueur |

Hors périmètre (volontairement) : comptes, anti-triche lourd, bannissement persistant.

## Limites connues / pistes

- **Un seul processus** (état en mémoire) : suffisant pour des centaines de rooms. Passage à plusieurs instances = sticky sessions par code de room ; voir [ADR-0008](adr/0008-etat-en-memoire.md).
- **Pas de spectateurs** ni d'arrivée en cours de match (`MATCH_IN_PROGRESS`).
- **Kick sans bannissement** : un joueur exclu peut revenir avec le code.
- Roster de personnages non validé par défaut (`characters.allowed = null`) tant qu'Astra n'a pas figé la distribution.
