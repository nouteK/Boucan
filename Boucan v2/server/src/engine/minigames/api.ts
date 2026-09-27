import type { z } from 'zod';
import type { JsonValue, MicrogameInfo, PlayerResult, Rng, TypedPayload } from '@boucan/shared';
import type { Logger } from '../logger';

/**
 * Server side of a microgame.
 *
 * Solo and boss microgames need no code here: the generic local module
 * (kits/local.ts) accepts client reports and simulates bots. Only "duel"
 * microgames — every alive player in one shared arena — are simulated by a
 * server module implementing this API (see modules/).
 *
 * A module never touches sockets, phases, lives or timers: the engine starts
 * it at `activeAt`, routes validated inputs, ticks it, broadcasts its shared
 * state, and asks for the outcome of each participant at the end.
 */

export type RoundOutcome = 'success' | 'failure';

export interface MiniGameContext {
  readonly roundId: string;
  readonly info: MicrogameInfo;
  /** Public seed (also sent to clients). */
  readonly seed: number;
  readonly level: number;
  readonly tempo: number;
  readonly participants: readonly string[];
  readonly activeAt: number;
  readonly endsAt: number;
  readonly durationMs: number;
  /** Server-only randomness, NOT derivable from the public seed. */
  readonly rng: Rng;
  readonly logger: Logger;
  isConnected(playerId: string): boolean;
  isBot(playerId: string): boolean;
  /** Bot skill in [0, 1] (0 for humans). */
  skillOf(playerId: string): number;
  /** Measured round-trip time of a player (ms), capped. */
  rttOf(playerId: string): number;
  /** Replaces the shared state; broadcast at the module's stateHz while it changes. */
  setState(state: JsonValue): void;
  /** Sends a semantic event now (to the room, or one player). */
  emit(event: TypedPayload, to?: string): void;
  /** Declares a participant's outcome as soon as it is known (live progress for every client). */
  settle(playerId: string, outcome: RoundOutcome): void;
}

export interface InputMeta {
  now: number;
  /** Lag-compensated time of the input. */
  at: number;
}

export interface Rejection {
  reject: string;
}
export const reject = (reason: string): Rejection => ({ reject: reason });

export interface MiniGameRuntime<I = unknown> {
  onInput?(playerId: string, input: I, meta: InputMeta): Rejection | void;
  onReport?(playerId: string, result: PlayerResult, now: number): Rejection | void;
  onTick?(now: number): void;
  /** true → the microgame ends before `endsAt`. */
  isComplete?(now: number): boolean;
  /** Final outcome per participant; missing ones are "dnf". */
  results(now: number): Record<string, RoundOutcome>;
}

export interface MiniGameModule<I = unknown> {
  readonly id: string;
  readonly input?: { schema: z.ZodType<I>; ratePerSecond: number };
  readonly acceptsReports: boolean;
  /** Shared state broadcast rate (default config.network.defaultStateHz). */
  readonly stateHz?: number;
  start(ctx: MiniGameContext): MiniGameRuntime<I>;
}

export function defineMiniGame<I>(module: MiniGameModule<I>): MiniGameModule {
  return module as unknown as MiniGameModule;
}
