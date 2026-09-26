# ADR-0009 — Moteur sans IO, exécutable dans le navigateur

**Date** : 2026-09-26 · **Statut** : accepté

## Contexte

Astra doit pouvoir développer toute l'interface sans dépendre du serveur. Des mocks écrits à la main dérivent du vrai comportement. Les tests d'un serveur temps réel sont lents et fragiles s'ils dépendent de vrais timers.

## Décision

- `server/src/engine` et `server/src/gateway` n'importent rien de Node et ne lisent jamais l'heure : ils reçoivent `now` et `tick(now)`, émettent vers une interface `EngineOutput`, loguent via une interface injectée.
- Le transport (WebSocket Node) est un adaptateur séparé (`transport/`, export `@boucan/server/node`).
- Le SDK fournit `createLocalServer` / `createLocalGame` : le même Gateway derrière un transport en mémoire, dans la page du navigateur, avec des bots qui jouent par le protocole public.

## Conséquences

- Le « mock » d'Astra est le vrai moteur : impossible qu'il diverge.
- Tests moteur synchrones à horloge simulée : un match complet de 10 manches à 8 joueurs s'exécute en millisecondes, de façon déterministe.
- Contrainte à respecter : aucune API Node dans `engine/` ni `gateway/` (seulement Web Crypto, `setTimeout` pour le timeout de handshake, `queueMicrotask`).
