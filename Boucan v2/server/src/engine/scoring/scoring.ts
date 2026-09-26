import type {
  Metric,
  PlayerResult,
  RankingKey,
  RoundEntry,
  ScoringSpec,
  Standing,
} from '@boucan/shared';
import type { GameConfig } from '../../config/game-config';

/**
 * Scoring is independent from minigames. A module reports raw PlayerResults
 * and declares a ScoringSpec; this file ranks the results and converts ranks
 * into match points with the configured strategy (docs/architecture/adr/0005-scoring.md).
 *
 * Ranking: success before failure before dnf; inside a group, by the spec's
 * keys in order (a missing metric ranks after a present one). Standard
 * competition ranking: equal results share the best rank (1, 1, 3).
 */

type ScoringConfig = GameConfig['scoring'];

const OUTCOME_ORDER = { success: 0, failure: 1, dnf: 2 } as const;

function metricOf(result: PlayerResult, metric: Metric): number | undefined {
  const value = result[metric];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function compareKey(a: PlayerResult, b: PlayerResult, key: RankingKey): number {
  const va = metricOf(a, key.metric);
  const vb = metricOf(b, key.metric);
  if (va === undefined && vb === undefined) return 0;
  if (va === undefined) return 1;
  if (vb === undefined) return -1;
  return key.order === 'asc' ? va - vb : vb - va;
}

/** Negative when `a` ranks before `b`, 0 when tied. */
export function compareResults(a: PlayerResult, b: PlayerResult, spec: ScoringSpec): number {
  const byOutcome = OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome];
  if (byOutcome !== 0) return byOutcome;
  if (a.outcome === 'dnf') return 0;
  for (const key of spec.rankBy) {
    const c = compareKey(a, b, key);
    if (c !== 0) return c;
  }
  return 0;
}

export interface RankedResult {
  playerId: string;
  result: PlayerResult;
  rank: number;
}

/**
 * Ranks results best first. `order` (e.g. seats) only decides the display
 * order of tied players; they keep the same rank.
 */
export function rankResults(
  results: ReadonlyArray<{ playerId: string; result: PlayerResult }>,
  spec: ScoringSpec,
  order: (playerId: string) => number = () => 0,
): RankedResult[] {
  const sorted = [...results].sort(
    (a, b) => compareResults(a.result, b.result, spec) || order(a.playerId) - order(b.playerId),
  );
  const ranked: RankedResult[] = [];
  sorted.forEach((entry, i) => {
    const prev = ranked[i - 1];
    const tied = prev !== undefined && compareResults(prev.result, entry.result, spec) === 0;
    ranked.push({ ...entry, rank: tied ? prev.rank : i + 1 });
  });
  return ranked;
}

export function placementPoints(rank: number, config: ScoringConfig): number {
  const table = config.placementPoints;
  return table[Math.min(rank, table.length) - 1] ?? 0;
}

function soloPoints(result: PlayerResult, config: ScoringConfig): number {
  if (result.normalized === undefined) {
    return result.outcome === 'success' ? placementPoints(1, config) : config.soloGrades.at(-1)!.points;
  }
  const grade = config.soloGrades.find((g) => result.normalized! >= g.min);
  return grade?.points ?? 0;
}

/** Match points earned by one ranked result. */
export function pointsFor(
  entry: RankedResult,
  spec: ScoringSpec,
  solo: boolean,
  config: ScoringConfig,
): number {
  const { result } = entry;
  if (result.outcome === 'dnf') return 0;
  const counts = result.outcome === 'success' || spec.failures === 'ranked';
  switch (spec.strategy) {
    case 'placement':
      if (!counts) return config.failurePoints;
      return solo ? soloPoints(result, config) : placementPoints(entry.rank, config);
    case 'threshold':
      return result.outcome === 'success' ? config.thresholdSuccessPoints : config.failurePoints;
    case 'normalized':
      if (!counts) return config.failurePoints;
      return Math.round((result.normalized ?? 0) * config.normalizedMaxPoints);
  }
}

/** Ranks and scores a whole round. `participants` missing from `results` are dnf. */
export function scoreRound(
  participants: readonly string[],
  results: Readonly<Record<string, PlayerResult>>,
  spec: ScoringSpec,
  config: ScoringConfig,
  order?: (playerId: string) => number,
): RoundEntry[] {
  const solo = participants.length === 1;
  const entries = participants.map((playerId) => ({
    playerId,
    result: results[playerId] ?? ({ outcome: 'dnf' } as PlayerResult),
  }));
  return rankResults(entries, spec, order).map((ranked) => ({
    playerId: ranked.playerId,
    result: ranked.result,
    rank: ranked.rank,
    points: Math.max(0, Math.round(pointsFor(ranked, spec, solo, config))),
  }));
}

export interface ScoreLine {
  playerId: string;
  score: number;
  /** Display tie-breaker only (ranks stay shared). */
  seat: number;
}

/** Match leaderboard. `previous` = ranks before the round, `deltas` = points of the round. */
export function computeStandings(
  lines: readonly ScoreLine[],
  previous: ReadonlyMap<string, number>,
  deltas: ReadonlyMap<string, number>,
): Standing[] {
  const sorted = [...lines].sort((a, b) => b.score - a.score || a.seat - b.seat);
  const standings: Standing[] = [];
  sorted.forEach((line, i) => {
    const prev = standings[i - 1];
    const rank = prev !== undefined && prev.score === line.score ? prev.rank : i + 1;
    standings.push({
      playerId: line.playerId,
      rank,
      score: line.score,
      previousRank: previous.get(line.playerId) ?? null,
      delta: deltas.get(line.playerId) ?? 0,
    });
  });
  return standings;
}
