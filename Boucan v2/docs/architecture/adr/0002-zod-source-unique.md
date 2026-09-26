# ADR-0002 — Schémas Zod = source unique de vérité

**Date** : 2026-09-26 · **Statut** : accepté

## Contexte

Deux chantiers parallèles consomment les mêmes données. Des définitions dupliquées (types TS d'un côté, validation de l'autre, doc à part) divergent inévitablement.

## Décision

- Les schémas Zod de `shared/src/contracts/` sont **la** définition. Les types TypeScript en sont inférés (`z.infer`), le serveur valide avec eux, le SDK valide les messages entrants avec eux en dev.
- Dérivés **générés**, jamais édités à la main : JSON Schema (`shared/schemas/`, pour tout consommateur non-TS) et fixtures (`shared/fixtures/`, capturées depuis de vrais matchs du moteur). `npm run contract:check` échoue si les dérivés ne correspondent plus.
- Génération déterministe (PRNG fixe pour les ids) : un diff de fixtures = un vrai changement de contrat ou de comportement.

## Conséquences

- Une modification de contrat se fait à un seul endroit ; le compilateur signale tous les usages impactés.
- La doc humaine (`NETWORK_PROTOCOL.md`) résume ; en cas de doute, les schémas font foi.
- Pas d'étape de build des types : les packages sont consommés en TypeScript source (Vite/tsx/esbuild).
