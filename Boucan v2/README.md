# BOUCAN V2

Jeu navigateur multijoueur (1 à 8 joueurs) composé de micro-jeux très courts, dans l'univers d'une école déjantée.

Le projet avance sur **deux chantiers parallèles** :

| Chantier | Propriétaire | Périmètre |
| --- | --- | --- |
| **Moteur** | Claude (Opus 5.5) | serveur, rooms, lifecycle des matchs, synchronisation, micro-jeux côté serveur, scores, sécurité, protocole, SDK réseau, tests, docs techniques |
| **Expérience** | Astra-6 | UI/UX, direction artistique, personnages, animations, audio, game design détaillé des micro-jeux, présentation des résultats |

La frontière entre les deux est un **contrat versionné** : `shared/` (schémas Zod → types, JSON Schema, fixtures). Voir [docs/integration/FRONTEND_BACKEND.md](docs/integration/FRONTEND_BACKEND.md).

---

## Démarrage rapide

### Prérequis

- **Node.js ≥ 22.12** (testé avec Node 24) — fournit `WebSocket` et `fetch` natifs.
- npm ≥ 10 (workspaces).
- Aucun service externe (pas de base de données).

### Installation

```bash
npm install
```

### Lancer le serveur (développement, rechargement auto)

```bash
npm run dev
```

- WebSocket : `ws://localhost:3001/ws`
- Santé : `http://localhost:3001/health`
- Infos contrat (version, micro-jeux, timings) : `http://localhost:3001/api/info`

Variables d'environnement : copier `.env.example` en `.env` (optionnel, lu automatiquement). Détail dans [.env.example](.env.example).

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `HOST` / `PORT` | `0.0.0.0` / `3001` | écoute HTTP + WebSocket (même port) |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` \| `silent` |
| `LOG_FORMAT` | `pretty` (dev) / `json` (prod) | format des logs |
| `ALLOWED_ORIGINS` | vide = toutes | origines navigateur autorisées (obligatoire en prod) |
| `BOUCAN_MINIGAMES` | vide = tous | restreint les micro-jeux joués, ex. `sonnerie,course-couloir` |
| `BOUCAN_TIME_SCALE` | `1` | accélère toutes les durées en dev (`0.2` = 5× plus vite) ; interdit ≠ 1 en prod |
| `MAX_ROOMS` | `500` | rooms simultanées max |
| `MAX_CONNECTIONS_PER_IP` | `32` | connexions WebSocket par IP |

### Vérifier que tout fonctionne

```bash
npm test                      # tests unitaires, contrat et end-to-end (~20 s)
npm run typecheck             # TypeScript strict sur les 3 packages
npm run contract:check        # schémas JSON / fixtures à jour avec le contrat
```

Vérification d'intégration contre un serveur lancé (utile pour Astra) :

```bash
BOUCAN_TIME_SCALE=0.2 npm run dev        # terminal 1 (bash)
npm run check:integration                # terminal 2 — 18 étapes ✓/✗ avec diagnostic
```

Sous PowerShell : `$env:BOUCAN_TIME_SCALE='0.2'; npm run dev`, ou mettre `BOUCAN_TIME_SCALE=0.2` dans `.env`.
Options : `npm run check:integration -- --url ws://hote:3001/ws --players 4 --rounds 3`.

Remplir une room de bots pour tester l'interface :

```bash
npm run bots -- --code BCDF --count 3    # rejoindre la room BCDF avec 3 bots
npm run bots -- --create --count 3       # un bot crée la room, affiche le code, démarre quand tout le monde est prêt
```

### Build & production

```bash
npm run build     # typecheck + bundle serveur → server/dist/main.js
npm start         # node server/dist/main.js (lit .env s'il existe)
```

En production : `NODE_ENV=production`, `ALLOWED_ORIGINS=https://<frontend>`, derrière un reverse proxy TLS (`wss://`). Un seul processus (état en mémoire, voir [ADR-0008](docs/architecture/adr/0008-etat-en-memoire.md)).

### Frontend

Le frontend est le chantier d'Astra (dossier `client/` à créer par Astra). Il consomme :

- `@boucan/sdk` : client réseau `BoucanClient` (connexion, horloge synchronisée, reconnexion, requêtes typées) ;
- `@boucan/sdk/local` : **le vrai moteur en mémoire + bots**, pour développer sans lancer de serveur ;
- `@boucan/shared` : types, schémas, fixtures.

Pour l'ajouter au monorepo : ajouter `"client"` à `workspaces` dans `package.json` puis `npm install`. Guide complet : [docs/integration/FRONTEND_BACKEND.md](docs/integration/FRONTEND_BACKEND.md).

---

## Organisation du dépôt

```
shared/                 @boucan/shared — LE CONTRAT (propriété Claude)
  src/contracts/          schémas Zod = source unique de vérité (types inférés)
  src/rules/              règles partagées : pseudo, modération, PRNG déterministe
  schemas/                JSON Schema GÉNÉRÉS (ne pas éditer)
  fixtures/               états réels GÉNÉRÉS pour développer l'UI sans serveur
server/                 @boucan/server — le moteur (propriété Claude)
  src/engine/             logique pure, sans IO (rooms, match, micro-jeux, scores)
  src/gateway/            protocole : handshake, validation, routage, diffusion
  src/transport/          WebSocket + HTTP (Node uniquement)
  src/config/             configuration centralisée + variables d'environnement
  test/                   tests moteur/protocole (horloge simulée)
  scripts/                génération du contrat
sdk/                    @boucan/sdk — client réseau de référence + mode local + bots (propriété Claude)
  scripts/                check:integration, bots
docs/
  architecture/           BACKEND, NETWORK_PROTOCOL, GAME_LIFECYCLE, MINIGAME_BACKEND, adr/  (Claude)
  integration/            FRONTEND_BACKEND (Claude)
  handoff/                CLAUDE_TO_ASTRA (Claude) · ASTRA_TO_CLAUDE (Astra)
  design/ gameplay/       (Astra)
client/ assets/ audio/  (Astra — à créer)
```

**Règle anti-conflit** : chacun n'écrit que dans son périmètre. Un besoin qui touche l'autre chantier passe par la boîte aux lettres `docs/handoff/` (voir ci-dessous).

## Documentation

| Document | Contenu |
| --- | --- |
| [docs/architecture/BACKEND.md](docs/architecture/BACKEND.md) | architecture, modules, responsabilités |
| [docs/architecture/NETWORK_PROTOCOL.md](docs/architecture/NETWORK_PROTOCOL.md) | tous les messages, payloads, erreurs, états de validité |
| [docs/architecture/GAME_LIFECYCLE.md](docs/architecture/GAME_LIFECYCLE.md) | machine à états, temps, déconnexions, host |
| [docs/architecture/MINIGAME_BACKEND.md](docs/architecture/MINIGAME_BACKEND.md) | intégrer / modifier / retirer un micro-jeu |
| [docs/integration/FRONTEND_BACKEND.md](docs/integration/FRONTEND_BACKEND.md) | **guide d'utilisation pour Astra** |
| [docs/handoff/CLAUDE_TO_ASTRA.md](docs/handoff/CLAUDE_TO_ASTRA.md) | changements backend à connaître |
| [docs/handoff/ASTRA_TO_CLAUDE.md](docs/handoff/ASTRA_TO_CLAUDE.md) | demandes d'Astra |
| [docs/architecture/adr/](docs/architecture/adr/) | décisions d'architecture |
| [CHANGELOG.md](CHANGELOG.md) | historique technique |

## Workflow d'évolution du contrat

1. Astra décrit le besoin dans `docs/handoff/ASTRA_TO_CLAUDE.md` (« le micro-jeu X a besoin d'un timestamp partagé Y »).
2. Claude adapte `shared/src/contracts` (+ serveur), régénère (`npm run contract:generate`), met à jour les tests.
3. Claude documente dans `docs/handoff/CLAUDE_TO_ASTRA.md` + `CHANGELOG.md` (version, impact, migration).
4. Astra consomme la nouvelle version.

Changement compatible → `CONTRACT_REVISION` (mineur). Changement cassant → `PROTOCOL_VERSION` + 1 (le serveur refuse alors les anciens clients avec `PROTOCOL_MISMATCH`, jamais de casse silencieuse).
