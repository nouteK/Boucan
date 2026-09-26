import { z } from 'zod';

/**
 * Error categories let a client tell at a glance whose problem it is:
 *
 * - protocol : the message itself is wrong (bad JSON, unknown type, invalid
 *              payload, version mismatch) → the client adapter has a bug or is
 *              out of date with the contract.
 * - request  : the message is valid but refused by the game rules (wrong phase,
 *              not host, room full, nickname refused…) → expected in normal
 *              play, the UI should explain it to the player.
 * - rate     : too many messages / server capacity → back off.
 * - server   : unexpected backend failure → backend bug, check server logs.
 *
 * The SDK adds a client-only `network` category (connection lost, timeout).
 */
export const ERROR_CATEGORIES = ['protocol', 'request', 'rate', 'server'] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export const ERROR_CODES = {
  // protocol
  BAD_MESSAGE: 'protocol',
  UNKNOWN_MESSAGE: 'protocol',
  INVALID_PAYLOAD: 'protocol',
  PROTOCOL_MISMATCH: 'protocol',
  HANDSHAKE_REQUIRED: 'protocol',
  // request
  ALREADY_IN_ROOM: 'request',
  NOT_IN_ROOM: 'request',
  ROOM_NOT_FOUND: 'request',
  ROOM_FULL: 'request',
  MATCH_IN_PROGRESS: 'request',
  INVALID_PHASE: 'request',
  NOT_HOST: 'request',
  NOT_ALL_READY: 'request',
  NOT_ENOUGH_PLAYERS: 'request',
  NICKNAME_INVALID: 'request',
  NICKNAME_NOT_ALLOWED: 'request',
  CHARACTER_INVALID: 'request',
  CONFIG_INVALID: 'request',
  PLAYER_NOT_FOUND: 'request',
  SESSION_NOT_FOUND: 'request',
  STALE_SESSION: 'request',
  NOT_PARTICIPANT: 'request',
  INPUT_REJECTED: 'request',
  REPORT_REJECTED: 'request',
  // rate / capacity
  RATE_LIMITED: 'rate',
  SERVER_FULL: 'rate',
  // backend
  INTERNAL: 'server',
} as const satisfies Record<string, ErrorCategory>;

export type ErrorCode = keyof typeof ERROR_CODES;
export const ErrorCode = z.enum(Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]);

export function errorCategory(code: ErrorCode): ErrorCategory {
  return ERROR_CODES[code];
}

/**
 * Default developer-facing messages (English, for logs and debugging).
 * Player-facing wording is the frontend's job: map `code` (and `details`)
 * to your own UI text.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  BAD_MESSAGE: 'Message is not valid JSON or not a valid envelope.',
  UNKNOWN_MESSAGE: 'Unknown message type.',
  INVALID_PAYLOAD: 'Payload does not match the schema of this message.',
  PROTOCOL_MISMATCH: 'Client and server protocol versions differ.',
  HANDSHAKE_REQUIRED: 'Send `hello` before any other message.',
  ALREADY_IN_ROOM: 'This connection is already bound to a room. Leave it first.',
  NOT_IN_ROOM: 'This connection is not bound to a room.',
  ROOM_NOT_FOUND: 'No room with this code.',
  ROOM_FULL: 'The room is full.',
  MATCH_IN_PROGRESS: 'A match is in progress in this room.',
  INVALID_PHASE: 'Not allowed in the current phase.',
  NOT_HOST: 'Only the host can do this.',
  NOT_ALL_READY: 'Every connected player must be ready.',
  NOT_ENOUGH_PLAYERS: 'Not enough players.',
  NICKNAME_INVALID: 'Nickname is empty, too short, too long or has forbidden characters.',
  NICKNAME_NOT_ALLOWED: 'Nickname is not allowed.',
  CHARACTER_INVALID: 'Unknown character id.',
  CONFIG_INVALID: 'Invalid match configuration.',
  PLAYER_NOT_FOUND: 'No such player in this room.',
  SESSION_NOT_FOUND: 'Session token unknown or expired.',
  STALE_SESSION: 'This minigame session is not the current one.',
  NOT_PARTICIPANT: 'You are not a participant of this minigame.',
  INPUT_REJECTED: 'Input refused by the minigame.',
  REPORT_REJECTED: 'Result report refused.',
  RATE_LIMITED: 'Too many messages.',
  SERVER_FULL: 'Server capacity reached.',
  INTERNAL: 'Internal server error.',
};

export const ErrorPayload = z.object({
  code: ErrorCode,
  category: z.enum(ERROR_CATEGORIES),
  message: z.string(),
  /** Machine-readable extra info, e.g. { reason: "tooLong" } for NICKNAME_INVALID. */
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type ErrorPayload = z.infer<typeof ErrorPayload>;

export function makeError(
  code: ErrorCode,
  details?: ErrorPayload['details'],
  message: string = ERROR_MESSAGES[code],
): ErrorPayload {
  return details ? { code, category: ERROR_CODES[code], message, details } : { code, category: ERROR_CODES[code], message };
}
