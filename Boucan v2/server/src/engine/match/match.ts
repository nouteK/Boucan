import {
  canTransition,
  createRng,
  GAME_RULES,
  randomSeed,
  ZONES,
  type FinalRanking,
  type JsonValue,
  type MatchConfig,
  type MatchPhase,
  type MatchState,
  type MicrogameKind,
  type MiniGameStateMessage,
  type PlayerResult,
  type RankingEntry,
  type RoomEvent,
  type Rng,
  type Round,
  type Verdict,
  type ZoneId,
} from '@boucan/shared';
import type { GameConfig } from '../../config/game-config';
import { fail } from '../errors';
import type { Logger } from '../logger';
import type { MiniGameRegistry } from '../minigames/registry';
import { RoundRunner } from '../minigames/session';
import type { EngineOutput } from '../output';
import { newId } from '../util/ids';
import { pickMicrogame, roundZone } from './selection';

/** What a match needs from its room. */
export interface MatchHost {
  readonly code: string;
  readonly config: GameConfig;
  readonly registry: MiniGameRegistry;
  readonly logger: Logger;
  readonly output: EngineOutput;
  /** Players still seated (not `left`), in seat order. */
  seatedIds(): string[];
  isConnected(playerId: string): boolean;
  isBot(playerId: string): boolean;
  skillOf(playerId: string): number;
  seatOf(playerId: string): number;
  rttOf(playerId: string): number;
  markDirty(): void;
  queueEvent(event: RoomEvent): void;
  onReturnToLobby(now: number): void;
}

interface PlayerState {
  lives: number;
  wins: number;
  alive: boolean;
  eliminatedAt: number | null;
}

interface CurrentRound {
  runner: RoundRunner;
  public: Omit<Round, 'progress'>;
}

/**
 * The WarioWare match state machine (see shared/src/contracts/phases.ts).
 *
 * A level = `gamesPerLevel` microgames (a duel every `duelEvery`, when ≥ 2
 * players are alive), then a boss when the catalog has one. Speed-ups every
 * `speedUpEvery` games; at the end of a level the level rises (harder
 * microgames) and the tempo restarts a bit higher. Fail = −1 life; boss won =
 * +1 life. 0 lives = eliminated (the player keeps playing as a ghost, for
 * fun). The stage ends when one player is left (multiplayer), when the solo
 * player is out, or after the last level.
 *
 * Deadline-driven transitions start the next phase at the deadline itself, so
 * the timeline announced to clients never drifts with the tick.
 */
export class Match {
  private phase: MatchPhase = 'LOBBY';
  private phaseStartedAt: number;
  private phaseEndsAt: number | null = null;
  private matchId: string | null = null;
  private rng: Rng = createRng(0);
  private stageZone: ZoneId | 'mix' = 'ville';
  private zone: ZoneId = 'ville';
  private level = 1;
  private levels = 1;
  private tempo = 1;
  private counter = 0;
  private gamesInLevel = 0;
  private pendingLevelUp = false;
  private multiplayer = false;
  private ended = false;
  private history: string[] = [];
  private current: CurrentRound | null = null;
  private verdict: Verdict | null = null;
  private final: FinalRanking | null = null;
  private readonly players = new Map<string, PlayerState>();
  private logger: Logger;

  constructor(
    private readonly host: MatchHost,
    now: number,
  ) {
    this.phaseStartedAt = now;
    this.logger = host.logger;
  }

  get currentPhase(): MatchPhase {
    return this.phase;
  }

  get inProgress(): boolean {
    return this.phase !== 'LOBBY';
  }

  stateOf(playerId: string): PlayerState | undefined {
    return this.players.get(playerId);
  }

  toState(config: MatchConfig): MatchState {
    const c = this.current;
    const showRound = c !== null && (this.phase === 'INTERLUDE' || this.phase === 'MICROGAME' || this.phase === 'VERDICT');
    return {
      matchId: this.matchId,
      phase: this.phase,
      phaseStartedAt: this.phaseStartedAt,
      phaseEndsAt: this.phaseEndsAt,
      zone: this.inProgress ? this.zone : config.zone === 'mix' ? 'ville' : config.zone,
      level: this.level,
      levels: this.inProgress ? this.levels : GAME_RULES.lengthOptions[config.length],
      tempo: this.tempo,
      counter: this.counter,
      round: showRound ? { ...c.public, progress: c.runner.progressRecord() } : null,
      verdict: this.phase === 'VERDICT' || this.phase === 'INTERLUDE' ? this.verdict : null,
      final: this.final,
    };
  }

  latestMiniGameState(): MiniGameStateMessage | null {
    return this.phase === 'MICROGAME' ? (this.current?.runner.latestState() ?? null) : null;
  }

  // ─── Commands ──────────────────────────────────────────────────────────────

  start(config: MatchConfig, now: number): void {
    const seed = this.host.config.seed ?? randomSeed();
    this.rng = createRng(seed);
    this.matchId = newId('m');
    this.logger = this.host.logger.child({ match: this.matchId });
    this.stageZone = config.zone;
    this.zone = config.zone === 'mix' ? this.rng.pick(ZONES) : config.zone;
    this.levels = GAME_RULES.lengthOptions[config.length];
    this.level = 1;
    this.tempo = 1;
    this.counter = 0;
    this.gamesInLevel = 0;
    this.pendingLevelUp = false;
    this.ended = false;
    this.history = [];
    this.current = null;
    this.verdict = null;
    this.final = null;
    this.players.clear();
    const seated = this.host.seatedIds();
    for (const id of seated) this.players.set(id, { lives: config.lives, wins: 0, alive: true, eliminatedAt: null });
    this.multiplayer = seated.length >= 2;
    this.logger.info('match started', { players: seated.length, zone: config.zone, lives: config.lives, levels: this.levels, seed });
    this.enter('STAGE_INTRO', now, this.scaled(this.host.config.timings.stageIntroMs));
  }

  abort(now: number, reason: 'host' | 'noPlayers'): void {
    if (!this.inProgress) return;
    this.logger.info('match aborted', { reason, counter: this.counter });
    this.host.queueEvent({ kind: 'matchAborted', reason });
    this.returnToLobby(now);
  }

  returnToLobby(now: number): void {
    if (this.phase === 'LOBBY') return;
    this.enter('LOBBY', now, null);
    this.matchId = null;
    this.current = null;
    this.verdict = null;
    this.final = null;
    this.counter = 0;
    this.players.clear();
    this.logger = this.host.logger;
    this.host.onReturnToLobby(now);
  }

  /** A player left for good during the match: forfeits (eliminated now). */
  onPlayerLeft(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || !p.alive) return;
    p.alive = false;
    p.lives = 0;
    p.eliminatedAt = this.counter;
    this.host.markDirty();
  }

  input(playerId: string, roundId: string, input: JsonValue, at: number | undefined, now: number): void {
    const runner = this.requireRound(roundId);
    runner.handleInput(playerId, input, at, now);
  }

  report(playerId: string, roundId: string, result: PlayerResult, now: number): void {
    const runner = this.requireRound(roundId);
    if (now > runner.endsAt + this.host.config.timings.reportGraceMs) fail('INVALID_PHASE', { reason: 'late' });
    runner.handleReport(playerId, result, now);
  }

  // ─── Clock ─────────────────────────────────────────────────────────────────

  tick(now: number): void {
    for (let i = 0; i < 16 && this.step(now); i++);
  }

  private step(now: number): boolean {
    const due = this.phaseEndsAt !== null && now >= this.phaseEndsAt;
    const at = due ? this.phaseEndsAt! : now;
    switch (this.phase) {
      case 'LOBBY':
        return false;
      case 'STAGE_INTRO':
        if (!due) return false;
        this.nextRound(at);
        return true;
      case 'INTERLUDE':
        if (!due) return false;
        this.current!.runner.start(at);
        this.enter('MICROGAME', at, this.current!.runner.endsAt + this.host.config.timings.reportGraceMs - at);
        return true;
      case 'MICROGAME': {
        const runner = this.current!.runner;
        runner.tick(now);
        const early = runner.isComplete(now);
        if (!due && !early) return false;
        this.decide(early && !due ? now : at);
        return true;
      }
      case 'VERDICT':
        if (!due) return false;
        if (this.ended) this.finish(at);
        else this.nextRound(at);
        return true;
      case 'STAGE_RESULTS':
        if (!due) return false;
        this.returnToLobby(at);
        return true;
    }
  }

  // ─── Rounds ────────────────────────────────────────────────────────────────

  private nextRound(at: number): void {
    const { rhythm, timings } = this.host.config;
    const alive = this.aliveIds();
    const seated = this.host.seatedIds();
    if (seated.length === 0) {
      this.abort(at, 'noPlayers');
      return;
    }
    this.counter += 1;
    const bossSlot = this.gamesInLevel >= rhythm.gamesPerLevel;
    const duelSlot =
      !bossSlot && rhythm.duelEvery > 0 && this.counter % rhythm.duelEvery === 0 && alive.length >= 2;
    let kind: MicrogameKind = bossSlot ? 'boss' : duelSlot ? 'duel' : 'solo';
    const enabled = this.host.registry.enabled();
    // The first rounds of a match pick easy microgames (warm-up).
    const early = this.counter <= rhythm.easyRounds;
    let info = pickMicrogame(enabled, kind, this.stageZone, this.history, this.rng, early);
    if (!info) {
      kind = 'solo';
      info = pickMicrogame(enabled, 'solo', this.stageZone, this.history, this.rng, early)!;
    }
    this.history.push(info.id);
    this.zone = roundZone(info, this.stageZone, this.rng, this.zone);

    const levelUp = this.pendingLevelUp;
    this.pendingLevelUp = false;
    let speedUp = false;
    if (kind !== 'boss' && this.gamesInLevel > 0 && this.gamesInLevel % rhythm.speedUpEvery === 0 && this.tempo < rhythm.maxTempo) {
      this.tempo = Math.min(rhythm.maxTempo, round2(this.tempo + rhythm.tempoStep));
      speedUp = true;
    }

    const interlude = this.scaled(
      timings.interludeMs / this.tempo +
        (speedUp ? timings.speedUpExtraMs : 0) +
        (kind === 'boss' || levelUp ? timings.bossExtraMs : 0) +
        (kind === 'duel' ? timings.duelExtraMs : 0),
    );
    const durationMs = Math.max(500, this.scaled(info.durationMs / (kind === 'duel' ? 1 : this.tempo)));
    const activeAt = at + interlude;
    const roundId = `${this.matchId}.${this.counter}`;
    const participants = kind === 'duel' ? alive : seated;
    const seed = this.rng.seed();
    const secretSeed = this.host.config.seed === null ? randomSeed() : this.rng.seed();

    const runner = new RoundRunner(
      this.host.registry.module(info.id)!,
      { roundId, info, seed, secretSeed, level: this.level, tempo: this.tempo, participants, activeAt, durationMs },
      {
        config: this.host.config,
        logger: this.logger,
        isConnected: (id) => this.host.isConnected(id),
        isBot: (id) => this.host.isBot(id),
        skillOf: (id) => this.host.skillOf(id),
        rttOf: (id) => this.host.rttOf(id),
        emitState: (m) => this.host.output.minigameState(this.host.code, m),
        emitEvent: (m, to) => this.host.output.minigameEvent(this.host.code, m, to),
        markDirty: () => this.host.markDirty(),
      },
    );
    this.current = {
      runner,
      public: {
        roundId,
        index: this.counter,
        microgameId: info.id,
        kind,
        zone: this.zone,
        seed,
        level: this.level,
        tempo: this.tempo,
        speedUp,
        levelUp,
        participants: [...participants],
        timing: { interludeAt: at, activeAt, endsAt: runner.endsAt, durationMs },
      },
    };
    this.logger.debug('round announced', { counter: this.counter, minigame: info.id, kind, tempo: this.tempo, level: this.level });
    this.enter('INTERLUDE', at, activeAt - at);
  }

  private decide(at: number): void {
    const c = this.current!;
    const results = c.runner.results(at);
    const kind = c.public.kind;
    const { maxLives } = GAME_RULES;
    const entries: Verdict['entries'] = [];
    for (const id of c.runner.participants) {
      const p = this.players.get(id);
      const outcome = results[id] ?? 'dnf';
      if (!p || !p.alive) {
        entries.push({ playerId: id, outcome, counted: false, livesDelta: 0, lives: p?.lives ?? 0, eliminated: false });
        continue;
      }
      let delta = 0;
      if (outcome === 'success') {
        p.wins += 1;
        if (kind === 'boss' && p.lives < maxLives) delta = 1;
      } else {
        delta = -1;
      }
      p.lives = Math.max(0, p.lives + delta);
      const eliminated = p.lives === 0;
      if (eliminated) {
        p.alive = false;
        p.eliminatedAt = this.counter;
      }
      entries.push({ playerId: id, outcome, counted: true, livesDelta: delta, lives: p.lives, eliminated });
    }
    this.verdict = { roundId: c.public.roundId, index: c.public.index, microgameId: c.public.microgameId, kind, entries };

    // A level ends with its boss, or right after its microgames when no boss is enabled.
    const hasBoss = this.host.registry.enabled().some((m) => m.kind === 'boss');
    if (kind === 'boss' || (!hasBoss && this.gamesInLevel + 1 >= this.host.config.rhythm.gamesPerLevel)) {
      this.level += 1;
      this.gamesInLevel = 0;
      this.pendingLevelUp = this.level <= this.levels;
      this.tempo = round2(1 + (this.level - 1) * this.host.config.rhythm.levelTempoStep);
    } else {
      this.gamesInLevel += 1;
    }
    const alive = this.aliveIds().length;
    this.ended = (this.multiplayer ? alive <= 1 : alive === 0) || this.level > this.levels;
    this.logger.info('verdict', {
      counter: this.counter,
      minigame: c.public.microgameId,
      results: entries.map((e) => `${e.playerId}:${e.outcome}${e.counted ? `(${e.lives})` : '(ghost)'}`).join(' '),
      ended: this.ended,
    });
    this.enter('VERDICT', at, this.scaled(this.host.config.timings.verdictMs / Math.max(1, this.tempo * 0.9)));
  }

  private finish(at: number): void {
    const ids = [...this.players.keys()];
    const key = (id: string) => {
      const p = this.players.get(id)!;
      return [p.alive ? 1 : 0, p.eliminatedAt ?? Number.MAX_SAFE_INTEGER, p.lives, p.wins];
    };
    const cmp = (a: string, b: string) => {
      const ka = key(a);
      const kb = key(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i]! - ka[i]!;
      return 0;
    };
    ids.sort((a, b) => cmp(a, b) || this.host.seatOf(a) - this.host.seatOf(b));
    const entries: RankingEntry[] = [];
    ids.forEach((id, i) => {
      const p = this.players.get(id)!;
      const prev = entries[i - 1];
      const rank = prev && cmp(ids[i - 1]!, id) === 0 ? prev.rank : i + 1;
      entries.push({ playerId: id, rank, alive: p.alive, lives: p.lives, wins: p.wins, eliminatedAt: p.eliminatedAt });
    });
    this.final = { entries, winnerIds: entries.filter((e) => e.rank === 1).map((e) => e.playerId), microgamesPlayed: this.counter };
    this.logger.info('match finished', { winners: this.final.winnerIds.join(','), microgames: this.counter });
    const ms = this.host.config.timings.stageResultsMs;
    this.enter('STAGE_RESULTS', at, ms === null ? null : this.scaled(ms));
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private aliveIds(): string[] {
    const seated = new Set(this.host.seatedIds());
    return [...this.players].filter(([id, p]) => p.alive && seated.has(id)).map(([id]) => id);
  }

  private scaled(ms: number): number {
    return Math.round(ms * this.host.config.timeScale);
  }

  private requireRound(roundId: string): RoundRunner {
    if (this.phase !== 'MICROGAME') fail('INVALID_PHASE');
    const runner = this.current?.runner;
    if (!runner || runner.roundId !== roundId) fail('STALE_SESSION');
    return runner;
  }

  private enter(phase: MatchPhase, at: number, durationMs: number | null): void {
    if (!canTransition(this.phase, phase)) throw new Error(`Illegal phase transition ${this.phase} → ${phase}`);
    const previous = this.phase;
    this.phase = phase;
    this.phaseStartedAt = at;
    this.phaseEndsAt = durationMs === null ? null : at + Math.max(0, durationMs);
    this.host.queueEvent({ kind: 'phaseChanged', phase, previousPhase: previous, counter: this.counter });
    this.host.markDirty();
  }
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
