import { describe, expect, it } from 'vitest';
import type { PlayerResult, ScoringSpec } from '@boucan/shared';
import { DEFAULT_GAME_CONFIG } from '../src/config/game-config';
import { computeStandings, rankResults, scoreRound } from '../src/engine/scoring/scoring';
import { selectMiniGame } from '../src/engine/match/selection';
import { MINIGAME_MODULES } from '../src/engine/minigames/catalog';
import { createRng } from '@boucan/shared';

const cfg = DEFAULT_GAME_CONFIG.scoring;
const byScore: ScoringSpec = { strategy: 'placement', rankBy: [{ metric: 'score', order: 'desc' }] };
const byTime: ScoringSpec = { strategy: 'placement', rankBy: [{ metric: 'timeMs', order: 'asc' }] };

const ids = ['a', 'b', 'c', 'd', 'e'];
const score = (results: Record<string, PlayerResult>, spec: ScoringSpec, participants = Object.keys(results)) =>
  scoreRound(participants, results, spec, cfg).map((e) => [e.playerId, e.rank, e.points]);

describe('ranking', () => {
  it('uses competition ranking for ties (1, 1, 3)', () => {
    expect(
      score(
        {
          a: { outcome: 'success', score: 5 },
          b: { outcome: 'success', score: 9 },
          c: { outcome: 'success', score: 9 },
        },
        byScore,
      ),
    ).toEqual([
      ['b', 1, 10],
      ['c', 1, 10],
      ['a', 3, 5],
    ]);
  });

  it('orders success > failure > dnf, missing metric last', () => {
    const ranked = rankResults(
      [
        { playerId: 'dnf', result: { outcome: 'dnf' } },
        { playerId: 'fail', result: { outcome: 'failure', timeMs: 10 } },
        { playerId: 'slow', result: { outcome: 'success', timeMs: 900 } },
        { playerId: 'none', result: { outcome: 'success' } },
        { playerId: 'fast', result: { outcome: 'success', timeMs: 200 } },
      ],
      byTime,
    );
    expect(ranked.map((r) => [r.playerId, r.rank])).toEqual([
      ['fast', 1],
      ['slow', 2],
      ['none', 3],
      ['fail', 4],
      ['dnf', 5],
    ]);
  });

  it('applies tie-breakers in order', () => {
    const spec: ScoringSpec = {
      strategy: 'placement',
      rankBy: [
        { metric: 'score', order: 'desc' },
        { metric: 'timeMs', order: 'asc' },
      ],
    };
    expect(
      score(
        { a: { outcome: 'success', score: 5, timeMs: 900 }, b: { outcome: 'success', score: 5, timeMs: 400 } },
        spec,
      ),
    ).toEqual([
      ['b', 1, 10],
      ['a', 2, 7],
    ]);
  });

  it('missing participants are dnf with 0 points; failures get failurePoints', () => {
    expect(score({ a: { outcome: 'failure', score: 3 } }, byScore, ['a', 'b'])).toEqual([
      ['a', 1, cfg.failurePoints],
      ['b', 2, 0],
    ]);
  });

  it('failures: "ranked" gives failures placement points after the successes', () => {
    const spec: ScoringSpec = { ...byScore, failures: 'ranked' };
    expect(
      score(
        {
          a: { outcome: 'failure', score: 6 },
          b: { outcome: 'success', score: 7 },
          c: { outcome: 'failure', score: 3 },
          d: { outcome: 'dnf' },
        },
        spec,
      ),
    ).toEqual([
      ['b', 1, 10],
      ['a', 2, 7],
      ['c', 3, 5],
      ['d', 4, 0],
    ]);
  });

  it('placement table repeats its last value beyond 8 ranks', () => {
    const results = Object.fromEntries(ids.map((id, i) => [id, { outcome: 'success', score: 10 - i } as PlayerResult]));
    expect(score(results, byScore).map((r) => r[2])).toEqual([10, 7, 5, 3, 2]);
  });
});

describe('strategies', () => {
  it('threshold: fixed points for success, rank only for display', () => {
    const spec: ScoringSpec = { strategy: 'threshold', rankBy: [{ metric: 'timeMs', order: 'asc' }] };
    expect(
      score(
        {
          a: { outcome: 'success', timeMs: 900 },
          b: { outcome: 'success', timeMs: 100 },
          c: { outcome: 'failure' },
        },
        spec,
      ),
    ).toEqual([
      ['b', 1, cfg.thresholdSuccessPoints],
      ['a', 2, cfg.thresholdSuccessPoints],
      ['c', 3, 0],
    ]);
  });

  it('normalized: points proportional to normalized', () => {
    const spec: ScoringSpec = { strategy: 'normalized', rankBy: [{ metric: 'normalized', order: 'desc' }] };
    expect(
      score({ a: { outcome: 'success', normalized: 0.26 }, b: { outcome: 'success', normalized: 1 } }, spec),
    ).toEqual([
      ['b', 1, 10],
      ['a', 2, 3],
    ]);
  });

  it('solo placement rounds are graded on normalized', () => {
    expect(score({ a: { outcome: 'success', score: 1, normalized: 0.9 } }, byScore)).toEqual([['a', 1, 10]]);
    expect(score({ a: { outcome: 'success', score: 1, normalized: 0.6 } }, byScore)).toEqual([['a', 1, 7]]);
    expect(score({ a: { outcome: 'success', score: 1, normalized: 0.1 } }, byScore)).toEqual([['a', 1, 2]]);
    expect(score({ a: { outcome: 'success', score: 1 } }, byScore)).toEqual([['a', 1, 10]]);
    expect(score({ a: { outcome: 'failure', score: 1 } }, byScore)).toEqual([['a', 1, 0]]);
  });
});

describe('standings', () => {
  it('ranks by score with shared ranks, remembers previous rank and delta', () => {
    const standings = computeStandings(
      [
        { playerId: 'a', score: 10, seat: 0 },
        { playerId: 'b', score: 17, seat: 1 },
        { playerId: 'c', score: 10, seat: 2 },
      ],
      new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]),
      new Map([
        ['a', 0],
        ['b', 10],
        ['c', 5],
      ]),
    );
    expect(standings).toEqual([
      { playerId: 'b', rank: 1, score: 17, previousRank: 2, delta: 10 },
      { playerId: 'a', rank: 2, score: 10, previousRank: 1, delta: 0 },
      { playerId: 'c', rank: 2, score: 10, previousRank: 3, delta: 5 },
    ]);
  });
});

describe('selection', () => {
  it('plays every minigame once before repeating and never twice in a row', () => {
    const rng = createRng(7);
    const history: string[] = [];
    for (let i = 0; i < 12; i++) history.push(selectMiniGame(MINIGAME_MODULES, 4, history, rng).id);
    const n = MINIGAME_MODULES.length;
    expect(new Set(history.slice(0, n)).size).toBe(n);
    history.slice(1).forEach((id, i) => expect(id).not.toBe(history[i]));
  });
});
