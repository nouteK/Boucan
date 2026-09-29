/**
 * Every tunable value of the server, in one place. Change values here (or via
 * env overrides in env.ts), never as literals in the engine.
 * Rules shared with the client (player counts, lives options…) live in
 * shared/src/contracts/rules.ts; microgame durations in the shared catalog.
 */
export interface GameConfig {
  timings: {
    /** Stage title card before the first microgame. */
    stageIntroMs: number;
    /** Interlude between two microgames at tempo 1 (divided by the tempo). */
    interludeMs: number;
    /** Extra interlude time when "PLUS VITE !" is announced. */
    speedUpExtraMs: number;
    /** Extra interlude time before a boss / after a level up. */
    bossExtraMs: number;
    /** Extra interlude time before a duel (everyone gathers in the arena). */
    duelExtraMs: number;
    /** Verdict display at tempo 1 (divided by the tempo). */
    verdictMs: number;
    /** Reports accepted this long after the fuse burns out (network latency). Not scaled. */
    reportGraceMs: number;
    /** Final ranking display; null = wait for the host (returnToLobby). */
    stageResultsMs: number | null;
  };
  rhythm: {
    /** Solo/duel microgames before the boss of each level. */
    gamesPerLevel: number;
    /** A speed-up every N microgames. */
    speedUpEvery: number;
    tempoStep: number;
    maxTempo: number;
    /** Tempo at the start of level L = 1 + (L − 1) × levelTempoStep. */
    levelTempoStep: number;
    /** A duel every N microgames (0 = never). Needs ≥ 2 alive players. */
    duelEvery: number;
    /** The first N microgames of a match are picked among the easy ones (warm-up). */
    easyRounds: number;
  };
  bots: {
    /** Skill range of new bots (0..1), drawn uniformly. */
    minSkill: number;
    maxSkill: number;
    names: readonly string[];
  };
  reconnect: {
    lobbyGraceMs: number;
    /** During a match: after this, the player is marked `left`. */
    matchGraceMs: number;
    hostTransferMs: number;
    /** A room with no connected human is closed after this delay. */
    emptyRoomTtlMs: number;
  };
  network: {
    tickMs: number;
    maxMessageBytes: number;
    handshakeTimeoutMs: number;
    messageBurst: number;
    messagesPerSecond: number;
    maxProtocolErrors: number;
    protocolErrorWindowMs: number;
    maxLagCompensationMs: number;
    heartbeatMs: number;
    defaultStateHz: number;
  };
  limits: {
    maxRooms: number;
    maxConnectionsPerIp: number;
  };
  characters: {
    /** Allowed character ids; null = any valid id (the roster belongs to the client). */
    allowed: readonly string[] | null;
  };
  microgames: {
    /** Playable microgame ids; null = the whole catalog. */
    enabled: readonly string[] | null;
  };
  /** Multiplies every duration (dev/test speed-up). */
  timeScale: number;
  /** Fixed RNG seed (tests). null = random. */
  seed: number | null;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  timings: {
    stageIntroMs: 3_200,
    interludeMs: 2_300,
    speedUpExtraMs: 1_300,
    bossExtraMs: 1_800,
    duelExtraMs: 1_200,
    verdictMs: 1_400,
    reportGraceMs: 350,
    stageResultsMs: null,
  },
  rhythm: {
    gamesPerLevel: 10,
    speedUpEvery: 4,
    tempoStep: 0.14,
    maxTempo: 1.7,
    levelTempoStep: 0.12,
    duelEvery: 5,
    easyRounds: 4,
  },
  bots: {
    minSkill: 0.55,
    maxSkill: 0.88,
    names: ['Robot Rita', 'Bip Boup', 'Cyber Momo', 'Robo Lulu', 'Zorglub', 'Tic Tac', 'Méca Zoé', 'Boulon'],
  },
  reconnect: {
    lobbyGraceMs: 30_000,
    matchGraceMs: 90_000,
    hostTransferMs: 5_000,
    emptyRoomTtlMs: 60_000,
  },
  network: {
    tickMs: 25,
    maxMessageBytes: 16 * 1024,
    handshakeTimeoutMs: 10_000,
    messageBurst: 60,
    messagesPerSecond: 40,
    maxProtocolErrors: 25,
    protocolErrorWindowMs: 10_000,
    maxLagCompensationMs: 150,
    heartbeatMs: 5_000,
    defaultStateHz: 15,
  },
  limits: {
    maxRooms: 500,
    maxConnectionsPerIp: 32,
  },
  characters: { allowed: null },
  microgames: { enabled: null },
  timeScale: 1,
  seed: null,
};

export type GameConfigOverrides = {
  [K in keyof GameConfig]?: GameConfig[K] extends readonly unknown[] | null | number
    ? GameConfig[K]
    : Partial<GameConfig[K]>;
};

/** Merges overrides (one level deep) onto the defaults. */
export function resolveGameConfig(overrides: GameConfigOverrides = {}, timeScale?: number): GameConfig {
  return {
    timings: { ...DEFAULT_GAME_CONFIG.timings, ...overrides.timings },
    rhythm: { ...DEFAULT_GAME_CONFIG.rhythm, ...overrides.rhythm },
    bots: { ...DEFAULT_GAME_CONFIG.bots, ...overrides.bots },
    reconnect: { ...DEFAULT_GAME_CONFIG.reconnect, ...overrides.reconnect },
    network: { ...DEFAULT_GAME_CONFIG.network, ...overrides.network },
    limits: { ...DEFAULT_GAME_CONFIG.limits, ...overrides.limits },
    characters: { ...DEFAULT_GAME_CONFIG.characters, ...overrides.characters },
    microgames: { ...DEFAULT_GAME_CONFIG.microgames, ...overrides.microgames },
    timeScale: timeScale ?? overrides.timeScale ?? DEFAULT_GAME_CONFIG.timeScale,
    seed: overrides.seed !== undefined ? overrides.seed : DEFAULT_GAME_CONFIG.seed,
  };
}
