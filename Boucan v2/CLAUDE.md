# BOUCAN V2 — notes pour les sessions Claude

Projet à deux chantiers : **Claude = moteur** (`shared/`, `server/`, `sdk/`, `docs/architecture/`, `docs/integration/`, `docs/handoff/CLAUDE_TO_ASTRA.md`, `CHANGELOG.md`), **Astra-6 = expérience** (`client/`, `assets/`, `audio/`, `docs/design/`, `docs/gameplay/`, `docs/handoff/ASTRA_TO_CLAUDE.md`). Ne jamais modifier le périmètre d'Astra ; ne jamais prendre de décision artistique ou de game design (« qu'est-ce qui est amusant ? » = Astra ; « comment le synchroniser ? » = Claude).

## Commandes

- `npm test` — tous les tests (moteur à horloge simulée + e2e WebSocket, ~20 s)
- `npm run typecheck` · `npm run build` · `npm run dev` (port 3001)
- `npm run contract:generate` après toute modification de `shared/src/contracts` ou du comportement du moteur ; `npm run contract:check` doit passer
- `npm run check:integration` contre un serveur lancé (`BOUCAN_TIME_SCALE=0.2` conseillé)

## Règles

- Source de vérité du contrat : `shared/src/contracts/*.ts` (Zod). Changement cassant ⇒ `PROTOCOL_VERSION`+1 ; compatible ⇒ `CONTRACT_REVISION` mineur. Toujours : régénérer, `CLAUDE_TO_ASTRA.md`, `CHANGELOG.md`.
- `server/src/engine` et `server/src/gateway` : aucune API Node, jamais `Date.now()` (le temps est passé en paramètre) — ils tournent aussi dans le navigateur (`@boucan/sdk/local`).
- Micro-jeu = `server/src/engine/minigames/modules/<id>/` + une ligne dans `catalog.ts`. Aucune règle de micro-jeu dans le cœur.
- Valeurs réglables : `server/src/config/game-config.ts` (serveur) ou `shared/src/contracts/rules.ts` (communes). Pas de constantes magiques.
- Relire `docs/handoff/ASTRA_TO_CLAUDE.md` en début de session : c'est là qu'arrivent les demandes.
- Ne jamais tuer tous les processus `node` pour arrêter un serveur de test : arrêter le PID qui écoute sur le port utilisé.
