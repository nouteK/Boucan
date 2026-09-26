/**
 * Game-wide rules that both sides must agree on. They are part of the
 * contract: changing one is a contract change (see version.ts).
 *
 * Tunable values that only the server needs (phase durations, rate limits,
 * points tables…) live in server/src/config/game-config.ts and are exposed to
 * clients at runtime through the `hello` reply (ServerInfo).
 */
export const GAME_RULES = {
  minPlayers: 1,
  maxPlayers: 8,
  /** Match lengths a host may choose. 10 is the absolute ceiling. */
  roundOptions: [3, 5, 8, 10],
  defaultRounds: 5,
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

export type RoundOption = (typeof GAME_RULES.roundOptions)[number];

export function isRoundOption(value: unknown): value is RoundOption {
  return (GAME_RULES.roundOptions as readonly unknown[]).includes(value);
}
