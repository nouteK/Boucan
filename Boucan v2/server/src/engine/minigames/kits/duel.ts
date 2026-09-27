import { z } from 'zod';
import type { Rng } from '@boucan/shared';

/**
 * Small shared pieces of the duel modules (team games, left / right mashing,
 * one special player against the others).
 */

/** A left (−1) / right (+1) press. */
export const Side = z.union([z.literal(-1), z.literal(1)]);
export type Side = z.infer<typeof Side>;

/** Two teams, as even as possible, drawn at random. */
export function twoTeams(ids: readonly string[], rng: Rng): [string[], string[]] {
  const shuffled = rng.shuffle(ids);
  return [shuffled.filter((_, i) => i % 2 === 0), shuffled.filter((_, i) => i % 2 === 1)];
}

/** Left / right alternation per player: only a press on the other side counts. */
export class Alternation {
  private readonly last = new Map<string, Side>();

  accept(playerId: string, side: Side): boolean {
    if (this.last.get(playerId) === side) return false;
    this.last.set(playerId, side);
    return true;
  }

  /** Side a bot should press next. */
  next(playerId: string): Side {
    return this.last.get(playerId) === -1 ? 1 : -1;
  }
}

/** Repeating bot action: `due(now)` is true (and re-arms) every `interval()` ms. */
export class BotClock {
  private at: number;

  constructor(
    start: number,
    private readonly interval: () => number,
  ) {
    this.at = start;
  }

  due(now: number): boolean {
    if (now < this.at) return false;
    // Never catch up with a burst after a long pause (tick hiccup, bot held back).
    this.at = Math.max(this.at, now - 50) + this.interval();
    return true;
  }

  delay(until: number): void {
    this.at = Math.max(this.at, until);
  }
}
