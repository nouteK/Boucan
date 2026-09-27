import {
  CLIENT_MESSAGES,
  CLOSE_CODES,
  ClientEnvelope,
  isClientMessageType,
  makeError,
  PROTOCOL_VERSION,
  type ErrorCode,
  type ErrorPayload,
  type ServerInfo,
  type ServerMessage,
} from '@boucan/shared';
import type { GameConfig } from '../config/game-config';
import { EngineError } from '../engine/errors';
import type { Logger } from '../engine/logger';
import type { MiniGameRegistry } from '../engine/minigames/registry';
import type { EngineOutput } from '../engine/output';
import { RoomManager, type Seat } from '../engine/room-manager';
import type { Room } from '../engine/room/room';
import { RateLimiter, WindowCounter } from '../engine/util/rate-limiter';
import { HANDLERS, type HandlerContext } from './handlers';

/** A transport-level client connection (WebSocket, in-memory…). */
export interface Connection {
  readonly id: string;
  readonly remoteAddress?: string;
  send(data: string): void;
  close(code: number, reason: string): void;
  /** Latest measured round-trip time (ms), null if unknown. */
  rttMs(): number | null;
}

export interface GatewayOptions {
  config: GameConfig;
  registry: MiniGameRegistry;
  logger: Logger;
  serverVersion: string;
  environment: ServerInfo['environment'];
  /** Server clock (injectable for tests). */
  clock?: () => number;
}

export interface ConnectionHandle {
  receive(raw: string): void;
  closed(): void;
}

interface ConnState {
  conn: Connection;
  logger: Logger;
  handshaken: boolean;
  seat: { room: Room; playerId: string } | null;
  limiter: RateLimiter;
  noticeLimiter: RateLimiter;
  protocolErrors: WindowCounter;
  handshakeTimer: ReturnType<typeof setTimeout> | null;
  open: boolean;
}

/**
 * Protocol layer, independent of the transport: parses envelopes, enforces
 * the handshake, validates payloads, rate-limits, routes to handlers,
 * answers with `reply`, and fans engine output out to connections.
 * One gateway per server process; the WebSocket server and the in-browser
 * local server both feed it Connections.
 */
export class Gateway {
  readonly manager: RoomManager;
  private readonly clock: () => number;
  private readonly connections = new Map<string, ConnState>();
  private readonly byPlayer = new Map<string, ConnState>();
  private readonly byRoom = new Map<string, Set<ConnState>>();

  constructor(private readonly options: GatewayOptions) {
    this.clock = options.clock ?? Date.now;
    this.manager = new RoomManager({
      config: options.config,
      registry: options.registry,
      logger: options.logger,
      output: this.output,
      rttOf: (playerId) => this.byPlayer.get(playerId)?.conn.rttMs() ?? 0,
    });
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  /** Advances every room. Call every `config.network.tickMs`. */
  tick(): void {
    this.manager.tick(this.clock());
  }

  serverInfo(connectionId: string): ServerInfo {
    const { config } = this.options;
    return {
      protocolVersion: PROTOCOL_VERSION,
      serverVersion: this.options.serverVersion,
      environment: this.options.environment,
      serverTime: this.clock(),
      connectionId,
      microgames: this.options.registry.ids(),
      timings: {
        stageIntroMs: config.timings.stageIntroMs,
        interludeMs: config.timings.interludeMs,
        verdictMs: config.timings.verdictMs,
      },
    };
  }

  open(conn: Connection): ConnectionHandle {
    const now = this.clock();
    const { network } = this.options.config;
    const state: ConnState = {
      conn,
      logger: this.options.logger.child({ conn: conn.id }),
      handshaken: false,
      seat: null,
      limiter: new RateLimiter(network.messageBurst, network.messagesPerSecond, now),
      noticeLimiter: new RateLimiter(5, 5, now),
      protocolErrors: new WindowCounter(network.protocolErrorWindowMs),
      handshakeTimer: null,
      open: true,
    };
    state.handshakeTimer = setTimeout(() => {
      if (!state.handshaken) this.closeConn(state, CLOSE_CODES.HANDSHAKE_TIMEOUT, 'handshake timeout');
    }, network.handshakeTimeoutMs);
    this.connections.set(conn.id, state);
    state.logger.debug('connection opened', { ip: conn.remoteAddress });
    return {
      receive: (raw) => this.receive(state, raw),
      closed: () => this.onClosed(state),
    };
  }

  /** Graceful shutdown: tells clients and closes rooms. */
  shutdown(): void {
    for (const state of [...this.connections.values()]) {
      this.closeConn(state, CLOSE_CODES.GOING_AWAY, 'server shutting down');
    }
    this.manager.closeAll();
  }

  // ─── Inbound ───────────────────────────────────────────────────────────────

  private receive(state: ConnState, raw: string): void {
    if (!state.open) return;
    const now = this.clock();
    if (raw.length > this.options.config.network.maxMessageBytes) {
      this.protocolError(state, undefined, undefined, 'BAD_MESSAGE', { reason: 'tooLarge' });
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.protocolError(state, undefined, undefined, 'BAD_MESSAGE', { reason: 'invalidJson' });
      return;
    }
    const envelope = ClientEnvelope.safeParse(json);
    if (!envelope.success) {
      const rid = typeof (json as { rid?: unknown })?.rid === 'string' ? (json as { rid: string }).rid : undefined;
      this.protocolError(state, rid, undefined, 'BAD_MESSAGE', { reason: 'invalidEnvelope' });
      return;
    }
    const { type, rid, payload } = envelope.data;

    if (!state.limiter.take(now)) {
      this.refuse(state, rid, type, makeError('RATE_LIMITED'));
      return;
    }
    if (!isClientMessageType(type)) {
      this.protocolError(state, rid, type, 'UNKNOWN_MESSAGE', { type });
      return;
    }
    if (type !== 'hello' && !state.handshaken) {
      this.protocolError(state, rid, type, 'HANDSHAKE_REQUIRED');
      return;
    }
    const parsed = CLIENT_MESSAGES[type].payload.safeParse(payload ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      this.protocolError(state, rid, type, 'INVALID_PAYLOAD', {
        path: issue?.path.join('.') ?? '',
        issue: issue?.code ?? 'unknown',
        detail: issue?.message ?? '',
      });
      return;
    }

    if (type === 'hello') {
      this.hello(state, rid, parsed.data as { protocolVersion: number; client?: string });
      return;
    }

    try {
      const handler = HANDLERS[type] as (ctx: HandlerContext, p: unknown) => unknown;
      const reply = handler(this.context(state, now), parsed.data);
      if (rid !== undefined) this.send(state, { type: 'reply', rid, ok: true, payload: reply });
    } catch (error) {
      if (error instanceof EngineError) {
        state.logger.debug(`${type} refused: ${error.code}`, { player: state.seat?.playerId, ...error.details });
        this.refuse(state, rid, type, error.toPayload());
      } else {
        state.logger.error(`${type} failed`, { player: state.seat?.playerId, room: state.seat?.room.code }, error);
        this.refuse(state, rid, type, makeError('INTERNAL'));
      }
    }
  }

  private hello(state: ConnState, rid: string | undefined, payload: { protocolVersion: number; client?: string }): void {
    if (payload.protocolVersion !== PROTOCOL_VERSION) {
      state.logger.warn('protocol mismatch', { client: payload.client, clientVersion: payload.protocolVersion });
      this.refuse(
        state,
        rid,
        'hello',
        makeError('PROTOCOL_MISMATCH', { serverVersion: PROTOCOL_VERSION, clientVersion: payload.protocolVersion }),
      );
      this.closeConn(state, CLOSE_CODES.PROTOCOL_MISMATCH, 'protocol mismatch');
      return;
    }
    state.handshaken = true;
    if (state.handshakeTimer !== null) clearTimeout(state.handshakeTimer);
    state.handshakeTimer = null;
    state.logger.debug('handshake ok', { client: payload.client });
    if (rid !== undefined) {
      this.send(state, { type: 'reply', rid, ok: true, payload: this.serverInfo(state.conn.id) });
    }
  }

  private context(state: ConnState, now: number): HandlerContext {
    return {
      now,
      manager: this.manager,
      seat: state.seat,
      bind: (seat) => this.bind(state, seat),
      unbind: () => this.unbind(state),
    };
  }

  // ─── Seats ─────────────────────────────────────────────────────────────────

  private bind(state: ConnState, seat: Seat): void {
    const previous = this.byPlayer.get(seat.playerId);
    if (previous !== undefined && previous !== state) {
      // Same player opened another tab / reconnected: the old connection loses the seat.
      this.unbind(previous);
      this.send(previous, { type: 'session.ended', payload: { reason: 'replaced' } });
      this.closeConn(previous, CLOSE_CODES.SESSION_REPLACED, 'session replaced');
    }
    state.seat = { room: seat.room, playerId: seat.playerId };
    this.byPlayer.set(seat.playerId, state);
    let members = this.byRoom.get(seat.room.code);
    if (!members) this.byRoom.set(seat.room.code, (members = new Set()));
    members.add(state);
    state.logger = this.options.logger.child({ conn: state.conn.id, room: seat.room.code, player: seat.playerId });
    // A player joining mid-minigame needs the current shared state right away.
    const latest = seat.room.latestMiniGameState();
    if (latest) this.send(state, { type: 'minigame.state', payload: latest });
  }

  private unbind(state: ConnState): void {
    const seat = state.seat;
    if (seat === null) return;
    state.seat = null;
    if (this.byPlayer.get(seat.playerId) === state) this.byPlayer.delete(seat.playerId);
    const members = this.byRoom.get(seat.room.code);
    members?.delete(state);
    if (members?.size === 0) this.byRoom.delete(seat.room.code);
    state.logger = this.options.logger.child({ conn: state.conn.id });
  }

  private onClosed(state: ConnState): void {
    if (!this.connections.has(state.conn.id)) return;
    state.open = false;
    if (state.handshakeTimer !== null) clearTimeout(state.handshakeTimer);
    this.connections.delete(state.conn.id);
    const seat = state.seat;
    this.unbind(state);
    if (seat !== null && !this.byPlayer.has(seat.playerId)) {
      this.manager.disconnect(seat.room.code, seat.playerId, this.clock());
    }
    state.logger.debug('connection closed');
  }

  // ─── Outbound ──────────────────────────────────────────────────────────────

  private readonly output: EngineOutput = {
    snapshot: (code, snapshot) => this.toRoom(code, { type: 'room.snapshot', payload: snapshot }),
    roomEvent: (code, event) => this.toRoom(code, { type: 'room.event', payload: event }),
    minigameState: (code, message) => this.toRoom(code, { type: 'minigame.state', payload: message }),
    minigameEvent: (code, message, to) => {
      const msg: ServerMessage = { type: 'minigame.event', payload: message };
      if (to === undefined) this.toRoom(code, msg);
      else {
        const state = this.byPlayer.get(to);
        if (state) this.send(state, msg);
      }
    },
    sessionEnded: (playerId, reason) => {
      const state = this.byPlayer.get(playerId);
      if (!state) return;
      this.unbind(state);
      this.send(state, { type: 'session.ended', payload: { reason } });
    },
  };

  private toRoom(code: string, message: ServerMessage): void {
    const members = this.byRoom.get(code);
    if (!members || members.size === 0) return;
    const data = JSON.stringify(message);
    for (const state of members) this.sendRaw(state, data);
  }

  private send(state: ConnState, message: ServerMessage): void {
    this.sendRaw(state, JSON.stringify(message));
  }

  private sendRaw(state: ConnState, data: string): void {
    if (!state.open) return;
    try {
      state.conn.send(data);
    } catch (error) {
      state.logger.warn('send failed', { error: String(error) });
    }
  }

  private refuse(state: ConnState, rid: string | undefined, about: string | undefined, error: ErrorPayload): void {
    if (rid !== undefined) {
      this.send(state, { type: 'reply', rid, ok: false, error });
    } else if (state.noticeLimiter.take(this.clock())) {
      this.send(state, { type: 'error', payload: about === undefined ? error : { ...error, about } });
    }
  }

  private protocolError(
    state: ConnState,
    rid: string | undefined,
    about: string | undefined,
    code: ErrorCode,
    details?: ErrorPayload['details'],
  ): void {
    state.logger.debug(`protocol error ${code}`, { about, ...details });
    this.refuse(state, rid, about, makeError(code, details));
    const count = state.protocolErrors.hit(this.clock());
    if (count > this.options.config.network.maxProtocolErrors) {
      state.logger.warn('too many protocol errors, closing connection', { count });
      this.closeConn(state, CLOSE_CODES.TOO_MANY_ERRORS, 'too many protocol errors');
    }
  }

  private closeConn(state: ConnState, code: number, reason: string): void {
    if (!state.open) return;
    try {
      state.conn.close(code, reason);
    } catch {
      // already closed
    }
    this.onClosed(state);
  }
}
