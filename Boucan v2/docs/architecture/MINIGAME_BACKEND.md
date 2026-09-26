# Micro-jeux côté backend

> Propriétaire : Claude (intégration serveur). Le **game design** des micro-jeux appartient à Astra : règles, contrôles, durée, scoring, difficulté peuvent changer — ce document explique comment ces changements se traduisent côté serveur, sans toucher au cœur.

## Principe

Le moteur ne connaît **aucune règle de micro-jeu**. Il sait seulement :

1. identifier un module (`id`) et lire sa configuration ;
2. l'annoncer (`MINIGAME_PREPARING` : id, seed, params publics, participants) ;
3. synchroniser son horloge (`activeAt`, `endsAt`) ;
4. lui router les entrées (`minigame.input`) et/ou les rapports (`minigame.report`) validés ;
5. diffuser son état partagé (throttlé) et ses événements sémantiques ;
6. le terminer (échéance ou `isComplete`) ;
7. lui demander les résultats bruts ;
8. les convertir en points (`scoring`) ;
9. enchaîner.

Tout le reste est dans le module : `server/src/engine/minigames/modules/<id>/index.ts`.

## Choisir l'autorité

| Autorité | Le client… | Le serveur… | Quand | Exemple |
| --- | --- | --- | --- | --- |
| `local` | simule tout à partir de `seed`/`params`, envoie **un rapport** final | synchronise début/fin, vérifie la plausibilité du rapport | le jeu se joue seul, l'enjeu de triche est faible, l'interaction est riche (drag, dessin, séquence) | `interro-surprise`, `fausse-couleur` |
| `relay` | simule son propre personnage, **diffuse** sa progression | valide (monotonie, vitesse max), relaie l'état de tous (~10 Hz), horodate les arrivées | on doit **voir les autres** jouer, ou départager l'ordre d'arrivée équitablement | `course-couloir` |
| `server` | envoie des **intentions** (appui, choix) | simule/juge la partie décisive, émet les événements | information secrète, timing compétitif, ressource partagée (le premier qui…) | `sonnerie` |

Règles d'or :
- Tout ce qui se reproduit localement depuis une **seed**, un **état initial** ou un **timestamp** ne transite pas sur le réseau.
- L'information **secrète** (moment de la vraie sonnerie…) vient de `ctx.secretRng`, jamais de la seed publique.
- Le serveur n'envoie jamais de ressource de présentation : `{ type: "bellRang", kind: "fake" }`, pas `"bell_fake.mp3"`.

## L'API d'un module

Référence : [`server/src/engine/minigames/api.ts`](../../server/src/engine/minigames/api.ts).

```ts
interface MiniGameModule<P, I> {
  id: string;                         // slug, ex. "course-couloir" — clé partagée avec le frontend
  authority: 'local' | 'relay' | 'server';
  minPlayers: number; maxPlayers: number;
  durationMs: number;                 // durée nominale de MINIGAME_ACTIVE
  scoring: ScoringSpec;               // comment classer / convertir en points
  weight?: number;                    // poids de sélection (1)
  input?: { schema: ZodType<I>; ratePerSecond: number };  // entrées acceptées
  acceptsReports: boolean;            // rapports clients acceptés ?
  stateHz?: number;                   // fréquence de diffusion de l'état partagé
  prepare?(ctx): P;                   // params PUBLICS annoncés (dérivés de ctx.rng = seed publique)
  start(ctx): MiniGameRuntime<I>;     // appelé à activeAt
}

interface MiniGameRuntime<I> {
  onInput?(playerId, input: I, meta: { now, at, seq? }): Rejection | void;
  onReport?(playerId, result: PlayerResult, now): Rejection | PlayerResult | void;
  onTick?(now): void;                 // toutes les 50 ms pendant ACTIVE/ENDING
  onPlayerDisconnected?(playerId, now): void;
  onPlayerReconnected?(playerId, now): void;
  isComplete?(now): boolean;          // true → fin anticipée
  isSettled?(now): boolean;           // pendant ENDING : plus rien à attendre
  results(now): Record<playerId, PlayerResult>;   // absents ⇒ dnf
}
```

Le `ctx` de `start` fournit : `sessionId`, `seed`, `params`, `participants`, `solo`, `activeAt`, `endsAt`, `durationMs` (déjà mis à l'échelle), `secretRng`, `logger`, `isConnected(id)`, `rttOf(id)`, `setState(json)`, `emit(event, to?)`, `markFinished(id)`.

Garanties fournies par le moteur (le module n'a pas à s'en soucier) : phase et session vérifiées, participant vérifié, rate-limit par joueur, payload validé par `input.schema`, `at` borné, rapport unique et jamais `dnf`, diffusion de l'état seulement si modifié et au plus `stateHz`, exceptions du module capturées (entrée → `INTERNAL` ; `start`/`onTick`/`results` → manche en dnf, le match continue).

## Ajouter un micro-jeu

### Cas local (le plus fréquent) — ~15 lignes

```ts
// server/src/engine/minigames/modules/cantine-express/index.ts
import { defineLocalMiniGame } from '../../kits/local';
import { reject } from '../../api';

export const cantineExpress = defineLocalMiniGame<{ [k: string]: number; trays: number }>({
  id: 'cantine-express',
  durationMs: 12_000,
  scoring: { strategy: 'placement', rankBy: [{ metric: 'score', order: 'desc' }, { metric: 'timeMs', order: 'asc' }] },
  prepare: ({ rng }) => ({ trays: rng.int(6, 9) }),
  validateReport: (result, ctx) =>
    result.score !== undefined && result.score > ctx.params.trays ? reject('scoreOutOfBounds') : result,
});
```

Puis une ligne dans [`catalog.ts`](../../server/src/engine/minigames/catalog.ts) (+ un `bot.ts` optionnel pour les tests / le mode local). Rien d'autre à modifier : le jeu est sélectionnable, annoncé dans `ServerInfo.minigames`, testé par les tests de match complets.

### Cas relay / server

Voir `modules/course-couloir` (relay) et `modules/sonnerie` (server) : ce sont les implémentations de référence, commentées.

## Retirer / désactiver

- Temporairement : `BOUCAN_MINIGAMES=a,b` (env) ou `minigames.enabled` (config).
- Définitivement : supprimer sa ligne du catalogue (et le dossier). Les rooms dont le pool du host contient un id inconnu reçoivent `CONFIG_INVALID` à la configuration ; aucune partie en cours n'est cassée au redémarrage (état en mémoire).

## Scoring d'un micro-jeu

```ts
scoring: {
  strategy: 'placement' | 'threshold' | 'normalized',
  rankBy: [{ metric: 'score'|'timeMs'|'accuracy'|'errors'|'normalized'|'rank', order: 'asc'|'desc' }, …],
  failures?: 'zero' | 'ranked',
}
```

- Le module choisit **quoi mesurer** (`PlayerResult`: réussite/échec, points, temps, précision, erreurs, rang imposé, valeur normalisée 0–1, `stats` libres pour l'écran de résultats).
- Le moteur choisit **combien ça rapporte** (tables globales de `game-config.ts`), ce qui garde les manches comparables entre elles.
- Fournir `normalized` (0–1) quand c'est possible : il sert au barème des manches solo.

## Micro-jeux actuels (implémentations de référence)

Concepts issus de Notion, **placeholders techniques** : Astra est libre de les redéfinir entièrement ; les valeurs (durées, tailles, vitesses) sont à ajuster sur demande.

| id | Autorité | Durée | Entrées / rapport | Événements / état | Scoring |
| --- | --- | --- | --- | --- | --- |
| `sonnerie` | server | 7 s | input `{ type: "press" }` (5/s) | `bellRang {kind: fake\|real}`, `playerPressed {playerId, verdict: early\|onTime, reactionMs?}` | placement, `timeMs` asc ; faux départ = échec (0) |
| `interro-surprise` | local | 20 s | rapport `{ outcome, score, errors, timeMs }` ; params `{ length, symbolCount }` → séquence via `createRng(seed)` | — | placement, `score` desc puis `timeMs` asc ; échecs classés |
| `course-couloir` | relay | 20 s | input `{ type: "progress", distance }` (15/s) ; params `{ length, maxSpeed, obstacles }` (`maxSpeed` dérivé de la durée : une course parfaite prend 40 % du temps) | état `{ runners: { [id]: { distance, finished } } }` 10 Hz ; `runnerFinished {playerId, place, timeMs}` | placement, `timeMs` asc puis distance ; non-arrivés classés |
| `fausse-couleur` | local | 8 s | rapport `{ outcome, timeMs }` ; params `{ choices }` | — | threshold (6 pts la réussite), `timeMs` pour l'ordre d'affichage |

## Déterminisme

`createRng(seed)` (mulberry32) est **partagé** (`@boucan/shared`) : le même `seed` donne la même suite partout. Ses sorties sont figées par un test : les changer est un changement de protocole. Utilisation typique côté client :

```ts
const rng = createRng(session.seed);
const sequence = Array.from({ length: params.length }, () => rng.int(0, params.symbolCount - 1));
```

Ne l'utiliser que lorsque cela simplifie réellement (niveaux, séquences, positions d'obstacles) ; ne pas forcer.

## Demander un changement

Astra décrit le besoin (règle, entrée, événement, état partagé, scoring) dans [`docs/handoff/ASTRA_TO_CLAUDE.md`](../handoff/ASTRA_TO_CLAUDE.md) ; Claude adapte le module (et le contrat si nécessaire) et documente dans [`CLAUDE_TO_ASTRA.md`](../handoff/CLAUDE_TO_ASTRA.md). Un changement limité à un module (params, durée, entrées, événements) **ne change pas** la version du protocole : le format des entrées/états d'un module est documenté par module.
