# Changelog technique

Versions : `PROTOCOL_VERSION` (cassant) / `CONTRACT_REVISION` (compatible) / version serveur. Plus récent en haut.

## 2026-09-27 — dépôt GitHub, branches `main` / `dev`, version de test

Jeu inchangé. Voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#branches--main-en-ligne-dev-à-tester).

| Module | Changement |
| --- | --- |
| git | Dépôt [nouteK/Boucan](https://github.com/nouteK/Boucan) : `main` = version en ligne (celle du 27/09 16:32), `dev` = travail en cours ; README à la racine du dépôt |
| CI | GitHub Actions (`.github/workflows/ci.yml`) : `npm ci`, `npm test`, `npm run build` à chaque push sur `main` / `dev` |
| déploiement | `Mettre en ligne.bat` construit l'image depuis la **branche `main`** (`git archive`, la plus récente entre le PC et GitHub) au lieu des fichiers du dossier ; l'image porte branche + commit (labels), affichés en fin de mise en ligne ; le tunnel de production est retrouvé par ses labels compose |
| déploiement | Nouveau `Tester la version dev.bat` / `Arreter la version dev.bat` (`scripts/test-dev.ps1`, `docker-compose.test.yml`) : branche `dev` dans le conteneur `boucan-test` (port 3002, `BOUCAN_TEST_PORT`) + lien public temporaire séparé, sans toucher à la production |
| scripts | Fonctions communes dans `scripts/lib.ps1` (Docker, git, santé, tunnel) |

## 2026-09-27 — contrat 2.1.0 · 21 mini-jeux du prototype OUAF WARE, nouveau fond, menu revu

Protocole inchangé (2). Voir [ADR-0012](docs/adr/0012-nouveaux-mini-jeux.md).

| Module | Changement |
| --- | --- |
| `shared/contracts` | Catalogue : 44 micro-jeux (+11 solos `but`, `baisse`, `panier`, `caisse`, `combo`, `glisse`, `skate`, `lancer`, `recette`, `gemmes`, `bulle` ; +10 duels `cristal`, `boules`, `glace`, `corde`, `radeau`, `boxe`, `soleil`, `roi`, `gardien`, `noir`). Nouvel indice de geste `alternate`. `CONTRACT_REVISION` 2.1.0 |
| `server/minigames` | 10 modules de duel autoritaires (bots, compensation de latence sur `meta.at`, états JSON, événements) ; `kits/duel.ts` (`twoTeams`, `Alternation`, `BotClock`, `Side`) |
| `client/microgames` | 21 micro-jeux ; helpers `npc`, `isPress`, `sideOf`, `fxRand` ; accessoires `keyCap`, `ringTimer`, `gauge`, `gem`, `crystal`, `chest`, `snowBall`, `arrow` ; décors peints `sceneBg` ; `MgInstance.dispose()` appelé par `MatchView` |
| `client/engine` | Poses `kick`, `throw`, `duck`, `slide`, `box*`, `paddle*`, `pull*` (poses sur planche dédiée via `sprite`, étirement `sx`/`sy`, `assets.hasPoseArt`) ; décors `{ image, floor }` ; entrées ZQSD / WASD, `keyup`, drapeau `repeat` ; sons `hit`, `block`, `splash` ; icône de geste `alternate` |
| `client/assets` | Planche du chien étendue (coup de pied, se baisser, glisser, lancer), planches `chien-boxe`, `chien-boxe-ko`, `chien-rame`, `chien-corde`, `balle`, `skate`, `radeau`, décors `foret`, `ville`, `neige`, `futur` (extraits du HTML) |
| **correctif** | Maintenir une flèche ne martèle plus tout seul (auto-répétition clavier ignorée dans `cours`, `course`, `devore`, `taille`, `efface`, `boss-classe`) |
| `client/app` | Fond `fond.webp` (menu et salon). Menu revu : titre BOUCAN vectoriel (`logo.ts`, net à toute taille), boutons dessinés en CSS sans image (CRÉER UNE PARTIE ; champ + REJOINDRE), MUSIQUE / SONS en haut à droite (icônes SVG en ligne), menu affiché une fois la police chargée ; salon : même logo, titre et textes lisibles sur fond sombre, bouton LIEN sans image |
| `client/dev` | `?preview=<id>` : un micro-jeu seul en boucle (duels compris, module serveur dans la page), `&freeze=` ; `?offline&games=…&duelEvery=…&bots=…` |
| nettoyage | Anciens éléments du menu supprimés (`corridor.svg`, `boucan-logo.webp`, formes et icônes SVG des boutons) |
| tests | + fumée de tous les micro-jeux solo/boss, chaque duel de bout en bout (module + rendu, 2/3/5 joueurs), règles des nouveaux duels côté serveur : 148 tests |

## 2026-09-27 — nouveau menu principal, nettoyage, production

| Module | Changement |
| --- | --- |
| `client/app` | Menu principal refait d'après le kit `boucan_menu_web_kit` : vraie UI DOM (décor, logo, boutons, icônes SVG, textes HTML, champ réel), scène 16:9 en unités de conteneur, portrait en colonne. Créer / rejoindre (bouton + Entrée) avec validation et erreurs dans la direction artistique ; MUSIQUE / SONS pilotent réellement l'audio (persistés). Accessibilité : clavier, focus visible, `aria-*`, états désactivés, `prefers-reduced-motion` |
| `client/app` | Salon réécrit dans la même DA (personnage, pseudo, joueurs, bots, réglages de l'hôte, prêt / lancer) ; confirmation en deux temps au lieu de `confirm()` ; retour propre au menu quand la session est perdue |
| `client/engine` | Audio : bus musique / effets séparés, préférences `boucan.audio`, pistes `menu` / `match` ; boucle de rendu protégée (une frame en erreur ne fige plus la partie) ; viewport 0×0 ignoré |
| `server/transport` | **Correctif** : une URL mal encodée faisait planter le processus ; requêtes byte-range (206) pour l'audio (Safari) ; `Content-Length` ; filet de sécurité sur le handler HTTP ; `TRUST_PROXY` (IP réelle derrière un tunnel / proxy) |
| `server/config` | `CLIENT_DIR` vide = valeur par défaut ; `.env.example` à jour |
| `sdk/scripts` | `check:integration` réécrit pour le protocole 2 (20 étapes, `--full`) ; `bots` : option `--length`, jusqu'à 8 bots en création |
| déploiement | `Dockerfile` construit tout depuis les sources (non-root, healthcheck), `docker-compose.yml` avec profil `tunnel` Cloudflare, `docs/DEPLOYMENT.md` |
| nettoyage | Écrans remplacés (`home.ts`, `attract.ts`), aides de dessin et de config inutilisées, primitive `SessionId`, asset inutilisé ; `noUnusedLocals` activé ; docs v1 / Astra remplacées par `docs/ARCHITECTURE.md`, `PROTOCOL.md`, `MICROGAMES.md`, `DEPLOYMENT.md`, ADR 0010–0011 |
| tests | + tests client (catalogue ↔ micro-jeux, code de partie, messages d'erreur, préférences audio) et serveur HTTP (statique, ranges, URL invalide, réglages) : 81 tests |

## 2026-09-27 — serveur 3.0.0 · protocole 2 · contrat 2.0.0

Le jeu devient un WarioWare multijoueur ; le client est intégré au monorepo (`client/`). Voir [ADR-0010](docs/adr/0010-vies-et-autorite-v2.md) et [ADR-0011](docs/adr/0011-client-unique-monorepo.md).

| Module | Changement |
| --- | --- |
| `shared/contracts` | Phases `LOBBY → STAGE_INTRO → (INTERLUDE → MICROGAME → VERDICT)* → STAGE_RESULTS` ; vies, fantômes, `round` / `verdict` / `final` ; `MatchConfig { zone, lives, length }` ; `room.addBot`, `minigame.report` / `minigame.input` avec `roundId` ; catalogue de 23 micro-jeux |
| `server/engine` | Rythme (niveaux, accélérations, boss, duels), vies, bots serveur ; kit générique solo/boss ; 3 duels simulés (`degaine`, `patate`, `course`) ; scoring v1 et modules v1 supprimés |
| `client` | Le jeu : menu, salon, interludes, zoom, 23 micro-jeux, HUD, verdicts, classement, personnages animés, musique |
| supprimé | `shared/schemas`, `shared/fixtures`, scripts de génération du contrat, boîtes aux lettres Astra |

## 2026-09-26 — organisation du repo

| Module | Changement | Impact frontend | Migration |
| --- | --- | --- | --- |
| repo | Racine git = `Boucan-v2/` (branche `main`) ; backend dans `Boucan v2/`, frontend d'Astra dans `Boucan-v2_Astra/` | le frontend consomme `@boucan/sdk` / `@boucan/shared` via `file:../Boucan v2/…` | remplace « `client/` dans les workspaces » |
| docs | README, CLAUDE.md, FRONTEND_BACKEND § 2 mis à jour | voir § 2 | — |

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
