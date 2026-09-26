import type { z } from 'zod';
import type {
  Authority,
  JsonValue,
  PlayerResult,
  Rng,
  ScoringSpec,
  TypedPayload,
} from '@boucan/shared';
import type { Logger } from '../logger';

/**
 * Minigame module API — the only thing a minigame implements.
 *
 * A module never touches sockets, rooms, phases, scores or timers. The
 * engine announces it, synchronises its clock, routes validated inputs and
 * reports to it, ticks it, asks it for raw results and turns those into
 * points. Full guide: docs/architecture/MINIGAME_BACKEND.md.
 *
 * Kits in ./kits cover the common cases (local, relay) in a few lines.
 */

/** Given when the minigame is announced (MINIGAME_PREPARING). */
export interface PrepareContext {
  /** Public seed, also sent to clients. */
  readonly seed: number;
  /** PRNG seeded with the public seed: anything derived from it is predictable by clients. */
  readonly rng: Rng;
  readonly participants: readonly string[];
  readonly solo: boolean;
  /** Effective duration of MINIGAME_ACTIVE (already scaled by config). */
  readonly durationMs: number;
}

/** Given when gameplay starts (MINIGAME_ACTIVE). */
export interface MiniGameContext<P = JsonValue> {
  readonly sessionId: string;
  readonly seed: number;
  readonly params: P;
  readonly participants: readonly string[];
  readonly solo: boolean;
  readonly activeAt: number;
  readonly endsAt: number;
  readonly durationMs: number;
  /** Server-only randomness, NOT derivable from the public seed: use it for hidden information. */
  readonly secretRng: Rng;
  readonly logger: Logger;
  isConnected(playerId: string): boolean;
  /** Estimated round-trip time of a player (ms), capped for lag compensation. */
  rttOf(playerId: string): number;
  /** Replaces the shared state. Broadcast to the room at `stateHz` while it changes. */
  setState(state: JsonValue): void;
  /** Sends a semantic event now, to the room or to one player. Never a sound or animation name. */
  emit(event: TypedPayload, to?: string): void;
  /** Declares that a player's result is final (exposed as `finishedPlayerIds`). */
  markFinished(playerId: string): void;
}

export interface InputMeta {
  now: number;
  /**
   * Lag-compensated server time of the input: the client's `at` clamped to
   * [now - maxLagCompensation, now], or `now` when absent.
   */
  at: number;
  seq?: number;
}

/** Return a Rejection to refuse an input or report (the client receives INPUT_REJECTED / REPORT_REJECTED with `reason`). */
export interface Rejection {
  reject: string;
}
export const reject = (reason: string): Rejection => ({ reject: reason });

export interface MiniGameRuntime<I = unknown> {
  onInput?(playerId: string, input: I, meta: InputMeta): Rejection | void;
  /** Only called when the module `acceptsReports`. `result.outcome` is never "dnf" here. */
  onReport?(playerId: string, result: PlayerResult, now: number): Rejection | PlayerResult | void;
  onTick?(now: number): void;
  onPlayerDisconnected?(playerId: string, now: number): void;
  onPlayerReconnected?(playerId: string, now: number): void;
  /** True → MINIGAME_ACTIVE ends before `endsAt` (e.g. everyone finished). */
  isComplete?(now: number): boolean;
  /** During MINIGAME_ENDING: true when nothing more is expected (all reports in). Default true. */
  isSettled?(now: number): boolean;
  /** Raw results. Participants missing from the record are scored "dnf". */
  results(now: number): Record<string, PlayerResult>;
}

export interface MiniGameModule<P = JsonValue, I = unknown> {
  readonly id: string;
  readonly authority: Authority;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** Nominal duration of MINIGAME_ACTIVE (config may scale it). */
  readonly durationMs: number;
  readonly scoring: ScoringSpec;
  /** Relative selection weight (default 1). */
  readonly weight?: number;
  /** Accepted `minigame.input` payloads. Absent = inputs refused. */
  readonly input?: { schema: z.ZodType<I>; ratePerSecond: number };
  /** Does the module accept `minigame.report` (client-computed results)? */
  readonly acceptsReports: boolean;
  /** Shared state broadcast rate (default: config.network.defaultStateHz). */
  readonly stateHz?: number;
  /** Public params announced with the minigame (derive them from ctx.rng). */
  prepare?(ctx: PrepareContext): P;
  start(ctx: MiniGameContext<P>): MiniGameRuntime<I>;
}

/** Type-erasing helper so heterogeneous modules fit in one registry. */
export function defineMiniGame<P extends JsonValue, I>(module: MiniGameModule<P, I>): MiniGameModule {
  return module as unknown as MiniGameModule;
}
