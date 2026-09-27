# Déploiement

Un seul processus Node sert la page du jeu, ses assets et le WebSocket sur le **même port** (3001 par défaut). État en mémoire : pas de base de données, mais aussi **une seule instance** (pas de répartition de charge ; un redémarrage termine les parties en cours).

## Sans Docker

```bash
npm ci
npm run build          # typecheck + client (client/dist) + serveur (server/dist/main.js)
NODE_ENV=production npm start
```

PowerShell : `$env:NODE_ENV='production'; npm start`. Le serveur sert `client/dist` s'il existe (`CLIENT_DIR` pour un autre dossier) et lit `.env` à la racine s'il existe.

Vérifier : `http://localhost:3001/health`, puis `npm run check:integration -- --url ws://localhost:3001/ws`.

## Docker

L'image construit tout depuis les sources (aucun build préalable nécessaire) et ne garde à l'exécution que le bundle serveur, le client construit et les dépendances de production (`ws`, `zod`).

```bash
docker build -t boucan .
docker run -d --name boucan -p 3001:3001 boucan
```

Ou avec Compose :

```bash
docker compose up -d --build
```

L'image tourne en utilisateur non-root, avec `NODE_ENV=production` et un `HEALTHCHECK` sur `/health`. Compose crée le conteneur `boucan-game` ; ses réglages (`TRUST_PROXY`, `ALLOWED_ORIGINS`, `BOUCAN_PORT`, `LOG_LEVEL`) se mettent dans un `.env` à côté de `docker-compose.yml` (non versionné).

Mettre à jour sans couper une partie : vérifier `rooms: 0` sur `/health`, puis `docker compose up -d --build` (même nom, même port : un tunnel déjà branché sur le port suit automatiquement).

## Exposer sur Internet

Le jeu doit être servi en **HTTPS** : le client ouvre alors `wss://<même hôte>/ws` automatiquement.

### Tunnel Cloudflare (le plus simple)

Sans compte, URL temporaire `https://<aléatoire>.trycloudflare.com` :

```bash
docker compose --profile tunnel up -d --build
docker compose logs tunnel          # l'URL publique s'affiche ici
```

Sans Docker : `cloudflared tunnel --url http://localhost:3001` ([téléchargement](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)).

Pour un domaine stable : tunnel nommé (`cloudflared tunnel login`, `cloudflared tunnel create boucan`, `cloudflared tunnel route dns boucan jeu.exemple.fr`).

### Reverse proxy (nginx, Caddy…)

Transmettre les en-têtes d'upgrade WebSocket sur `/ws` et tout le reste tel quel vers le port 3001.

### Réglages derrière un tunnel ou un proxy

| Variable | Valeur | Pourquoi |
| --- | --- | --- |
| `TRUST_PROXY` | `true` | sinon tous les joueurs partagent l'IP du proxy et la limite `MAX_CONNECTIONS_PER_IP` (32) devient une limite **globale** |
| `ALLOWED_ORIGINS` | `https://jeu.exemple.fr` | n'accepter le WebSocket que depuis la page du jeu |

Avec `TRUST_PROXY=true`, n'exposer le port 3001 **que** derrière le proxy (sinon un client peut falsifier `X-Forwarded-For`).

## Variables d'environnement

Voir [.env.example](../.env.example). En production : `NODE_ENV=production` (logs JSON, `BOUCAN_TIME_SCALE` doit valoir 1).

## Branches : `main` en ligne, `dev` à tester

Dépôt : [github.com/nouteK/Boucan](https://github.com/nouteK/Boucan) (racine git = dossier parent de `Boucan v2`).

| Branche | Où elle tourne |
| --- | --- |
| `main` | le jeu en ligne : conteneur `boucan-game` (port 3001) + tunnel public de production |
| `dev` | la version de test : conteneur `boucan-test` (port 3002) + son propre lien public temporaire |

Cycle : les commits arrivent sur `dev` → on essaie avec **`Tester la version dev.bat`** → une fois validée, `dev` est fusionnée dans `main` → **`Mettre en ligne.bat`**. Chaque push sur `main` ou `dev` lance tests + build sur GitHub Actions (`.github/workflows/ci.yml`).

Les scripts construisent l'image depuis la **branche git** (`git archive`, la plus récente entre ce PC et GitHub), jamais depuis les fichiers du dossier : des modifications en cours, non commitées, ne partent jamais en ligne par accident. L'image porte la branche et le commit (labels `boucan.branch`, `org.opencontainers.image.revision`), affichés en fin de script.

## Mise à jour

### En un clic (Windows, Docker Desktop)

Dans le dossier `Boucan v2` :

- **`Mettre en ligne.bat`** (double-clic) : met en ligne la branche `main`. Le script (`scripts/deploy.ps1`) vérifie que Docker Desktop tourne, prévient et demande confirmation si des joueurs sont connectés, garde la version actuelle sous le nom `boucan:precedente`, construit l'image depuis `main`, remplace le conteneur `boucan-game` (même nom, même port : le tunnel suit sans redémarrer, l'adresse publique ne change pas), puis vérifie la santé du jeu **dans** le conteneur et affiche la version (commit) et l'adresse publique.
- **`Revenir a la version precedente.bat`** : remet l'image gardée (`boucan:precedente`) ; relancé une deuxième fois, il revient à la version d'après.
- Options en ligne de commande : `powershell -File scripts\deploy.ps1 [-Rollback] [-Force]` (`-Force` = sans confirmation).

### Version de test (branche `dev`)

- **`Tester la version dev.bat`** : construit la branche `dev` (image `boucan:test`) et la lance à côté de la production (projet compose `boucan-test`, fichier `docker-compose.test.yml`) : **http://localhost:3002** et un lien public `https://….trycloudflare.com` pour jouer à plusieurs ou sur téléphone. Relancé, il met à jour la version de test ; le lien public reste le même tant que le tunnel de test tourne. Le jeu en ligne n'est jamais touché.
- **`Arreter la version dev.bat`** : arrête la version de test et son tunnel.
- Options : `powershell -File scripts\test-dev.ps1 [-Local] [-Stop] [-Branch <nom>]` (`-Local` = sans lien public ; `-Branch` = essayer une autre branche). Port : `BOUCAN_TEST_PORT` dans `.env` (3002 par défaut).

Si un autre programme de l'ordinateur écoute aussi sur le port 3001 (par exemple un `npm run dev` oublié), le script le signale : `http://localhost:3001` peut alors afficher ce programme au lieu de la version Docker. Le lien public (tunnel Docker) n'est pas concerné. Arrêter ce programme ou lancer le dev sur un autre port (`PORT=3003 BOUCAN_SERVER_PORT=3003 npm run dev`).

### À la main

```bash
git checkout main && git pull
docker compose up -d --build        # ou : npm ci && npm run build && redémarrer le processus
```

Les parties en cours sont perdues au redémarrage ; les joueurs reviennent au menu avec un message. Les bundles JS/CSS ont un nom haché (cache navigateur d'un an) ; `index.html`, le manifest et les assets sont revalidés à chaque chargement.

## Supervision

- `GET /health` : `status`, versions, `uptimeS`, nombre de rooms, joueurs et connexions.
- Logs JSON sur la sortie standard (`LOG_LEVEL=debug` pour le détail des messages).
- Arrêt propre sur `SIGTERM` / `SIGINT`.
