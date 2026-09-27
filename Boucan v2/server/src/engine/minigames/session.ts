import {
  createRng,
  type JsonValue,
  type MicrogameInfo,
  type MiniGameEventMessage,
  type MiniGameStateMessage,
  type Outcome,
  type PlayerResult,
  type TypedPayload,
} from '@boucan/shared';
import type { GameConfig } from '../../config/game-config';
import { fail } from '../errors';
import type { Logger } from '../logger';
import { RateLimiter } from '../util/rate-limiter';
import type { MiniGameContext, MiniGameModule, MiniGameRuntime, Rejection, RoundOutcome } from './api';

export interface RoundDeps {
  config: GameConfig;
  logger: Logger;
  isConnected(playerId: string): boolean;
  isBot(playerId: string): boolean;
  skillOf(playerId: string): number;
  rttOf(playerId: string): number;
  emitState(message: MiniGameStateMessage): void;
  emitEvent(message: MiniGameEventMessage, to?: string): void;
  /** Something visible in the snapshot changed (live progress). */
  markDirty(): void;
}

export interface RoundOptions {
  roundId: string;
  info: MicrogameInfo;
  seed: number;
  secretSeed: number;
  level: number;
  tempo: number;
  participants: readonly string[];
  activeAt: number;
  durationMs: number;
}

const isRejection = (value: unknown): value is Rejection =>
  typeof value === 'object' && value !== null && 'reject' in value;

/**
 * One played microgame on the server: wraps a module with everything generic
 * — start at activeAt, input routing and rate limiting, one report per player,
 * live progress, throttled shared state, crash isolation. A module that throws
 * never breaks the match: the round degrades to "dnf" for everyone.
 */
export class RoundRunner {
  readonly roundId: string;
  readonly info: MicrogameInfo;
  readonly participants: readonly string[];
  readonly activeAt: number;
  readonly endsAt: number;
  readonly durationMs: number;

  private runtime: MiniGameRuntime | null = null;
  private crashed = false;
  private readonly progress = new Map<string, RoundOutcome>();
  private readonly reported = new Set<string>();
  private readonly limiters = new Map<string, RateLimiter>();
  private readonly logger: Logger;
  private clock: number;
  private state: JsonValue | undefined;
  private stateDirty = false;
  private stateSeq = 0;
  private lastStateAt = Number.NEGATIVE_INFINITY;

  constructor(
    readonly module: MiniGameModule,
    private readonly options: RoundOptions,
    private readonly deps: RoundDeps,
  ) {
    this.roundId = options.roundId;
    this.info = options.info;
    this.participants = [...options.participants];
    this.activeAt = options.activeAt;
    this.durationMs = options.durationMs;
    this.endsAt = options.activeAt + options.durationMs;
    this.clock = options.activeAt;
    this.logger = deps.logger.child({ session: options.roundId, minigame: options.info.id });
  }

  get started(): boolean {
    return this.runtime !== null;
  }

  /** Live outcomes, for the snapshot. */
  progressRecord(): Record<string, Outcome> {
    return Object.fromEntries(this.progress);
  }

  isParticipant(playerId: string): boolean {
    return this.participants.includes(playerId);
  }

  start(now: number): void {
    this.clock = now;
    const ctx: MiniGameContext = {
      roundId: this.roundId,
      info: this.info,
      seed: this.options.seed,
      level: this.options.level,
      tempo: this.options.tempo,
      participants: this.participants,
      activeAt: this.activeAt,
      endsAt: this.endsAt,
      durationMs: this.durationMs,
      rng: createRng(this.options.secretSeed),
      logger: this.logger,
      isConnected: (id) => this.deps.isConnected(id),
      isBot: (id) => this.deps.isBot(id),
      skillOf: (id) => this.deps.skillOf(id),
      rttOf: (id) => Math.min(this.deps.rttOf(id), this.deps.config.network.maxLagCompensationMs * 2),
      setState: (state) => {
        this.state = state;
        this.stateDirty = true;
      },
      emit: (event: TypedPayload, to?: string) =>
        this.deps.emitEvent({ roundId: this.roundId, serverTime: this.clock, event }, to),
      settle: (id, outcome) => {
        if (!this.isParticipant(id) || this.progress.get(id) === outcome) return;
        this.progress.set(id, outcome);
        this.deps.markDirty();
      },
    };
    try {
      this.runtime = this.module.start(ctx);
    } catch (error) {
      this.logger.error('start() failed, the round ends with no result', {}, error);
      this.crashed = true;
      this.runtime = { results: () => ({}), isComplete: () => true };
    }
  }

  tick(now: number): void {
    this.clock = now;
    if (this.runtime?.onTick && !this.crashed) this.guard('onTick', () => this.runtime!.onTick!(now));
    this.flushState(now, false);
  }

  isComplete(now: number): boolean {
    if (this.crashed) return true;
    return this.guard('isComplete', () => this.runtime?.isComplete?.(now) ?? false) ?? true;
  }

  /** Final outcome of every participant (missing → dnf). */
  results(now: number): Record<string, Outcome> {
    this.flushState(now, true);
    const raw = this.crashed ? {} : (this.guard('results', () => this.runtime?.results(now)) ?? {});
    const out: Record<string, Outcome> = {};
    for (const id of this.participants) {
      const r = raw[id];
      out[id] = r === 'success' || r === 'failure' ? r : 'dnf';
    }
    return out;
  }

  handleInput(playerId: string, input: unknown, clientAt: number | undefined, now: number): void {
    const spec = this.module.input;
    if (!spec) fail('INPUT_REJECTED', { reason: 'noInputs' });
    if (!this.isParticipant(playerId)) fail('NOT_PARTICIPANT');
    if (this.runtime === null) fail('INVALID_PHASE', { reason: 'notStarted' });
    let limiter = this.limiters.get(playerId);
    if (!limiter) this.limiters.set(playerId, (limiter = new RateLimiter(Math.ceil(spec.ratePerSecond), spec.ratePerSecond, now)));
    if (!limiter.take(now)) fail('RATE_LIMITED', { reason: 'inputRate' });
    const parsed = spec.schema.safeParse(input);
    if (!parsed.success) fail('INPUT_REJECTED', { reason: 'invalid' });
    if (this.crashed || !this.runtime.onInput) return;
    const lag = this.deps.config.network.maxLagCompensationMs;
    const at = Math.max(this.activeAt, Math.min(now, Math.max(clientAt ?? now, now - lag)));
    this.clock = now;
    const runtime = this.runtime;
    const verdict = this.guard('onInput', () => runtime.onInput!(playerId, parsed.data, { now, at }));
    if (isRejection(verdict)) fail('INPUT_REJECTED', { reason: verdict.reject });
  }

  handleReport(playerId: string, result: PlayerResult, now: number): void {
    if (!this.module.acceptsReports) fail('REPORT_REJECTED', { reason: 'notAccepted' });
    if (!this.isParticipant(playerId)) fail('NOT_PARTICIPANT');
    if (this.runtime === null) fail('INVALID_PHASE', { reason: 'notStarted' });
    if (this.reported.has(playerId)) fail('REPORT_REJECTED', { reason: 'duplicate' });
    if (this.crashed || !this.runtime.onReport) fail('REPORT_REJECTED', { reason: 'notAccepted' });
    this.clock = now;
    const runtime = this.runtime;
    const verdict = this.guard('onReport', () => runtime.onReport!(playerId, result, now));
    if (isRejection(verdict)) fail('REPORT_REJECTED', { reason: verdict.reject });
    this.reported.add(playerId);
  }

  latestState(): MiniGameStateMessage | null {
    if (this.state === undefined || this.stateSeq === 0) return null;
    return { roundId: this.roundId, seq: this.stateSeq, serverTime: this.lastStateAt, state: this.state };
  }

  private flushState(now: number, force: boolean): void {
    if (!this.stateDirty || this.state === undefined) return;
    const hz = this.module.stateHz ?? this.deps.config.network.defaultStateHz;
    if (!force && now - this.lastStateAt < 1000 / hz) return;
    this.stateDirty = false;
    this.stateSeq += 1;
    this.lastStateAt = now;
    this.deps.emitState({ roundId: this.roundId, seq: this.stateSeq, serverTime: now, state: this.state });
  }

  private guard<T>(hook: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (error) {
      this.logger.error(`module ${hook}() threw`, {}, error);
      if (hook === 'onInput' || hook === 'onReport') fail('INTERNAL', { reason: 'moduleError' });
      this.crashed = true;
      return undefined;
    }
  }
}
