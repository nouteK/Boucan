import type { z } from 'zod';
import type { CLIENT_MESSAGES, ClientMessageType, JoinedReply } from '@boucan/shared';
import { fail } from '../engine/errors';
import type { RoomManager, Seat } from '../engine/room-manager';
import type { Room } from '../engine/room/room';

/** What a handler may do on the connection that sent the message. */
export interface HandlerContext {
  readonly now: number;
  readonly manager: RoomManager;
  /** Current seat of the connection, or null. */
  readonly seat: { room: Room; playerId: string } | null;
  bind(seat: Seat): void;
  unbind(): void;
}

type Payload<T extends ClientMessageType> = z.output<(typeof CLIENT_MESSAGES)[T]['payload']>;
type Reply<T extends ClientMessageType> = z.input<(typeof CLIENT_MESSAGES)[T]['reply']>;
type Handler<T extends ClientMessageType> = (ctx: HandlerContext, payload: Payload<T>) => Reply<T>;

function seated(ctx: HandlerContext): { room: Room; playerId: string } {
  if (ctx.seat === null) fail('NOT_IN_ROOM');
  return ctx.seat;
}

function joined(ctx: HandlerContext, seat: Seat): JoinedReply {
  ctx.bind(seat);
  return { playerId: seat.playerId, sessionToken: seat.sessionToken, snapshot: seat.room.snapshot(ctx.now) };
}

/**
 * Message → engine command. Validation of the envelope and payload already
 * happened in the gateway; game rules are enforced by the engine.
 * `hello` is handled by the gateway itself (handshake state).
 */
export const HANDLERS: { [T in Exclude<ClientMessageType, 'hello'>]: Handler<T> } = {
  'time.sync': (ctx, p) => ({ t0: p.t0, serverTime: ctx.now }),

  'room.create': (ctx, p) => {
    if (ctx.seat !== null) fail('ALREADY_IN_ROOM');
    return joined(ctx, ctx.manager.createRoom(p, ctx.now));
  },

  'room.join': (ctx, p) => {
    if (ctx.seat !== null) fail('ALREADY_IN_ROOM');
    return joined(ctx, ctx.manager.joinRoom(p, ctx.now));
  },

  'room.resume': (ctx, p) => {
    const seat = ctx.manager.resume(p.sessionToken, ctx.now);
    if (ctx.seat !== null && ctx.seat.playerId !== seat.playerId) fail('ALREADY_IN_ROOM');
    return joined(ctx, seat);
  },

  'room.leave': (ctx) => {
    const { room, playerId } = seated(ctx);
    ctx.unbind();
    ctx.manager.leave(room.code, playerId, ctx.now);
    return {};
  },

  'room.addBot': (ctx) => {
    const { room, playerId } = seated(ctx);
    room.addBot(playerId, ctx.now);
    return {};
  },

  'room.kick': (ctx, p) => {
    const { room, playerId } = seated(ctx);
    room.kick(playerId, p.playerId, ctx.now);
    return {};
  },

  'player.update': (ctx, p) => {
    const { room, playerId } = seated(ctx);
    room.updatePlayer(playerId, p, ctx.now);
    return {};
  },

  'player.ready': (ctx, p) => {
    const { room, playerId } = seated(ctx);
    room.setReady(playerId, p.ready, ctx.now);
    return {};
  },

  'match.configure': (ctx, p) => {
    const { room, playerId } = seated(ctx);
    room.configure(playerId, p, ctx.now);
    return {};
  },

  'match.start': (ctx) => {
    const { room, playerId } = seated(ctx);
    room.start(playerId, ctx.now);
    return {};
  },

  'match.abort': (ctx) => {
    const { room, playerId } = seated(ctx);
    room.abort(playerId, ctx.now);
    return {};
  },

  'match.returnToLobby': (ctx) => {
    const { room, playerId } = seated(ctx);
    room.returnToLobby(playerId, ctx.now);
    return {};
  },

  'minigame.input': (ctx, p) => {
    const { room, playerId } = seated(ctx);
    room.minigameInput(playerId, p.roundId, p.input, p.at, ctx.now);
    return {};
  },

  'minigame.report': (ctx, p) => {
    const { room, playerId } = seated(ctx);
    room.minigameReport(playerId, p.roundId, p.result, ctx.now);
    return {};
  },
};
