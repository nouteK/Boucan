# Fixtures (générées)

**Ne pas éditer** : capturées depuis de vrais matchs joués par le moteur (`server/scripts/generate-contract.ts`, `npm run contract:generate`) et validées contre les schémas par les tests. Ids déterministes : un diff = un vrai changement de contrat ou de comportement.

```ts
import { FIXTURES } from '@boucan/shared/fixtures';
FIXTURES.minigameCountdown.snapshot;   // RoomSnapshot
FIXTURES.minigameCountdown.you;        // id du joueur dont c'est la vue
FIXTURES.matchLog.messages;            // [{ t, message }] — un match complet, rejouable
```

Liste et description : [docs/integration/FRONTEND_BACKEND.md](../../docs/integration/FRONTEND_BACKEND.md#3-démarrer-sans-serveur-recommandé-pour-lui). Chaque fichier contient aussi un champ `description`.

Les `characterId` (`fox`, `bull`…) sont de simples exemples : le roster appartient au frontend.
