/**
 * Game-wide rules shared by client and server. Tunable server-only values
 * (durations, tempo, bot skill…) live in server/src/config/game-config.ts and
 * are sent to clients in the `hello` reply (ServerInfo).
 */
export const GAME_RULES = {
  minPlayers: 1,
  maxPlayers: 8,
  /** Lives a player may start with. */
  livesOptions: [3, 4, 5],
  defaultLives: 4,
  /** Lives can go above the start value (boss bonus) up to this cap. */
  maxLives: 6,
  /** Match length = number of levels (each level = a series of microgames + a boss). */
  lengthOptions: { court: 1, normal: 2, long: 3 },
  defaultLength: 'normal',
  nickname: {
    /** Counted in user-perceived characters (grapheme clusters). */
    minLength: 2,
    maxLength: 16,
  },
  roomCode: {
    /** No vowels (no accidental words), no look-alikes (0/O, 1/I/L, 5/S, 8/B). */
    alphabet: 'BCDFGHJKMNPQRTVWXZ234679',
    length: 4,
  },
} as const;

export type MatchLength = keyof typeof GAME_RULES.lengthOptions;
