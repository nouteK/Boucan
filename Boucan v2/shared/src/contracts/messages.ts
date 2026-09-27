import { z } from 'zod';
import { ErrorPayload } from './errors';
import { MatchConfig, PlayerResult, RoomSnapshot, ServerInfo } from './model';
import type { MatchPhase } from './phases';
import {
  CharacterId,
  JsonValue,
  PlayerId,
  RequestId,
  RoomCode,
  Timestamp,
  TypedPayload,
} from './primitives';

const RoundId = z.string().min(1).max(64);

/*
 * Wire format: one JSON object per WebSocket text frame.
 *
 *   client → server : { "type": "<message>", "rid"?: "<id>", "payload"?: {...} }
 *   server → client : { "type": "<message>", "payload": {...} }
 *                     { "type": "reply", "rid": "<id>", "ok": true,  "payload": {...} }
 *                     { "type": "reply", "rid": "<id>", "ok": false, "error": ErrorPayload }
 *
 * A client message with a `rid` always gets exactly one `reply`. Without a
 * `rid`, successes are silent and failures come back as an `error` message.
 * Human documentation: docs/PROTOCOL.md.
 */

// ─── Envelopes ───────────────────────────────────────────────────────────────

export const ClientEnvelope = z.object({
  type: z.string().min(1).max(48),
  rid: RequestId.optional(),
  payload: z.unknown().optional(),
});
export type ClientEnvelope = z.infer<typeof ClientEnvelope>;

// ─── Client → server payloads ────────────────────────────────────────────────

const Nickname = z.string().max(200); // real rules: rules/nickname.ts (server-side check)

export const HelloPayload = z.object({
  protocolVersion: z.number().int(),
  /** Free-form client description for server logs, e.g. "web/1.0". */
  client: z.string().max(64).optional(),
});

export const TimeSyncPayload = z.object({ t0: z.number() });
export const TimeSyncReply = z.object({ t0: z.number(), serverTime: Timestamp });

export const CreateRoomPayload = z.object({
  nickname: Nickname,
  characterId: CharacterId.optional(),
  config: MatchConfig.partial().optional(),
});
export const JoinRoomPayload = z.object({
  code: RoomCode,
  nickname: Nickname,
  characterId: CharacterId.optional(),
});
export const ResumePayload = z.object({ sessionToken: z.string().min(1).max(128) });

/** Reply to room.create / room.join / room.resume. Keep `sessionToken` to resume after a disconnect. */
export const JoinedReply = z.object({
  playerId: PlayerId,
  sessionToken: z.string(),
  snapshot: RoomSnapshot,
});
export type JoinedReply = z.infer<typeof JoinedReply>;

export const UpdatePlayerPayload = z
  .object({ nickname: Nickname.optional(), characterId: CharacterId.nullable().optional() })
  .refine((p) => p.nickname !== undefined || p.characterId !== undefined, 'nothing to update');
export const ReadyPayload = z.object({ ready: z.boolean() });
export const KickPayload = z.object({ playerId: PlayerId });
export const ConfigureMatchPayload = MatchConfig.partial().refine(
  (p) => Object.keys(p).length > 0,
  'nothing to configure',
);
export const MiniGameInputPayload = z.object({
  roundId: RoundId,
  /** Duel-specific input, validated by the server module. */
  input: JsonValue,
  /** Client estimate of the server time when the input happened (clock-synced). Optional. */
  at: Timestamp.optional(),
  /** Optional client sequence number, echoed in relayed events. */
  seq: z.number().int().nonnegative().optional(),
});
export const MiniGameReportPayload = z.object({ roundId: RoundId, result: PlayerResult });

const Empty = z.object({}).optional();
const Nothing = z.object({});

// ─── Client message catalog ──────────────────────────────────────────────────

interface ClientMessageSpec {
  payload: z.ZodType;
  reply: z.ZodType;
  /** Must the connection be bound to a room? */
  requiresRoom: boolean;
  /** Phases in which the message is valid ('any' = always). Informative; enforced by the server. */
  phases: readonly MatchPhase[] | 'any';
  hostOnly: boolean;
}

function spec<P extends z.ZodType, R extends z.ZodType>(
  payload: P,
  reply: R,
  opts: Partial<Omit<ClientMessageSpec, 'payload' | 'reply'>> = {},
) {
  return {
    payload,
    reply,
    requiresRoom: opts.requiresRoom ?? true,
    phases: opts.phases ?? 'any',
    hostOnly: opts.hostOnly ?? false,
  } as const;
}

export const CLIENT_MESSAGES = {
  /** Handshake. Must be the first message of a connection. */
  hello: spec(HelloPayload, ServerInfo, { requiresRoom: false }),
  /** Clock sync sample (NTP-like). Valid anytime after hello. */
  'time.sync': spec(TimeSyncPayload, TimeSyncReply, { requiresRoom: false }),
  'room.create': spec(CreateRoomPayload, JoinedReply, { requiresRoom: false }),
  'room.join': spec(JoinRoomPayload, JoinedReply, { requiresRoom: false }),
  'room.resume': spec(ResumePayload, JoinedReply, { requiresRoom: false }),
  'room.leave': spec(Empty, Nothing),
  'room.kick': spec(KickPayload, Nothing, { phases: ['LOBBY'], hostOnly: true }),
  /** Adds a server-run bot (host, lobby). Remove it with room.kick. */
  'room.addBot': spec(Empty, Nothing, { phases: ['LOBBY'], hostOnly: true }),
  'player.update': spec(UpdatePlayerPayload, Nothing, { phases: ['LOBBY'] }),
  'player.ready': spec(ReadyPayload, Nothing, { phases: ['LOBBY'] }),
  'match.configure': spec(ConfigureMatchPayload, Nothing, { phases: ['LOBBY'], hostOnly: true }),
  'match.start': spec(Empty, Nothing, { phases: ['LOBBY'], hostOnly: true }),
  'match.abort': spec(Empty, Nothing, { hostOnly: true }),
  'match.returnToLobby': spec(Empty, Nothing, { phases: ['STAGE_RESULTS'], hostOnly: true }),
  /** Duel input (server-simulated microgames). */
  'minigame.input': spec(MiniGameInputPayload, Nothing, { phases: ['MICROGAME'] }),
  /** Outcome of a solo / boss microgame, sent as soon as it is decided. */
  'minigame.report': spec(MiniGameReportPayload, Nothing, { phases: ['MICROGAME'] }),
} as const;

export type ClientMessageType = keyof typeof CLIENT_MESSAGES;
export type ClientPayload<T extends ClientMessageType> = z.input<(typeof CLIENT_MESSAGES)[T]['payload']>;
export type ClientReply<T extends ClientMessageType> = z.output<(typeof CLIENT_MESSAGES)[T]['reply']>;

export function isClientMessageType(type: string): type is ClientMessageType {
  return Object.hasOwn(CLIENT_MESSAGES, type);
}

// ─── Server → client ─────────────────────────────────────────────────────────

/** Why the server ended this connection's seat. The client should go back to its home screen. */
export const SessionEndReason = z.enum(['kicked', 'replaced', 'expired', 'roomClosed']);
export type SessionEndReason = z.infer<typeof SessionEndReason>;

export const RoomEvent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('playerJoined'), playerId: PlayerId }),
  z.object({
    kind: z.literal('playerLeft'),
    playerId: PlayerId,
    reason: z.enum(['left', 'kicked', 'timeout']),
  }),
  z.object({ kind: z.literal('playerDisconnected'), playerId: PlayerId }),
  z.object({ kind: z.literal('playerReconnected'), playerId: PlayerId }),
  z.object({
    kind: z.literal('hostChanged'),
    hostId: PlayerId.nullable(),
    previousHostId: PlayerId.nullable(),
  }),
  z.object({
    kind: z.literal('phaseChanged'),
    phase: z.string(),
    previousPhase: z.string(),
    counter: z.number().int(),
  }),
  z.object({ kind: z.literal('matchAborted'), reason: z.enum(['host', 'noPlayers']) }),
]);
export type RoomEvent = z.infer<typeof RoomEvent>;

export const MiniGameStateMessage = z.object({
  roundId: RoundId,
  /** Increases by one per state message of the session. */
  seq: z.number().int().min(1),
  serverTime: Timestamp,
  /** Module-specific shared state (relay / server authority). */
  state: JsonValue,
});
export type MiniGameStateMessage = z.infer<typeof MiniGameStateMessage>;

export const MiniGameEventMessage = z.object({
  roundId: RoundId,
  serverTime: Timestamp,
  /** Semantic event, e.g. { type: "bellRang", kind: "real" }. Never a sound file or animation name. */
  event: TypedPayload,
});
export type MiniGameEventMessage = z.infer<typeof MiniGameEventMessage>;

export const ReplyMessage = z.union([
  z.object({ type: z.literal('reply'), rid: RequestId, ok: z.literal(true), payload: z.unknown() }),
  z.object({ type: z.literal('reply'), rid: RequestId, ok: z.literal(false), error: ErrorPayload }),
]);
export type ReplyMessage = z.infer<typeof ReplyMessage>;

export const PushMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room.snapshot'), payload: RoomSnapshot }),
  z.object({ type: z.literal('room.event'), payload: RoomEvent }),
  z.object({ type: z.literal('minigame.state'), payload: MiniGameStateMessage }),
  z.object({ type: z.literal('minigame.event'), payload: MiniGameEventMessage }),
  z.object({
    type: z.literal('error'),
    payload: ErrorPayload.extend({ about: z.string().optional() }),
  }),
  z.object({ type: z.literal('session.ended'), payload: z.object({ reason: SessionEndReason }) }),
]);
export type PushMessage = z.infer<typeof PushMessage>;

/** Any server → client message. */
export const ServerMessage = z.union([ReplyMessage, PushMessage]);
export type ServerMessage = z.infer<typeof ServerMessage>;
export type ServerPushType = Exclude<ServerMessage['type'], 'reply'>;
export type ServerPush<T extends ServerPushType> = Extract<ServerMessage, { type: T }>['payload'];

/** WebSocket close codes used by the server (4000-4999 = application range). */
export const CLOSE_CODES = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_MISMATCH: 4000,
  HANDSHAKE_TIMEOUT: 4001,
  SESSION_REPLACED: 4002,
  KICKED: 4003,
  TOO_MANY_ERRORS: 4008,
  SERVER_FULL: 4009,
} as const;
