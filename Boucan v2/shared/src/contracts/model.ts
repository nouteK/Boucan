import { z } from 'zod';
import { MatchPhase } from './phases';
import {
  CharacterId,
  JsonValue,
  MiniGameId,
  PlayerId,
  RoomCode,
  Seed,
  SessionId,
  Timestamp,
} from './primitives';
import { GAME_RULES } from './rules';

/*
 * Data model shared by frontend and backend. Everything here is semantic:
 * no colours, sprites, sounds or layouts. See docs/architecture/NETWORK_PROTOCOL.md.
 */

// ─── Player ──────────────────────────────────────────────────────────────────

/**
 * connected    : socket alive.
 * disconnected : socket lost, seat kept until the grace period ends (may resume).
 * left         : left or timed out during a match; kept only so the standings
 *                stay complete, removed when the room returns to the lobby.
 */
export const ConnectionStatus = z.enum(['connected', 'disconnected', 'left']);
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;

export const Player = z.object({
  id: PlayerId,
  /** Normalised, validated, unique in the room (a suffix is added on collision). */
  nickname: z.string(),
  /** Logical character id; null = not chosen yet (frontend picks a default look). */
  characterId: CharacterId.nullable(),
  /** 0-based seat, stable while the player stays in the room. Useful for ordering and colour slots. */
  seat: z.number().int().min(0).max(GAME_RULES.maxPlayers - 1),
  isHost: z.boolean(),
  /** Lobby readiness. Reset to false when the room returns to the lobby. */
  ready: z.boolean(),
  connection: ConnectionStatus,
  /** Total match score (0 in lobby). */
  score: z.number().int(),
  joinedAt: Timestamp,
});
export type Player = z.infer<typeof Player>;

// ─── Match configuration ─────────────────────────────────────────────────────

export const RoundCount = z
  .number()
  .int()
  .refine((n) => (GAME_RULES.roundOptions as readonly number[]).includes(n), {
    message: `rounds must be one of ${GAME_RULES.roundOptions.join(', ')}`,
  });

export const MatchConfig = z.object({
  rounds: RoundCount,
  /** Minigames the host allows. null = every enabled minigame. */
  minigamePool: z.array(MiniGameId).min(1).max(64).nullable(),
});
export type MatchConfig = z.infer<typeof MatchConfig>;

// ─── Minigames ───────────────────────────────────────────────────────────────

/**
 * local  : each client simulates the game; the server syncs start/end and
 *          receives a result report per player (plausibility-checked).
 * relay  : clients simulate locally but share some state through the server
 *          (positions, progress); the server validates and relays it.
 * server : the server simulates / judges the decisive part of the game
 *          (competitive timing, shared resources) and computes results.
 */
export const Authority = z.enum(['local', 'relay', 'server']);
export type Authority = z.infer<typeof Authority>;

/** Metrics a result can be ranked by. */
export const Metric = z.enum(['score', 'timeMs', 'accuracy', 'errors', 'normalized', 'rank']);
export type Metric = z.infer<typeof Metric>;

/**
 * placement  : points from the placement table (1st, 2nd…).
 * threshold  : fixed points for success, 0 for failure; rank is for display only.
 * normalized : points proportional to result.normalized (0..1).
 */
export const ScoringStrategy = z.enum(['placement', 'threshold', 'normalized']);
export type ScoringStrategy = z.infer<typeof ScoringStrategy>;

export const RankingKey = z.object({ metric: Metric, order: z.enum(['asc', 'desc']) });
export type RankingKey = z.infer<typeof RankingKey>;

export const ScoringSpec = z.object({
  strategy: ScoringStrategy,
  /** Primary ranking key, then tie-breakers in order. */
  rankBy: z.array(RankingKey).min(1).max(4),
  /**
   * How results with outcome "failure" earn points (placement / normalized):
   * "zero"   → config failurePoints (a failure is a failure: false start…)
   * "ranked" → like successes, from their rank / normalized value (partial
   *            progress matters: 6/7 answers, half the corridor…).
   * Default "zero". The threshold strategy always gives failurePoints.
   */
  failures: z.enum(['zero', 'ranked']).optional(),
});
export type ScoringSpec = z.infer<typeof ScoringSpec>;

/** What the server knows about a minigame. Presentation (name, rules text, art) is frontend-owned. */
export const MiniGameDefinition = z.object({
  id: MiniGameId,
  authority: Authority,
  minPlayers: z.number().int().min(1),
  maxPlayers: z.number().int().max(GAME_RULES.maxPlayers),
  /** Length of MINIGAME_ACTIVE. The module may end earlier (everyone done). */
  durationMs: z.number().int().positive(),
  scoring: ScoringSpec,
  /** True when clients must send `minigame.report` at the end. */
  acceptsReports: z.boolean(),
  /** True when the module accepts `minigame.input`. */
  acceptsInputs: z.boolean(),
  /** Max `minigame.input` per second per player (0 when inputs are not accepted). */
  inputRate: z.number().nonnegative(),
});
export type MiniGameDefinition = z.infer<typeof MiniGameDefinition>;

/** Timestamps of the current minigame. Null = not reached yet. All in server time. */
export const MiniGameTiming = z.object({
  preparingAt: Timestamp,
  countdownAt: Timestamp.nullable(),
  /** Gameplay starts. Known as soon as the countdown starts. */
  activeAt: Timestamp.nullable(),
  /** Hard deadline of MINIGAME_ACTIVE (activeAt + durationMs). */
  endsAt: Timestamp.nullable(),
  /** Actual end of MINIGAME_ACTIVE (≤ endsAt when the module finished early). */
  endedAt: Timestamp.nullable(),
  durationMs: z.number().int().positive(),
});
export type MiniGameTiming = z.infer<typeof MiniGameTiming>;

export const MiniGameSession = z.object({
  sessionId: SessionId,
  minigameId: MiniGameId,
  /** 1-based round number. */
  round: z.number().int().min(1),
  authority: Authority,
  /** Public seed: every client builds the same level/sequence with rules/rng.ts. */
  seed: Seed,
  /** Public, module-specific parameters (difficulty, sizes…). Never secrets. */
  params: JsonValue,
  participants: z.array(PlayerId),
  solo: z.boolean(),
  /** Participants that finished loading (`minigame.ready`). */
  readyPlayerIds: z.array(PlayerId),
  /** Participants whose result is known (report received or judged). */
  finishedPlayerIds: z.array(PlayerId),
  timing: MiniGameTiming,
});
export type MiniGameSession = z.infer<typeof MiniGameSession>;

// ─── Results & scores ────────────────────────────────────────────────────────

export const Outcome = z.enum(['success', 'failure', 'dnf']);
export type Outcome = z.infer<typeof Outcome>;

const finite = z.number().refine(Number.isFinite, 'must be finite');

/**
 * Raw result of one player in one minigame. Only the fields meaningful for
 * the minigame are set; the minigame's ScoringSpec says which ones rank.
 * `dnf` = did not finish / did not play (disconnected, no report).
 */
export const PlayerResult = z.object({
  outcome: Outcome,
  score: finite.min(-1e9).max(1e9).optional(),
  timeMs: z.number().int().min(0).max(3_600_000).optional(),
  accuracy: z.number().min(0).max(1).optional(),
  errors: z.number().int().min(0).max(1_000_000).optional(),
  rank: z.number().int().min(1).max(GAME_RULES.maxPlayers).optional(),
  normalized: z.number().min(0).max(1).optional(),
  /** Small semantic extras for the results screen, e.g. { pops: 2, perfect: true }. */
  stats: z
    .record(z.string().max(32), z.union([finite, z.string().max(64), z.boolean()]))
    .refine((r) => Object.keys(r).length <= 16, 'at most 16 stats')
    .optional(),
});
export type PlayerResult = z.infer<typeof PlayerResult>;

export const RoundEntry = z.object({
  playerId: PlayerId,
  result: PlayerResult,
  /** Competition ranking (ties share the best rank: 1, 1, 3). */
  rank: z.number().int().min(1),
  /** Points added to the match score this round. */
  points: z.number().int().min(0),
});
export type RoundEntry = z.infer<typeof RoundEntry>;

export const RoundResults = z.object({
  round: z.number().int().min(1),
  sessionId: SessionId,
  minigameId: MiniGameId,
  solo: z.boolean(),
  /** Sorted best first. */
  entries: z.array(RoundEntry),
});
export type RoundResults = z.infer<typeof RoundResults>;

/** A line of the match leaderboard. */
export const Standing = z.object({
  playerId: PlayerId,
  rank: z.number().int().min(1),
  score: z.number().int(),
  /** Rank before the last scored round (null before the first round). */
  previousRank: z.number().int().min(1).nullable(),
  /** Points gained in the last scored round. */
  delta: z.number().int(),
});
export type Standing = z.infer<typeof Standing>;

export const MatchResults = z.object({
  standings: z.array(Standing),
  winnerIds: z.array(PlayerId),
  rounds: z.array(RoundResults),
});
export type MatchResults = z.infer<typeof MatchResults>;

// ─── Match & lobby state ─────────────────────────────────────────────────────

export const MatchState = z.object({
  /** Null in the lobby; a new id for every match. */
  matchId: z.string().nullable(),
  phase: MatchPhase,
  phaseStartedAt: Timestamp,
  /** Deadline of the phase, null when open-ended (LOBBY, MATCH_RESULTS without auto return). */
  phaseEndsAt: Timestamp.nullable(),
  /**
   * true  : the phase ends exactly at phaseEndsAt (countdowns, results).
   * false : phaseEndsAt is the latest possible end; the phase may end sooner
   *         (everyone loaded, everyone finished, all reports received).
   */
  phaseEndsExactly: z.boolean(),
  /** 1-based current round, 0 before the first minigame. */
  round: z.number().int().min(0),
  totalRounds: z.number().int().min(1),
  minigame: MiniGameSession.nullable(),
  lastRound: RoundResults.nullable(),
  standings: z.array(Standing),
  final: MatchResults.nullable(),
});
export type MatchState = z.infer<typeof MatchState>;

export const Lobby = z.object({
  code: RoomCode,
  hostId: PlayerId.nullable(),
  /** Sorted by seat. Includes disconnected players (and `left` ones during a match). */
  players: z.array(Player),
  config: MatchConfig,
  maxPlayers: z.number().int(),
  /** True when the host may start now (LOBBY, enough connected players, all ready). */
  canStart: z.boolean(),
});
export type Lobby = z.infer<typeof Lobby>;

/**
 * Full room state, broadcast on every change. `rev` increases by one per
 * snapshot of a room: a client can drop out-of-order or duplicate snapshots.
 */
export const RoomSnapshot = z.object({
  rev: z.number().int().min(1),
  serverTime: Timestamp,
  lobby: Lobby,
  match: MatchState,
});
export type RoomSnapshot = z.infer<typeof RoomSnapshot>;

// ─── Server info (hello reply) ───────────────────────────────────────────────

export const PhaseTimings = z.object({
  matchStartingMs: z.number().int().nonnegative(),
  preparingMinMs: z.number().int().nonnegative(),
  preparingMaxMs: z.number().int().nonnegative(),
  countdownMs: z.number().int().nonnegative(),
  endingMinMs: z.number().int().nonnegative(),
  reportGraceMs: z.number().int().nonnegative(),
  resultsMs: z.number().int().nonnegative(),
  intermissionMs: z.number().int().nonnegative(),
  /** null = MATCH_RESULTS waits for the host (`match.returnToLobby`). */
  matchResultsMs: z.number().int().nonnegative().nullable(),
});
export type PhaseTimings = z.infer<typeof PhaseTimings>;

export const ServerInfo = z.object({
  protocolVersion: z.number().int(),
  contractRevision: z.string(),
  serverVersion: z.string(),
  environment: z.enum(['development', 'test', 'production']),
  serverTime: Timestamp,
  connectionId: z.string(),
  limits: z.object({
    minPlayers: z.number().int(),
    maxPlayers: z.number().int(),
    roundOptions: z.array(z.number().int()),
    defaultRounds: z.number().int(),
    nicknameMinLength: z.number().int(),
    nicknameMaxLength: z.number().int(),
    maxMessageBytes: z.number().int(),
    /** null = any valid CharacterId is accepted. */
    characterIds: z.array(CharacterId).nullable(),
  }),
  timings: PhaseTimings,
  reconnect: z.object({
    lobbyGraceMs: z.number().int(),
    matchGraceMs: z.number().int(),
  }),
  minigames: z.array(MiniGameDefinition),
});
export type ServerInfo = z.infer<typeof ServerInfo>;
