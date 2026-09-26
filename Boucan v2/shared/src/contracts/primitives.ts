import { z } from 'zod';
import { GAME_RULES } from './rules';

/** Server wall-clock time in milliseconds since the Unix epoch. See docs/architecture/GAME_LIFECYCLE.md#temps. */
export const Timestamp = z.number().int().nonnegative().describe('Server epoch time (ms)');
export type Timestamp = z.infer<typeof Timestamp>;

/** Opaque player id, stable for the whole life of the player in a room. */
export const PlayerId = z.string().min(1).max(64).describe('Opaque player id');
export type PlayerId = z.infer<typeof PlayerId>;

const codePattern = new RegExp(
  `^[${GAME_RULES.roomCode.alphabet}]{${GAME_RULES.roomCode.length}}$`,
);

/** Room code as shown to players. Input is normalised (trim + uppercase) before validation. */
export const RoomCode = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
  z.string().regex(codePattern, 'Invalid room code'),
);
export type RoomCode = z.infer<typeof RoomCode>;

/** Minigame identifier: lowercase slug, e.g. "course-couloir". */
export const MiniGameId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,31}$/, 'Invalid minigame id')
  .describe('Minigame slug');
export type MiniGameId = z.infer<typeof MiniGameId>;

/**
 * Logical character id chosen by a player. The backend never knows what it
 * looks like: the roster and its rendering belong to the frontend.
 */
export const CharacterId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,31}$/, 'Invalid character id')
  .describe('Logical character id (frontend-owned roster)');
export type CharacterId = z.infer<typeof CharacterId>;

/** Id of one played minigame (one per round). Actions carrying another id are stale. */
export const SessionId = z.string().min(1).max(64).describe('Minigame session id');
export type SessionId = z.infer<typeof SessionId>;

/** Request id chosen by the client to match a `reply`. */
export const RequestId = z.string().min(1).max(32);
export type RequestId = z.infer<typeof RequestId>;

/** 32-bit unsigned seed for the shared deterministic PRNG (rules/rng.ts). */
export const Seed = z.number().int().min(0).max(0xffffffff);
export type Seed = z.infer<typeof Seed>;

/** Any JSON value. Size is bounded by the transport message limit. */
export const JsonValue = z.json();
export type JsonValue = z.infer<typeof JsonValue>;

/** Semantic payload object with a `type` discriminator, e.g. { type: "bellRang", kind: "fake" }. */
export const TypedPayload = z.looseObject({ type: z.string().min(1).max(48) });
export type TypedPayload = z.infer<typeof TypedPayload>;
