# Lifecycle d'une partie

> Propriétaire : Claude. Implémentation : [`server/src/engine/match/match.ts`](../../server/src/engine/match/match.ts), transitions : [`shared/src/contracts/phases.ts`](../../shared/src/contracts/phases.ts).

Le frontend lit **une seule valeur** pour savoir où en est la partie : `snapshot.match.phase`. Pas de combinaison de booléens.

## Machine à états

```
                 match.start (host, tous prêts)
   ┌────────┐ ───────────────────────────────► ┌────────────────┐
   │ LOBBY  │                                   │ MATCH_STARTING │ (3 s, exact)
   └────────┘ ◄──────┐                          └───────┬────────┘
       ▲             │ match.abort (host) depuis         │
       │             │ n'importe quelle phase            ▼
       │             │                        ┌────────────────────┐  micro-jeu annoncé : id, seed, params,
       │             │               ┌──────► │ MINIGAME_PREPARING │  participants. Chargement → minigame.ready
       │             │               │        └─────────┬──────────┘  (min 3 s, max 12 s : fin dès que tous prêts)
       │             │               │                  ▼
       │             │               │        ┌────────────────────┐
       │             │               │        │ MINIGAME_COUNTDOWN │  3 s, exact. activeAt / endsAt connus
       │             │               │        └─────────┬──────────┘
       │             │               │                  ▼
       │             │               │        ┌────────────────────┐  le jeu tourne. Fin à endsAt ou plus tôt
       │             │               │        │  MINIGAME_ACTIVE   │  si le module est terminé (tout le monde fini)
       │             │               │        └─────────┬──────────┘
       │             │               │                  ▼
       │             │               │        ┌────────────────────┐  « stop » ; attend les derniers rapports
       │             │               │        │  MINIGAME_ENDING   │  (min 0,8 s ; max 0,8 s + 3 s si rapports)
       │             │               │        └─────────┬──────────┘
       │             │               │                  ▼
       │             │               │        ┌────────────────────┐  lastRound + standings mis à jour
       │             │               │        │  MINIGAME_RESULTS  │  (5 s, exact)
       │             │               │        └───┬────────────┬───┘
       │             │  manche suivante           │            │ dernière manche
       │             │        ┌──────────────┐    │            ▼
       │             │        │ INTERMISSION │◄───┘   ┌────────────────┐  final : classement, gagnants,
       │             │        └──────┬───────┘        │ MATCH_RESULTS  │  historique des manches
       │             │   (4 s, exact)│                └───────┬────────┘
       │             │               └──► PREPARING           │ match.returnToLobby (host)
       └─────────────┴────────────────────────────────────────┘ (ou auto si timings.matchResultsMs ≠ null)
```

Correspondance avec la proposition initiale : `BOOT` est côté client (connexion, `hello`) ; `READY` est un état **par joueur** (`player.ready`) dans `LOBBY`, résumé par `lobby.canStart` ; `RETURN_TO_LOBBY` est la transition `MATCH_RESULTS → LOBBY`.

Toutes les durées sont dans `ServerInfo.timings` (configurables : [`game-config.ts`](../../server/src/config/game-config.ts)).

## Temps

**Principe : le serveur envoie des timestamps, le client anime.** Aucun paquet par frame.

- Horodatages = millisecondes epoch de l'horloge **serveur**.
- Le client estime `serverNow()` avec `time.sync` (5 échantillons à la connexion puis 1 toutes les 30 s ; l'échantillon au plus petit RTT gagne). Le SDK le fait pour vous : `client.serverNow()`.
- Chaque snapshot donne `match.phaseStartedAt`, `match.phaseEndsAt` et `match.phaseEndsExactly` :
  - `true` → la phase se termine **exactement** à `phaseEndsAt` (countdown, résultats, intermission) : afficher un compte à rebours.
  - `false` → `phaseEndsAt` est une **borne max** (préparation, jeu, ending) : la phase peut finir plus tôt ; afficher une durée max ou rien.
  - `phaseEndsAt = null` → phase ouverte (`LOBBY`, `MATCH_RESULTS` sans retour auto).
- Dès `MINIGAME_COUNTDOWN`, la session porte `timing.activeAt` (début du jeu) et `timing.endsAt` (fin max) : tous les clients démarrent le jeu au même instant serveur, sans attendre un autre message.
- **Pas de dérive** : quand une phase se termine sur son échéance, la suivante commence *à l'échéance* (et non au tick qui l'a constatée). `MINIGAME_ACTIVE.phaseStartedAt === timing.activeAt` exactement.
- Résolution serveur : tick de 50 ms (transitions au plus 50 ms après l'échéance réelle ; les timestamps annoncés restent exacts).

### Latence

- Entrées `minigame.input` : `at` fourni par le client (heure serveur estimée de l'action) est borné à `[réception − 150 ms, réception]`.
- Jugement serveur des réactions (ex. Sonnerie) : `réaction = réception − envoi_du_signal − RTT`, avec le RTT **mesuré par le serveur** (ping WebSocket), plafonné à 300 ms. Aucune horloge client n'est crue.
- Après la fin du jeu, les entrées restent acceptées 150 ms (arrivées en vol).

## Joueurs

- 1 à 8 joueurs. Siège (`seat`) 0–7 stable, attribué au premier libre (utile pour ordonner / attribuer une couleur-slot côté Astra).
- Pseudo : unique dans la room (suffixe « 2 », « 3 »… ajouté par le serveur).
- `ready` n'existe qu'en lobby ; remis à `false` au retour au lobby.
- Démarrage : le host, quand **tous les joueurs connectés** sont prêts et qu'au moins un micro-jeu accepte ce nombre de joueurs. Les sièges des joueurs déconnectés sont libérés au démarrage.
- Pas d'arrivée en cours de match (`MATCH_IN_PROGRESS`).

## Host

| | |
| --- | --- |
| Qui | le créateur de la room |
| Peut | configurer le match (`rounds`, `minigamePool`), exclure (`room.kick`, lobby), démarrer, annuler (`match.abort`), revenir au lobby après le podium |
| Ne peut pas | influencer le déroulé d'une manche, les scores, les résultats |
| Départ (`room.leave`, exclusion, expiration) | transfert **immédiat** au joueur connecté de plus petit siège |
| Déconnexion | transfert après **5 s** (`reconnect.hostTransferMs`) si un autre joueur est connecté — une micro-coupure ne vole pas le rôle |
| En match | le match continue sans lui (le serveur pilote tout) ; seul le retour au lobby final attend un host, qui existe toujours tant qu'un joueur est connecté |

## Déconnexion / reconnexion

| Situation | Politique |
| --- | --- |
| **Lobby** | `connection: "disconnected"`, siège conservé **30 s** (`lobbyGraceMs`) → sinon retiré (`playerLeft` `timeout`). Ne bloque pas `canStart` (seuls les connectés comptent). |
| **Pendant un micro-jeu** | la partie ne s'arrête jamais : le joueur ne bloque ni le chargement (`allReady` ignore les déconnectés) ni la fin (les modules ignorent les absents). Sans résultat → **dnf, 0 point** pour la manche. |
| **Pendant les résultats / intermission** | rien de spécial, il garde son score. |
| **Retour dans les 90 s** (`matchGraceMs`) | `room.resume` : même siège, même score, reçoit le snapshot courant (+ l'état partagé du micro-jeu en cours) et joue la manche en cours si elle n'est pas finie, sinon la suivante. |
| **Au-delà de 90 s, ou `room.leave` en match** | `connection: "left"` : jeton invalidé, n'est plus participant des manches suivantes, **reste dans le classement** jusqu'au retour au lobby où il est retiré. |
| **Room sans aucun joueur connecté** | fermée après **60 s** (`emptyRoomTtlMs`). En lobby, elle se vide déjà via la grâce de 30 s. |
| **Même joueur, deuxième onglet** | `room.resume` avec le même jeton : l'ancienne connexion reçoit `session.ended: replaced` puis fermeture 4002. |
| **Tout le monde est parti (`left`) en cours de match** | room fermée immédiatement (plus aucun siège). |

## Manches & sélection

- Nombre de manches ∈ `{3, 5, 8, 10}` (`GAME_RULES.roundOptions`, 10 = plafond).
- À chaque manche : micro-jeux du pool du host (ou tous), compatibles avec le nombre de participants ; aucun rejoué avant que tous aient été joués ; jamais deux fois de suite si évitable ; pondération `weight`.
- Seed publique par manche (dérivée de la seed du match) → mêmes niveaux sur tous les clients.

## Scores

Détail : [ADR-0005](adr/0005-scoring.md).

1. Le module produit un `PlayerResult` brut par participant (absent ⇒ `dnf`).
2. Classement : `success` > `failure` > `dnf`, puis selon `scoring.rankBy` (clé principale + départages). Ex æquo = même rang.
3. Points selon `scoring.strategy` :
   - `placement` : table `[10, 7, 5, 3, 2, 1, 1, 1]` selon le rang ;
   - `threshold` : 6 points pour une réussite ;
   - `normalized` : `round(normalized × 10)`.
   - Échec : 0 point, sauf `scoring.failures = "ranked"` (l'échec partiel compte selon son rang). `dnf` = toujours 0.
   - Manche **solo** (1 joueur, `placement`) : barème par `normalized` (≥ 0,8 → 10, ≥ 0,55 → 7, ≥ 0,3 → 5, sinon 2).
4. Score du match = somme des points ; `standings` avec `previousRank` et `delta` pour animer les changements de place.
