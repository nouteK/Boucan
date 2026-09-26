import {
  canTransition,
  createRng,
  MINIGAME_PHASES,
  randomSeed,
  type JsonValue,
  type MatchConfig,
  type MatchPhase,
  type MatchResults,
  type MatchState,
  type MiniGameStateMessage,
  type PlayerResult,
  type RoomEvent,
  type Rng,
  type RoundResults,
  type Standing,
} from '@boucan/shared';
import type { GameConfig } from '../../config/game-config';
import { fail } from '../errors';
import type { Logger } from '../logger';
import type { MiniGameRegistry } from '../minigames/registry';
import { MiniGameSessionRunner } from '../minigames/session';
import type { EngineOutput } from '../output';
import { computeStandings, scoreRound } from '../scoring/scoring';
import { newId } from '../util/ids';
import { selectMiniGame } from './selection';

/** What a match needs from its room. */
export interface MatchHost {
  readonly code: string;
  readonly config: GameConfig;
  readonly registry: MiniGameRegistry;
  readonly logger: Logger;
  readonly output: EngineOutput;
  /** Players who can play (not `left`), in seat order. */
  activePlayerIds(): string[];
  isConnected(playerId: string): boolean;
  seatOf(playerId: string): number;
  rttOf(playerId: string): number;
  markDirty(): void;
  queueEvent(event: RoomEvent): void;
  /** Called after the match state is reset to LOBBY. */
  onReturnToLobby(now: number): void;
}

/**
 * The match state machine (see shared/src/contracts/phases.ts and
 * docs/architecture/GAME_LIFECYCLE.md). Owns rounds, the current minigame
 * session, scores and standings. Every transition goes through `enter()`.
 *
 * Time handling: when a phase ends because its deadline passed, the next
 * phase starts AT the deadline (not at the tick that noticed it), so the
 * timeline announced to clients never drifts with tick jitter.
 */
export class Match {
  private phase: MatchPhase = 'LOBBY';
  private phaseStartedAt: number;
  private phaseEndsAt: number | null = null;
  private phaseEndsExactly = false;
  private matchId: string | null = null;
  private round = 0;
  private totalRounds = 0;
  private pool: readonly string[] | null = null;
  private rng: Rng = createRng(0);
  private history: string[] = [];
  private runner: MiniGameSessionRunner | null = null;
  private lastRound: RoundResults | null = null;
  private rounds: RoundResults[] = [];
  private standings: Standing[] = [];
  private final: MatchResults | null = null;
  private readonly scores = new Map<string, number>();
  private logger: Logger;

  constructor(
    private readonly host: MatchHost,
    now: number,
  ) {
    this.phaseStartedAt = now;
    this.logger = host.logger;
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  get currentPhase(): MatchPhase {
    return this.phase;
  }

  get inProgress(): boolean {
    return this.phase !== 'LOBBY';
  }

  scoreOf(playerId: string): number {
    return this.scores.get(playerId) ?? 0;
  }

  toState(lobbyRounds: number): MatchState {
    const showSession = this.runner !== null && MINIGAME_PHASES.includes(this.phase);
    return {
      matchId: this.matchId,
      phase: this.phase,
      phaseStartedAt: this.phaseStartedAt,
      phaseEndsAt: this.phaseEndsAt,
      phaseEndsExactly: this.phaseEndsExactly,
      round: this.round,
      totalRounds: this.inProgress ? this.totalRounds : lobbyRounds,
      minigame: showSession ? this.runner!.toPublic() : null,
      lastRound: this.lastRound,
      standings: this.standings,
      final: this.final,
    };
  }

  latestMiniGameState(): MiniGameStateMessage | null {
    return this.runner?.isRunning ? this.runner.latestState() : null;
  }

  // ─── Commands (preconditions checked by the room) ──────────────────────────

  start(config: MatchConfig, now: number): void {
    const seed = this.host.config.seed ?? randomSeed();
    this.rng = createRng(seed);
    this.matchId = newId('m');
    this.logger = this.host.logger.child({ match: this.matchId });
    this.totalRounds = config.rounds;
    this.pool = config.minigamePool;
    this.round = 0;
    this.history = [];
    this.runner = null;
    this.lastRound = null;
    this.rounds = [];
    this.final = null;
    this.scores.clear();
    const players = this.host.activePlayerIds();
    for (const id of players) this.scores.set(id, 0);
    this.standings = computeStandings(this.scoreLines(), new Map(), new Map());
    this.logger.info('match started', { players: players.length, rounds: this.totalRounds, seed });
    this.enter('MATCH_STARTING', now, this.host.config.timings.matchStartingMs, true);
  }

  abort(now: number, reason: 'host' | 'noPlayers'): void {
    if (!this.inProgress) return;
    this.logger.info('match aborted', { reason, round: this.round });
    this.host.queueEvent({ kind: 'matchAborted', reason });
    this.returnToLobby(now);
  }

  returnToLobby(now: number): void {
    if (this.phase === 'LOBBY') return;
    this.enter('LOBBY', now, null, false);
    this.matchId = null;
    this.round = 0;
    this.runner = null;
    this.lastRound = null;
    this.rounds = [];
    this.standings = [];
    this.final = null;
    this.scores.clear();
    this.logger = this.host.logger;
    this.host.onReturnToLobby(now);
  }

  // ─── Minigame traffic ──────────────────────────────────────────────────────

  minigameReady(playerId: string, sessionId: string): void {
    const runner = this.requireSession(sessionId);
    if (!['MINIGAME_PREPARING', 'MINIGAME_COUNTDOWN', 'MINIGAME_ACTIVE'].includes(this.phase)) {
      fail('INVALID_PHASE');
    }
    runner.markReady(playerId);
  }

  minigameInput(
    playerId: string,
    sessionId: string,
    input: JsonValue,
    at: number | undefined,
    seq: number | undefined,
    now: number,
  ): void {
    const runner = this.requireSession(sessionId);
    if (this.phase !== 'MINIGAME_ACTIVE' && this.phase !== 'MINIGAME_ENDING') fail('INVALID_PHASE');
    runner.handleInput(playerId, input, at, seq, now);
  }

  minigameReport(playerId: string, sessionId: string, result: PlayerResult, now: number): void {
    const runner = this.requireSession(sessionId);
    if (this.phase !== 'MINIGAME_ACTIVE' && this.phase !== 'MINIGAME_ENDING') fail('INVALID_PHASE');
    runner.handleReport(playerId, result, now);
  }

  onPlayerDisconnected(playerId: string, now: number): void {
    this.runner?.onPlayerDisconnected(playerId, now);
  }

  onPlayerReconnected(playerId: string, now: number): void {
    this.runner?.onPlayerReconnected(playerId, now);
  }

  // ─── Clock ─────────────────────────────────────────────────────────────────

  tick(now: number): void {
    // Several transitions may be due in one tick (zero-length phases).
    for (let i = 0; i < 16 && this.step(now); i++);
  }

  private step(now: number): boolean {
    const t = this.host.config.timings;
    const due = this.phaseEndsAt !== null && now >= this.phaseEndsAt;
    // Deadline-driven transitions start the next phase at the deadline itself.
    const at = due ? this.phaseEndsAt! : now;
    const elapsed = now - this.phaseStartedAt;
    const runner = this.runner;

    switch (this.phase) {
      case 'LOBBY':
        return false;

      case 'MATCH_STARTING':
        if (!due) return false;
        this.prepareNext(at);
        return true;

      case 'MINIGAME_PREPARING':
        if (!due && !(elapsed >= t.preparingMinMs && runner!.allReady())) return false;
        runner!.scheduleCountdown(at, t.countdownMs);
        this.enter('MINIGAME_COUNTDOWN', at, t.countdownMs, true);
        return true;

      case 'MINIGAME_COUNTDOWN':
        if (!due) return false;
        runner!.activate(at);
        this.enter('MINIGAME_ACTIVE', at, runner!.durationMs, false);
        return true;

      case 'MINIGAME_ACTIVE': {
        runner!.tick(now);
        if (!due && !runner!.isComplete(now)) return false;
        runner!.end(at);
        const grace = runner!.module.acceptsReports ? t.reportGraceMs : 0;
        this.enter('MINIGAME_ENDING', at, t.endingMinMs + grace, false);
        return true;
      }

      case 'MINIGAME_ENDING':
        runner!.tick(now);
        if (!due && !(elapsed >= t.endingMinMs && runner!.isSettled(now))) return false;
        this.scoreCurrentRound(at);
        this.enter('MINIGAME_RESULTS', at, t.resultsMs, true);
        return true;

      case 'MINIGAME_RESULTS':
        if (!due) return false;
        if (this.round >= this.totalRounds) this.finish(at);
        else this.enter('INTERMISSION', at, t.intermissionMs, true);
        return true;

      case 'INTERMISSION':
        if (!due) return false;
        this.prepareNext(at);
        return true;

      case 'MATCH_RESULTS':
        if (!due) return false;
        this.returnToLobby(at);
        return true;
    }
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private prepareNext(now: number): void {
    const players = this.host.activePlayerIds();
    if (players.length === 0) {
      this.abort(now, 'noPlayers');
      return;
    }
    this.round += 1;
    const candidates = this.host.registry
      .enabled()
      .filter((m) => this.pool === null || this.pool.includes(m.id));
    const module = selectMiniGame(candidates, players.length, this.history, this.rng);
    this.history.push(module.id);
    const seed = this.rng.seed();
    const secretSeed = this.host.config.seed === null ? randomSeed() : this.rng.seed();
    const sessionId = `${this.matchId}.r${this.round}`;
    this.runner = new MiniGameSessionRunner(
      module,
      { sessionId, round: this.round, seed, secretSeed, participants: players, now },
      {
        config: this.host.config,
        logger: this.logger.child({ round: this.round }),
        isConnected: (id) => this.host.isConnected(id),
        rttOf: (id) => this.host.rttOf(id),
        emitState: (message) => this.host.output.minigameState(this.host.code, message),
        emitEvent: (message, to) => this.host.output.minigameEvent(this.host.code, message, to),
        markDirty: () => this.host.markDirty(),
      },
    );
    this.logger.info('round prepared', {
      round: this.round,
      minigame: module.id,
      session: sessionId,
      participants: players.length,
    });
    this.enter('MINIGAME_PREPARING', now, this.host.config.timings.preparingMaxMs, false);
  }

  private scoreCurrentRound(now: number): void {
    const runner = this.runner!;
    const results = runner.results(now);
    const entries = scoreRound(
      runner.participants,
      results,
      runner.module.scoring,
      this.host.config.scoring,
      (id) => this.host.seatOf(id),
    );
    const previous = new Map(this.standings.map((s) => [s.playerId, s.rank]));
    const deltas = new Map(entries.map((e) => [e.playerId, e.points]));
    for (const entry of entries) {
      this.scores.set(entry.playerId, this.scoreOf(entry.playerId) + entry.points);
    }
    this.standings = computeStandings(this.scoreLines(), previous, deltas);
    this.lastRound = {
      round: this.round,
      sessionId: runner.sessionId,
      minigameId: runner.module.id,
      solo: runner.solo,
      entries,
    };
    this.rounds.push(this.lastRound);
    this.logger.info('round scored', {
      round: this.round,
      minigame: runner.module.id,
      results: entries.map((e) => `${e.playerId}:${e.result.outcome}#${e.rank}+${e.points}`).join(' '),
    });
  }

  private finish(now: number): void {
    const winnerIds = this.standings.filter((s) => s.rank === 1).map((s) => s.playerId);
    this.final = { standings: this.standings, winnerIds, rounds: this.rounds };
    this.runner = null;
    this.logger.info('match finished', { winners: winnerIds.join(','), rounds: this.rounds.length });
    const ms = this.host.config.timings.matchResultsMs;
    this.enter('MATCH_RESULTS', now, ms, ms !== null);
  }

  private scoreLines() {
    return [...this.scores].map(([playerId, score]) => ({
      playerId,
      score,
      seat: this.host.seatOf(playerId),
    }));
  }

  private requireSession(sessionId: string): MiniGameSessionRunner {
    const runner = this.runner;
    if (runner === null || runner.sessionId !== sessionId) fail('STALE_SESSION');
    return runner;
  }

  private enter(phase: MatchPhase, at: number, durationMs: number | null, exact: boolean): void {
    if (!canTransition(this.phase, phase)) {
      throw new Error(`Illegal phase transition ${this.phase} → ${phase}`);
    }
    const previous = this.phase;
    this.phase = phase;
    this.phaseStartedAt = at;
    this.phaseEndsAt = durationMs === null ? null : at + durationMs;
    this.phaseEndsExactly = durationMs !== null && exact;
    this.host.queueEvent({ kind: 'phaseChanged', phase, previousPhase: previous, round: this.round });
    this.host.markDirty();
    this.logger.debug(`phase ${previous} → ${phase}`, { round: this.round });
  }
}
