# JSON Schemas (générés)

**Ne pas éditer** : générés depuis les schémas Zod de `shared/src/contracts/` par `npm run contract:generate` ; `npm run contract:check` échoue s'ils ne sont plus à jour.

- `model/*.schema.json` — entités (`RoomSnapshot`, `Player`, `MatchState`, `MiniGameSession`, `PlayerResult`…).
- `messages/ClientEnvelope.schema.json`, `messages/ServerMessage.schema.json` — enveloppes.
- `messages/client/<type>.payload.schema.json` / `.reply.schema.json` — chaque message client et sa réponse.

Utiles pour un client non-TypeScript, un validateur externe ou de la génération de code. En TypeScript, importer directement `@boucan/shared`.
