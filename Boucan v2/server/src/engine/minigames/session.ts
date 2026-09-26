import {
  createRng,
  JsonValue,
  PlayerResult as PlayerResultSchema,
  type MiniGameEventMessage,
  type MiniGameSession,
  type MiniGameStateMessage,
  type PlayerResult,
  type TypedPayload,
} from '@boucan/shared';
import type { GameConfig } from '../../config/game-config';
import { fail } from '../errors';
import type { Logger } from '../logger';
import { RateLimiter } from '../util/rate-limiter';
import type { MiniGameContext, MiniGameModule, MiniGameRuntime, Rejection } from './api';
import { effectiveDuration } from './registry';

export interface SessionDeps {
  config: GameConfig;
  logger: Logger;
  isConnected(playerId: string): boolean;
  rttOf(playerId: string): number;
  emitState(message: MiniGameStateMessage): void;
  emitEvent(message: MiniGameEventMessage, to?: string): void;
  /** Something visible in the snapshot changed (ready / finished lists, timing). */
  markDirty(): void;
}

export interface SessionOptions {
  sessionId: string;
  round: number;
  seed: number;
  secretSeed: number;
  participants: readonly string[];
  now: number;
}

const isRejection = (value: unknown): value is Rejection =>
  typeof value === 'object' && value !== null && 'reject' in value;

/**
 * One played minigame: wraps a module with everything generic — readiness,
 * timing, input routing and rate limiting, report bookkeeping, state
 * throttling and crash isolation. A module that throws never breaks the match:
 * the error is logged and the round degrades gracefully (dnf at worst).
 */
export class MiniGameSessionRunner {
  readonly sessionId: string;
  readonly round: number;
  readonly seed: number;
  readonly participants: readonly string[];
  readonly solo: boolean;
  readonly durationMs: number;
  readonly params: JsonValue;

  private readonly ready = new Set<string>();
  private readonly finished = new Set<string>();
  private readonly reported = new Set<string>();
  private readonly limiters = new Map<string, RateLimiter>();
  private runtime: MiniGameRuntime | null = null;
  private crashed = false;
  private readonly logger: Logger;

  private readonly timing: {
    preparingAt: number;
    countdownAt: number | null;
    activeAt: number | null;
    endsAt: number | null;
    endedAt: number | null;
  };

  private state: JsonValue | undefined;
  private stateDirty = false;
  private stateSeq = 0;
  private lastStateAt = Number.NEGATIVE_INFINITY;

  constructor(
    readonly module: MiniGameModule,
    options: SessionOptions,
    private readonly deps: SessionDeps,
  ) {
    this.sessionId = options.sessionId;
    this.round = options.round;
    this.seed = options.seed;
    this.secretSeed = options.secretSeed;
    this.participants = [...options.participants];
    this.solo = this.participants.length === 1;
    this.durationMs = effectiveDuration(module, deps.config.minigames.durationScale);
    this.logger = deps.logger.child({ session: this.sessionId, minigame: module.id });
    this.timing = {
      preparingAt: options.now,
      countdownAt: null,
      activeAt: null,
      endsAt: null,
      endedAt: null,
    };
    this.clock = options.now;
    this.params = this.prepareParams();
  }

  private readonly secretSeed: number;
  /** Time of the call being processed; stamps events emitted by the module. */
  private clock: number;

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  private prepareParams(): JsonValue {
    try {
      const params = this.module.prepare?.({
        seed: this.seed,
        rng: createRng(this.seed),
        participants: this.participants,
        solo: this.solo,
        durationMs: this.durationMs,
      });
      if (params === undefined) return {};
      if (!JsonValue.safeParse(params).success) throw new Error('params are not JSON');
      return params;
    } catch (error) {
      this.logger.error('prepare() failed, using empty params', {}, error);
      return {};
    }
  }

  get activeAt(): number | null {
    return this.timing.activeAt;
  }

  get endedAt(): number | null {
    return this.timing.endedAt;
  }

  get isRunning(): boolean {
    return this.runtime !== null && this.timing.endedAt === null;
  }

  isParticipant(playerId: string): boolean {
    return this.participants.includes(playerId);
  }

  markReady(playerId: string): void {
    if (!this.isParticipant(playerId)) fail('NOT_PARTICIPANT');
    if (this.ready.has(playerId)) return;
    this.ready.add(playerId);
    this.deps.markDirty();
  }

  /** Every connected participant finished loading. */
  allReady(): boolean {
    return this.participants.every((id) => this.ready.has(id) || !this.deps.isConnected(id));
  }

  scheduleCountdown(now: number, countdownMs: number): void {
    this.timing.countdownAt = now;
    this.timing.activeAt = now + countdownMs;
    this.timing.endsAt = this.timing.activeAt + this.durationMs;
    this.deps.markDirty();
  }

  activate(now: number): void {
    this.clock = now;
    const activeAt = this.timing.activeAt ?? now;
    const endsAt = this.timing.endsAt ?? activeAt + this.durationMs;
    const ctx: MiniGameContext = {
      sessionId: this.sessionId,
      seed: this.seed,
      params: this.params,
      participants: this.participants,
      solo: this.solo,
      activeAt,
      endsAt,
      durationMs: this.durationMs,
      secretRng: createRng(this.secretSeed),
      logger: this.logger,
      isConnected: (id) => this.deps.isConnected(id),
      rttOf: (id) => Math.min(this.deps.rttOf(id), this.deps.config.network.maxLagCompensationMs * 2),
      setState: (state) => {
        this.state = state;
        this.stateDirty = true;
      },
      emit: (event: TypedPayload, to?: string) => {
        this.deps.emitEvent({ sessionId: this.sessionId, serverTime: this.clock, event }, to);
      },
      markFinished: (id) => {
        if (this.isParticipant(id) && !this.finished.has(id)) {
          this.finished.add(id);
          this.deps.markDirty();
        }
      },
    };
    try {
      this.runtime = this.module.start(ctx);
    } catch (error) {
      this.logger.error('start() failed, the round will end with no result', {}, error);
      this.crashed = true;
      this.runtime = { results: () => ({}), isComplete: () => true };
    }
    this.logger.debug('minigame active', { participants: this.participants.length });
  }

  tick(now: number): void {
    this.clock = now;
    if (this.runtime?.onTick && !this.crashed) {
      this.guard('onTick', () => this.runtime!.onTick!(now));
    }
    this.flushState(now, false);
  }

  isComplete(now: number): boolean {
    if (this.crashed) return true;
    return this.guard('isComplete', () => this.runtime?.isComplete?.(now) ?? false) ?? true;
  }

  end(now: number): void {
    if (this.timing.endedAt !== null) return;
    this.timing.endedAt = now;
    this.clock = now;
    this.flushState(now, true);
    this.deps.markDirty();
  }

  isSettled(now: number): boolean {
    if (this.crashed) return true;
    return this.guard('isSettled', () => this.runtime?.isSettled?.(now) ?? true) ?? true;
  }

  /** Final raw results; participants without a valid result are dnf. */
  results(now: number): Record<string, PlayerResult> {
    const raw = this.crashed ? {} : (this.guard('results', () => this.runtime?.results(now)) ?? {});
    const out: Record<string, PlayerResult> = {};
    for (const id of this.participants) {
      const result = raw[id];
      out[id] = result && isValidResult(result) ? result : { outcome: 'dnf' };
    }
    return out;
  }

  // ─── Player activity ───────────────────────────────────────────────────────

  handleInput(playerId: string, input: unknown, clientAt: number | undefined, seq: number | undefined, now: number): void {
    const spec = this.module.input;
    if (!spec) fail('INPUT_REJECTED', { reason: 'noInputs' });
    if (!this.isParticipant(playerId)) fail('NOT_PARTICIPANT');
    const runtime = this.runtime;
    const { activeAt, endedAt } = this.timing;
    if (runtime === null || activeAt === null) fail('INVALID_PHASE', { reason: 'notStarted' });
    // Inputs are accepted slightly after the end to compensate for latency.
    const lag = this.deps.config.network.maxLagCompensationMs;
    if (endedAt !== null && now > endedAt + lag) fail('INVALID_PHASE', { reason: 'ended' });
    let limiter = this.limiters.get(playerId);
    if (!limiter) {
      limiter = new RateLimiter(Math.ceil(spec.ratePerSecond), spec.ratePerSecond, now);
      this.limiters.set(playerId, limiter);
    }
    if (!limiter.take(now)) fail('RATE_LIMITED', { reason: 'inputRate' });
    const parsed = spec.schema.safeParse(input);
    if (!parsed.success) fail('INPUT_REJECTED', { reason: 'invalid' });
    const upper = endedAt ?? now;
    const at = Math.max(activeAt, Math.min(upper, Math.max(clientAt ?? now, now - lag), now));
    if (this.crashed || !runtime.onInput) return;
    this.clock = now;
    const verdict = this.guard('onInput', () =>
      runtime.onInput!(playerId, parsed.data, seq === undefined ? { now, at } : { now, at, seq }),
    );
    if (isRejection(verdict)) fail('INPUT_REJECTED', { reason: verdict.reject });
  }

  handleReport(playerId: string, result: PlayerResult, now: number): void {
    if (!this.module.acceptsReports) fail('REPORT_REJECTED', { reason: 'notAccepted' });
    if (!this.isParticipant(playerId)) fail('NOT_PARTICIPANT');
    if (this.runtime === null) fail('INVALID_PHASE', { reason: 'notStarted' });
    if (result.outcome === 'dnf') fail('REPORT_REJECTED', { reason: 'dnfReserved' });
    if (this.reported.has(playerId)) fail('REPORT_REJECTED', { reason: 'duplicate' });
    if (this.crashed || !this.runtime.onReport) fail('REPORT_REJECTED', { reason: 'notAccepted' });
    this.clock = now;
    const runtime = this.runtime;
    const verdict = this.guard('onReport', () => runtime.onReport!(playerId, result, now));
    if (isRejection(verdict)) fail('REPORT_REJECTED', { reason: verdict.reject });
    this.reported.add(playerId);
    this.logger.debug('report accepted', { player: playerId, outcome: result.outcome });
  }

  onPlayerDisconnected(playerId: string, now: number): void {
    if (this.isRunning && this.isParticipant(playerId)) {
      this.guard('onPlayerDisconnected', () => this.runtime!.onPlayerDisconnected?.(playerId, now));
    }
  }

  onPlayerReconnected(playerId: string, now: number): void {
    if (this.isRunning && this.isParticipant(playerId)) {
      this.guard('onPlayerReconnected', () => this.runtime!.onPlayerReconnected?.(playerId, now));
    }
  }

  /** Resends the latest shared state (e.g. to a player who just reconnected). */
  latestState(): MiniGameStateMessage | null {
    if (this.state === undefined || this.stateSeq === 0) return null;
    return { sessionId: this.sessionId, seq: this.stateSeq, serverTime: this.lastStateAt, state: this.state };
  }

  toPublic(): MiniGameSession {
    return {
      sessionId: this.sessionId,
      minigameId: this.module.id,
      round: this.round,
      authority: this.module.authority,
      seed: this.seed,
      params: this.params,
      participants: [...this.participants],
      solo: this.solo,
      readyPlayerIds: this.participants.filter((id) => this.ready.has(id)),
      finishedPlayerIds: this.participants.filter((id) => this.finished.has(id)),
      timing: { ...this.timing, durationMs: this.durationMs },
    };
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private flushState(now: number, force: boolean): void {
    if (!this.stateDirty || this.state === undefined) return;
    const hz = this.module.stateHz ?? this.deps.config.network.defaultStateHz;
    if (!force && now - this.lastStateAt < 1000 / hz) return;
    this.stateDirty = false;
    this.stateSeq += 1;
    this.lastStateAt = now;
    this.deps.emitState({ sessionId: this.sessionId, seq: this.stateSeq, serverTime: now, state: this.state });
  }

  private guard<T>(hook: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (error) {
      this.logger.error(`module ${hook}() threw`, {}, error);
      if (hook !== 'onInput' && hook !== 'onReport') this.crashed = true;
      if (hook === 'onInput' || hook === 'onReport') fail('INTERNAL', { reason: 'moduleError' });
      return undefined;
    }
  }
}

function isValidResult(result: unknown): result is PlayerResult {
  return PlayerResultSchema.safeParse(result).success;
}
