import { defineLocalMiniGame } from '../../kits/local';
import { reject } from '../../api';

/**
 * « Interro surprise » — LOCAL authority (reference implementation).
 *
 * Concept (Notion): reproduce a sequence of symbols. Every client derives the
 * same sequence from the public `seed` (createRng(seed)) and `params`, plays
 * locally and reports { score: correct symbols, errors, timeMs }.
 *
 * Gameplay values are placeholders owned by game design (Astra): change
 * params/scoring on request via docs/handoff/ASTRA_TO_CLAUDE.md.
 */
export interface InterroParams {
  [key: string]: number;
  /** Number of symbols to reproduce. */
  length: number;
  /** Size of the symbol alphabet. */
  symbolCount: number;
}

export const interroSurprise = defineLocalMiniGame<InterroParams>({
  id: 'interro-surprise',
  durationMs: 20_000,
  scoring: {
    strategy: 'placement',
    rankBy: [
      { metric: 'score', order: 'desc' },
      { metric: 'timeMs', order: 'asc' },
    ],
    // A partial answer still ranks (6/7 beats 3/7).
    failures: 'ranked',
  },
  prepare: ({ rng }) => ({ length: rng.int(5, 8), symbolCount: 4 }),
  validateReport(result, ctx) {
    const { length } = ctx.params;
    if (result.score !== undefined && (result.score < 0 || result.score > length)) {
      return reject('scoreOutOfBounds');
    }
    if (result.errors !== undefined && result.errors > length * 4) return reject('errorsOutOfBounds');
    if (result.outcome === 'success' && result.score !== undefined && result.score < length) {
      return reject('inconsistentOutcome');
    }
    return { ...result, normalized: result.normalized ?? (result.score ?? 0) / length };
  },
});
