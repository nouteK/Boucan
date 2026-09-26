import { defineLocalMiniGame } from '../../kits/local';

/**
 * « Fausse couleur » — LOCAL authority, THRESHOLD scoring (reference implementation).
 *
 * Concept (Notion, art class): spot the wrong colour. Pass/fail: every
 * success earns the same points; `timeMs` only orders the results screen.
 * The whole minigame fits in these lines: that is the point of the local kit.
 */
export const fausseCouleur = defineLocalMiniGame<{ [key: string]: number; choices: number }>({
  id: 'fausse-couleur',
  durationMs: 8_000,
  scoring: { strategy: 'threshold', rankBy: [{ metric: 'timeMs', order: 'asc' }] },
  prepare: ({ rng }) => ({ choices: rng.int(4, 6) }),
});
