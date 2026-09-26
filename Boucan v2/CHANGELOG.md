# Changelog technique

Format : date · module · changement · impact frontend · migration. Versions : `PROTOCOL_VERSION` (cassant) / `CONTRACT_REVISION` (compatible) / version serveur.

## 2026-09-26 — serveur 2.0.0 · protocole 1 · contrat 1.0.0

Première version du backend V2 (nouvelle base, V1 non reprise telle quelle).

| Module | Changement | Impact frontend | Migration |
| --- | --- | --- | --- |
| `shared/contracts` | Contrat v1 : enveloppes, 16 messages client, 6 types de push, modèle (`RoomSnapshot`, `Lobby`, `Player`, `MatchState`, `MiniGameSession`, `PlayerResult`, `RoundResults`, `Standing`, `MatchResults`, `ServerInfo`), 27 codes d'erreur catégorisés, 9 phases | base de tout le frontend | — |
| `shared/rules` | `checkNickname` (NFKC, graphèmes, refus explicites), filtre de mots repris de V1, PRNG `createRng` figé par test | validation pseudo côté client, génération déterministe | — |
| `shared/schemas`, `shared/fixtures` | JSON Schema et 20 fixtures générés depuis de vrais matchs (`npm run contract:generate`, vérif `contract:check`) | développer l'UI sans serveur | — |
| `server/engine` | Moteur sans IO : RoomManager, Room (host, grâces, kick), Match (machine à états), sessions de micro-jeu (3 autorités, isolation des plantages), scoring (placement/threshold/normalized, `failures`), sélection | — | — |
| `server/engine/minigames` | 4 modules de référence : `sonnerie` (server), `interro-surprise` (local), `course-couloir` (relay), `fausse-couleur` (local, threshold) + bots | placeholders à redéfinir par Astra | — |
| `server/gateway`, `transport` | Protocole WebSocket JSON, handshake versionné, validation Zod, rate limits, `/health`, `/api/info`, RTT mesuré | — | — |
| `sdk` | `BoucanClient`, `createLocalGame` (moteur en mémoire + bots), `BotPlayer`, helpers, CLI `check:integration` et `bots` | point d'accès réseau unique | — |
| tests | 95 tests : lobby, pseudos, 1/2/4/8 joueurs × 3/5/8/10 manches, timers, scoring, déconnexions, host, protocole, micro-jeux, contrat, e2e WebSocket | — | — |
