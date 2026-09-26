import type { Rng } from '@boucan/shared';
import type { MiniGameModule } from '../minigames/api';

/**
 * Picks the next minigame of a match.
 *
 * - only modules allowed by the pool and fitting the participant count;
 * - no repeat until every candidate has been played once ("shuffle bag");
 * - never the same minigame twice in a row when another one is possible;
 * - weighted random among what is left.
 *
 * If no module fits the player count (players left mid-match), the player
 * range is ignored rather than stopping the match.
 */
export function selectMiniGame(
  modules: readonly MiniGameModule[],
  playerCount: number,
  history: readonly string[],
  rng: Rng,
): MiniGameModule {
  if (modules.length === 0) throw new Error('selectMiniGame: no module');
  const fitting = modules.filter((m) => playerCount >= m.minPlayers && playerCount <= m.maxPlayers);
  const candidates = fitting.length > 0 ? fitting : modules;

  const last = history[history.length - 1];
  const notLast = candidates.filter((m) => m.id !== last);
  const pool = notLast.length > 0 ? notLast : candidates;

  // Played count per id; prefer the least played ones.
  const played = new Map<string, number>();
  for (const id of history) played.set(id, (played.get(id) ?? 0) + 1);
  const minPlayed = Math.min(...pool.map((m) => played.get(m.id) ?? 0));
  const fresh = pool.filter((m) => (played.get(m.id) ?? 0) === minPlayed);

  return weightedPick(fresh, rng);
}

function weightedPick(modules: readonly MiniGameModule[], rng: Rng): MiniGameModule {
  const total = modules.reduce((sum, m) => sum + Math.max(0, m.weight ?? 1), 0);
  if (total <= 0) return rng.pick(modules);
  let roll = rng.next() * total;
  for (const m of modules) {
    roll -= Math.max(0, m.weight ?? 1);
    if (roll < 0) return m;
  }
  return modules[modules.length - 1]!;
}

/** True when at least one module can be played by `playerCount` players. */
export function hasEligible(modules: readonly MiniGameModule[], playerCount: number): boolean {
  return modules.some((m) => playerCount >= m.minPlayers && playerCount <= m.maxPlayers);
}
