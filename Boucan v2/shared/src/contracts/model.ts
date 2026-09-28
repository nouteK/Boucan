import { z } from 'zod';
import { ZONES } from './catalog';
import { MatchPhase } from './phases';
import { CharacterId, PlayerId, RoomCode, Seed, Timestamp } from './primitives';
import { GAME_RULES } from './rules';

/*
 * Data model shared by client and server. Semantic only: no sprite, sound or
 * layout ever travels on the network — the client decides how things look.
 */

// ─── Player ──────────────────────────────────────────────────────────────────

/**
 * connected    : socket alive.
 * disconnected : socket lost, seat kept during the grace period (may resume).
 * left         : left during a match; kept for the final ranking only.
 */
export const ConnectionStatus = z.enum(['connected', 'disconnected', 'left']);
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;

export const Player = z.object({
  id: PlayerId,
  nickname: z.string(),
  /** Logical character id; null = client default. */
  characterId: CharacterId.nullable(),
  /** 0-based seat, stable while in the room (ordering, colour slot). */
  seat: z.number().int().min(0).max(GAME_RULES.maxPlayers - 1),
  isHost: z.boolean(),
  /** Simulated player run by the server. */
  isBot: z.boolean(),
  ready: z.boolean(),
  connection: ConnectionStatus,
  /** Remaining lives in the current match (0 in lobby). */
  lives: z.number().int().min(0),
  /** Microgames won in the current match. */
  wins: z.number().int().min(0),
  /** false once eliminated: the player keeps playing as a "ghost" but no longer counts. */
  alive: z.boolean(),
});
export type Player = z.infer<typeof Player>;

// ─── Configuration ───────────────────────────────────────────────────────────

const Zone = z.enum(ZONES);

export const MatchConfig = z.object({
  /** World of the stage (scenery + microgame pool). "mix" = every world. */
  zone: z.union([Zone, z.literal('mix')]),
  lives: z
    .number()
    .int()
    .refine((n) => (GAME_RULES.livesOptions as readonly number[]).includes(n), 'lives must be 3, 4 or 5'),
  length: z.enum(['court', 'normal', 'long']),
});
export type MatchConfig = z.infer<typeof MatchConfig>;

// ─── Rounds ──────────────────────────────────────────────────────────────────

export const Outcome = z.enum(['success', 'failure', 'dnf']);
export type Outcome = z.infer<typeof Outcome>;

/** What a client reports at the end of a solo / boss microgame. */
export const PlayerResult = z.object({
  outcome: z.enum(['success', 'failure']),
  /** Optional detail for fun displays (ms taken, score…). */
  score: z.number().finite().min(-1e6).max(1e6).optional(),
});
export type PlayerResult = z.infer<typeof PlayerResult>;

export const RoundTiming = z.object({
  /** Start of the interlude announcing this microgame. */
  interludeAt: Timestamp,
  /** The microgame starts (every client starts it at this server time). */
  activeAt: Timestamp,
  /** The fuse burns out: end of play. */
  endsAt: Timestamp,
  /** Real duration of play (already divided by the tempo). */
  durationMs: z.number().int().positive(),
});
export type RoundTiming = z.infer<typeof RoundTiming>;

export const Round = z.object({
  roundId: z.string(),
  /** Counter shown during the interlude (1, 2, 3…). */
  index: z.number().int().min(1),
  microgameId: z.string(),
  kind: z.enum(['solo', 'boss', 'duel']),
  /** World the microgame is set in. */
  zone: Zone,
  /** Shared seed: every client builds the same situation. */
  seed: Seed,
  /** Difficulty level (1 → 3), rises at the end of each level. */
  level: z.number().int().min(1),
  /** Game speed multiplier (1 = normal). Gameplay time runs `tempo` times faster. */
  tempo: z.number().positive(),
  /** Banners of the interlude. */
  speedUp: z.boolean(),
  levelUp: z.boolean(),
  /** Players taking part (solo/boss: everyone seated, ghosts included; duel: alive players). */
  participants: z.array(PlayerId),
  /** Live outcomes as they are known (who already won / lost). */
  progress: z.record(PlayerId, Outcome),
  timing: RoundTiming,
});
export type Round = z.infer<typeof Round>;

export const VerdictEntry = z.object({
  playerId: PlayerId,
  outcome: Outcome,
  /** false for ghosts (eliminated players playing for fun). */
  counted: z.boolean(),
  livesDelta: z.number().int(),
  lives: z.number().int().min(0),
  /** Eliminated by this verdict. */
  eliminated: z.boolean(),
});
export type VerdictEntry = z.infer<typeof VerdictEntry>;

export const Verdict = z.object({
  roundId: z.string(),
  index: z.number().int(),
  microgameId: z.string(),
  kind: z.enum(['solo', 'boss', 'duel']),
  entries: z.array(VerdictEntry),
});
export type Verdict = z.infer<typeof Verdict>;

export const RankingEntry = z.object({
  playerId: PlayerId,
  rank: z.number().int().min(1),
  alive: z.boolean(),
  lives: z.number().int(),
  wins: z.number().int(),
  /** Counter value of the microgame that eliminated the player (null = survived). */
  eliminatedAt: z.number().int().nullable(),
});
export type RankingEntry = z.infer<typeof RankingEntry>;

export const FinalRanking = z.object({
  entries: z.array(RankingEntry),
  winnerIds: z.array(PlayerId),
  microgamesPlayed: z.number().int(),
});
export type FinalRanking = z.infer<typeof FinalRanking>;

// ─── Match & lobby ───────────────────────────────────────────────────────────

export const MatchState = z.object({
  matchId: z.string().nullable(),
  phase: MatchPhase,
  phaseStartedAt: Timestamp,
  /** End of the current phase (null = open-ended: LOBBY, STAGE_RESULTS). */
  phaseEndsAt: Timestamp.nullable(),
  /** World of the stage (the configured world, or the world of the current round in "mix"). */
  zone: Zone,
  level: z.number().int().min(1),
  levels: z.number().int().min(1),
  tempo: z.number().positive(),
  /** Microgames announced so far. */
  counter: z.number().int().min(0),
  /** Current / next microgame (INTERLUDE, MICROGAME, VERDICT). */
  round: Round.nullable(),
  /** Result of the last microgame (VERDICT and following INTERLUDE). */
  verdict: Verdict.nullable(),
  final: FinalRanking.nullable(),
});
export type MatchState = z.infer<typeof MatchState>;

export const Lobby = z.object({
  code: RoomCode,
  hostId: PlayerId.nullable(),
  /** Sorted by seat. */
  players: z.array(Player),
  config: MatchConfig,
  maxPlayers: z.number().int(),
  canStart: z.boolean(),
});
export type Lobby = z.infer<typeof Lobby>;

/** Full room state, broadcast on every change; `rev` grows by one per snapshot. */
export const RoomSnapshot = z.object({
  rev: z.number().int().min(1),
  serverTime: Timestamp,
  lobby: Lobby,
  match: MatchState,
});
export type RoomSnapshot = z.infer<typeof RoomSnapshot>;

// ─── Server info (hello reply) ───────────────────────────────────────────────

export const ServerInfo = z.object({
  protocolVersion: z.number().int(),
  serverVersion: z.string(),
  environment: z.enum(['development', 'test', 'production']),
  serverTime: Timestamp,
  connectionId: z.string(),
  /** Microgame ids the server may pick (subset of the shared catalog). */
  microgames: z.array(z.string()),
  timings: z.object({
    stageIntroMs: z.number().int(),
    interludeMs: z.number().int(),
    verdictMs: z.number().int(),
  }),
});
export type ServerInfo = z.infer<typeof ServerInfo>;
