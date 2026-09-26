import type { PhaseTimings } from '@boucan/shared';

/**
 * Every tunable value of the backend, in one place. Change values here (or
 * through env overrides in env.ts), never as literals in the engine.
 *
 * Game-wide rules shared with the frontend (player counts, round options,
 * nickname lengths) live in shared/src/contracts/rules.ts instead.
 */
export interface GameConfig {
  timings: PhaseTimings;
  reconnect: {
    /** A disconnected player keeps their lobby seat this long. */
    lobbyGraceMs: number;
    /** During a match: after this, the player is marked `left` (kept in standings). */
    matchGraceMs: number;
    /** A disconnected host is replaced after this delay (immediately if they leave). */
    hostTransferMs: number;
    /** A room with no connected player is closed after this delay. */
    emptyRoomTtlMs: number;
  };
  scoring: {
    /** Points by placement in a multiplayer round: 1st, 2nd, 3rd… (last value repeats). */
    placementPoints: readonly number[];
    /** Points for outcome "failure" in placement / normalized strategies. dnf always scores 0. */
    failurePoints: number;
    /** Points for a success with the "threshold" strategy. */
    thresholdSuccessPoints: number;
    /** Points for normalized = 1 with the "normalized" strategy. */
    normalizedMaxPoints: number;
    /** Solo rounds (one participant) use result.normalized when present, graded like this. */
    soloGrades: readonly { min: number; points: number }[];
  };
  network: {
    /** Server simulation / timer resolution. */
    tickMs: number;
    maxMessageBytes: number;
    /** A connection must send `hello` within this delay. */
    handshakeTimeoutMs: number;
    /** Per-connection token bucket for every client message. */
    messageBurst: number;
    messagesPerSecond: number;
    /** Protocol errors (bad JSON, unknown type, invalid payload) tolerated per window before closing. */
    maxProtocolErrors: number;
    protocolErrorWindowMs: number;
    /** Upper bound of one-way latency compensation for time-critical inputs. */
    maxLagCompensationMs: number;
    /** WebSocket ping interval (also measures RTT). */
    heartbeatMs: number;
    /** Default broadcast rate of minigame shared state (modules may override). */
    defaultStateHz: number;
  };
  limits: {
    maxRooms: number;
    maxConnectionsPerIp: number;
  };
  characters: {
    /** Allowed character ids; null = any syntactically valid CharacterId (roster is frontend-owned). */
    allowed: readonly string[] | null;
  };
  minigames: {
    /** Ids of playable minigames; null = every registered module. */
    enabled: readonly string[] | null;
    /** Multiplies every module's durationMs (dev/test speed-up). Modules must read ctx.durationMs. */
    durationScale: number;
  };
  /** Fixed seed for match RNG (tests, fixtures). null = random per match. */
  seed: number | null;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  timings: {
    matchStartingMs: 3_000,
    preparingMinMs: 3_000,
    preparingMaxMs: 12_000,
    countdownMs: 3_000,
    endingMinMs: 800,
    reportGraceMs: 3_000,
    resultsMs: 5_000,
    intermissionMs: 4_000,
    matchResultsMs: null,
  },
  reconnect: {
    lobbyGraceMs: 30_000,
    matchGraceMs: 90_000,
    hostTransferMs: 5_000,
    emptyRoomTtlMs: 60_000,
  },
  scoring: {
    placementPoints: [10, 7, 5, 3, 2, 1, 1, 1],
    failurePoints: 0,
    thresholdSuccessPoints: 6,
    normalizedMaxPoints: 10,
    soloGrades: [
      { min: 0.8, points: 10 },
      { min: 0.55, points: 7 },
      { min: 0.3, points: 5 },
      { min: 0, points: 2 },
    ],
  },
  network: {
    tickMs: 50,
    maxMessageBytes: 16 * 1024,
    handshakeTimeoutMs: 10_000,
    messageBurst: 60,
    messagesPerSecond: 40,
    maxProtocolErrors: 25,
    protocolErrorWindowMs: 10_000,
    maxLagCompensationMs: 150,
    heartbeatMs: 5_000,
    defaultStateHz: 10,
  },
  limits: {
    maxRooms: 500,
    maxConnectionsPerIp: 32,
  },
  characters: {
    allowed: null,
  },
  minigames: {
    enabled: null,
    durationScale: 1,
  },
  seed: null,
};

export type GameConfigOverrides = {
  [K in keyof GameConfig]?: GameConfig[K] extends readonly unknown[] | null | number
    ? GameConfig[K]
    : Partial<GameConfig[K]>;
};

/** Merges overrides (one level deep) onto the defaults, then applies a time scale to phase timings. */
export function resolveGameConfig(overrides: GameConfigOverrides = {}, timeScale = 1): GameConfig {
  const merged: GameConfig = {
    timings: { ...DEFAULT_GAME_CONFIG.timings, ...overrides.timings },
    reconnect: { ...DEFAULT_GAME_CONFIG.reconnect, ...overrides.reconnect },
    scoring: { ...DEFAULT_GAME_CONFIG.scoring, ...overrides.scoring },
    network: { ...DEFAULT_GAME_CONFIG.network, ...overrides.network },
    limits: { ...DEFAULT_GAME_CONFIG.limits, ...overrides.limits },
    characters: { ...DEFAULT_GAME_CONFIG.characters, ...overrides.characters },
    minigames: { ...DEFAULT_GAME_CONFIG.minigames, ...overrides.minigames },
    seed: overrides.seed !== undefined ? overrides.seed : DEFAULT_GAME_CONFIG.seed,
  };
  if (timeScale !== 1) {
    merged.minigames = { ...merged.minigames, durationScale: merged.minigames.durationScale * timeScale };
    const t = merged.timings;
    const s = (ms: number) => Math.max(0, Math.round(ms * timeScale));
    merged.timings = {
      matchStartingMs: s(t.matchStartingMs),
      preparingMinMs: s(t.preparingMinMs),
      preparingMaxMs: s(t.preparingMaxMs),
      countdownMs: s(t.countdownMs),
      endingMinMs: s(t.endingMinMs),
      reportGraceMs: s(t.reportGraceMs),
      resultsMs: s(t.resultsMs),
      intermissionMs: s(t.intermissionMs),
      matchResultsMs: t.matchResultsMs === null ? null : s(t.matchResultsMs),
    };
  }
  return merged;
}
