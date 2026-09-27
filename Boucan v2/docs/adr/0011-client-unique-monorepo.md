# ADR-0011 — Un seul client, dans le monorepo

**Date** : 2026-09-27 · **Statut** : accepté · **Remplace en partie** : [0002](0002-zod-source-unique.md) (dérivés générés)

## Contexte

La V2 prévoyait deux chantiers séparés (moteur d'un côté, frontend dans un dossier voisin) reliés par un contrat publié : JSON Schema et fixtures générés, boîtes aux lettres de passation, dépendances `file:`. Le frontend est désormais développé dans ce dépôt (`client/`), par la même équipe, avec le même TypeScript.

## Décision

- Le client est un workspace (`@boucan/client`) qui importe directement `@boucan/shared` et `@boucan/sdk`.
- Les schémas Zod restent la source unique (ADR-0002) ; les dérivés générés (`shared/schemas`, `shared/fixtures`, `contract:generate` / `contract:check`) sont supprimés : le compilateur et les tests couvrent la cohérence client ↔ serveur.
- Garde-fous : validation Zod des messages entrants par le SDK en développement, test de couverture catalogue ↔ micro-jeux client, `npm run check:integration` contre un serveur réel.

## Conséquences

- Un changement de contrat casse la compilation du client au même commit : pas de dérive silencieuse.
- Un futur client non-TypeScript devrait régénérer un JSON Schema depuis Zod (`z.toJSONSchema`) : à rajouter à ce moment-là.
