# BOUCAN

Jeu navigateur multijoueur façon **WarioWare** : des micro-jeux de quelques secondes enchaînés à toute vitesse, en ligne, de 1 à 8 joueurs (chacun sur son écran), à travers 5 mondes (prairie, désert, trésor, futur, ville). Des vies, des accélérations, des duels — le dernier debout gagne.

## Démarrage

Prérequis : **Node.js ≥ 22.12** (testé avec Node 24), npm ≥ 10. Aucun service externe.

```bash
npm install
npm run dev
```

Ouvrir **http://localhost:5180**. `npm run dev` lance le serveur de jeu (:3001, rechargement auto) et le client (Vite, :5180, qui relaie `/ws` vers le serveur).

- Jouer à plusieurs en local : créer une partie, puis ouvrir un 2ᵉ onglet et rejoindre avec le code (ou le lien « LIEN » du salon).
- Jouer seul sans serveur : http://localhost:5180/?offline (moteur dans la page + bots).
- Port 3001 déjà pris : `PORT=3002 BOUCAN_SERVER_PORT=3002 npm run dev`.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur + client en développement |
| `npm test` | tous les tests (moteur à horloge simulée, protocole, e2e WebSocket, serveur HTTP, client) |
| `npm run typecheck` | TypeScript strict sur les 4 packages |
| `npm run build` | typecheck + client (`client/dist`) + serveur (`server/dist/main.js`) |
| `npm start` | production : un seul port sert la page et le WebSocket |
| `npm run check:integration` | vérifie un serveur lancé de bout en bout (`-- --url ws://hôte:port/ws --players 4 --full`) |
| `npm run bots` | remplir une partie de bots (`-- --code BCDF --count 3` ou `-- --create --count 8`) |

## Configuration

Variables d'environnement du serveur : voir [.env.example](.env.example) (copier en `.env`, lu automatiquement). Les réglages de jeu (durées, rythme, vies, bots) sont dans `server/src/config/game-config.ts` et `shared/src/contracts/rules.ts`.

## Organisation

```
shared/    contrat client ↔ serveur (schémas Zod), catalogue des micro-jeux, règles communes
server/    moteur de partie sans IO + protocole + transport Node (WebSocket, HTTP, fichiers du client)
sdk/       client réseau BoucanClient, moteur local en mémoire, bots, scripts de vérification
client/    le jeu : menu, salon (DOM) et matchs (Canvas 2D)
  src/app/          écrans DOM : menu principal, salon, boutons audio, styles
  src/engine/       écran, dessin, entrées, assets, audio
  src/match/        interlude, cérémonies, HUD, orchestration du match
  src/microgames/   un fichier par micro-jeu
  public/assets/    manifest.json + personnages, sprites, musiques, éléments du menu
docs/      architecture, protocole, micro-jeux, déploiement, décisions (ADR)
```

## Documentation

| Document | Contenu |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | vue d'ensemble, déroulé d'une partie, serveur, client, menu, audio |
| [docs/PROTOCOL.md](docs/PROTOCOL.md) | messages WebSocket, snapshot, temps, erreurs, reconnexion |
| [docs/MICROGAMES.md](docs/MICROGAMES.md) | ajouter, modifier ou retirer un micro-jeu |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | production, Docker, tunnel Cloudflare, variables |
| [client/public/assets/README.md](client/public/assets/README.md) | ajouter personnages, sons, musiques, décors |
| [docs/adr/](docs/adr/) | décisions d'architecture |
| [docs/BACKLOG.md](docs/BACKLOG.md) | pistes |
| [CHANGELOG.md](CHANGELOG.md) | historique |
