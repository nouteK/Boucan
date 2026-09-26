import {
  CLOSE_CODES,
  CONTRACT_REVISION,
  PROTOCOL_VERSION,
  ServerMessage,
  type ClientMessageType,
  type ClientPayload,
  type ClientReply,
  type JoinedReply,
  type JsonValue,
  type MatchConfig,
  type MiniGameEventMessage,
  type MiniGameStateMessage,
  type PlayerResult,
  type RoomEvent,
  type RoomSnapshot,
  type ServerInfo,
  type SessionEndReason,
} from '@boucan/shared';
import { ServerClock } from './clock';
import { Emitter } from './emitter';
import { BoucanError } from './errors';
import { webSocketTransport, type Transport, type TransportFactory } from './transport';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

/** Where the session token survives a page reload. The SDK never picks a storage for you. */
export interface SessionStore {
  get(): string | null;
  set(token: string | null): void;
}

export interface BoucanClientOptions {
  /** WebSocket URL, e.g. "ws://localhost:3001/ws". Ignored when `transport` is given. */
  url?: string;
  /** Custom transport (in-memory local server, tests). */
  transport?: TransportFactory;
  /** Sent in `hello` for server logs, e.g. "astra-web/0.1.0". */
  clientName?: string;
  /** Default 8000 ms. */
  requestTimeoutMs?: number;
  /** Reconnect automatically after an unexpected disconnection. Default true. */
  autoReconnect?: boolean;
  /** Validate every server message against the contract (recommended in dev). Default true. */
  validateIncoming?: boolean;
  sessionStore?: SessionStore;
}

export interface BoucanClientEvents extends Record<string, unknown[]> {
  status: [status: ConnectionStatus];
  /** New room state. `previous` is the state before (null on the first one). */
  snapshot: [snapshot: RoomSnapshot, previous: RoomSnapshot | null];
  roomEvent: [event: RoomEvent];
  minigameState: [message: MiniGameStateMessage];
  minigameEvent: [message: MiniGameEventMessage];
  /** The seat is gone (kicked, replaced by another tab, expired, room closed). */
  sessionEnded: [reason: SessionEndReason];
  /** Errors not tied to a request (pushed `error`, contract violations, connection loss). */
  error: [error: BoucanError];
  /** Non-fatal notice (e.g. contract revision differs). */
  warning: [message: string];
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: BoucanError): void;
  timer: ReturnType<typeof setTimeout>;
  type: string;
}

const NO_RECONNECT = new Set<number>([
  CLOSE_CODES.PROTOCOL_MISMATCH,
  CLOSE_CODES.SESSION_REPLACED,
  CLOSE_CODES.TOO_MANY_ERRORS,
  CLOSE_CODES.KICKED,
]);

/**
 * Reference client for the BOUCAN protocol — the single place where a
 * frontend talks to the backend. Framework-agnostic, zero UI.
 * Usage guide: docs/integration/FRONTEND_BACKEND.md.
 */
export class BoucanClient extends Emitter<BoucanClientEvents> {
  readonly clock = new ServerClock();
  private readonly factory: TransportFactory;
  private readonly options: Required<Omit<BoucanClientOptions, 'url' | 'transport' | 'sessionStore'>>;
  private readonly store: SessionStore;
  private transport: Transport | null = null;
  private pending = new Map<string, Pending>();
  private ridCounter = 0;
  private _status: ConnectionStatus = 'idle';
  private _serverInfo: ServerInfo | null = null;
  private _snapshot: RoomSnapshot | null = null;
  private _playerId: string | null = null;
  private manualClose = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private inputSeq = 0;

  constructor(options: BoucanClientOptions) {
    super();
    if (!options.transport && !options.url) throw new Error('BoucanClient needs `url` or `transport`');
    this.factory = options.transport ?? webSocketTransport(options.url!);
    this.options = {
      clientName: options.clientName ?? 'boucan-sdk',
      requestTimeoutMs: options.requestTimeoutMs ?? 8_000,
      autoReconnect: options.autoReconnect ?? true,
      validateIncoming: options.validateIncoming ?? true,
    };
    let memory: string | null = null;
    this.store = options.sessionStore ?? { get: () => memory, set: (t) => (memory = t) };
  }

  // ─── State ─────────────────────────────────────────────────────────────────

  get status(): ConnectionStatus {
    return this._status;
  }
  get serverInfo(): ServerInfo | null {
    return this._serverInfo;
  }
  /** Latest room state, null when not in a room. */
  get snapshot(): RoomSnapshot | null {
    return this._snapshot;
  }
  /** Your player id in the current room. */
  get playerId(): string | null {
    return this._playerId;
  }
  get sessionToken(): string | null {
    return this.store.get();
  }
  /** Estimated server time (ms). Use it for every countdown / timer. */
  serverNow(): number {
    return this.clock.now();
  }

  // ─── Connection ────────────────────────────────────────────────────────────

  /** Opens the connection, performs the handshake and syncs the clock. */
  async connect(): Promise<ServerInfo> {
    this.manualClose = false;
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    const transport = this.factory();
    try {
      await transport.open({
        onMessage: (data) => this.onMessage(data),
        onClose: (code, reason) => this.onClose(transport, code, reason),
      });
    } catch (error) {
      this.setStatus('closed');
      throw BoucanError.network('CONNECTION_FAILED', error instanceof Error ? error.message : String(error));
    }
    this.transport = transport;
    const info = await this.request('hello', { protocolVersion: PROTOCOL_VERSION, client: this.options.clientName });
    this._serverInfo = info;
    if (info.contractRevision !== CONTRACT_REVISION) {
      this.emit('warning', `Contract revision differs: SDK ${CONTRACT_REVISION}, server ${info.contractRevision} (compatible, but check docs/handoff/CLAUDE_TO_ASTRA.md).`);
    }
    await this.syncClock(5);
    this.syncTimer ??= setInterval(() => void this.syncClock(1).catch(() => {}), 30_000);
    this.setStatus('connected');
    this.reconnectAttempt = 0;
    return info;
  }

  /** Closes the connection for good (no reconnection). Keeps the session token. */
  disconnect(): void {
    this.manualClose = true;
    this.clearTimers();
    this.transport?.close(CLOSE_CODES.NORMAL, 'client disconnect');
    this.transport = null;
    this.failPending(BoucanError.network('CONNECTION_LOST', 'disconnected by the client'));
    this.setStatus('closed');
  }

  /** Takes `n` clock samples (5 on connect, 1 every 30 s). */
  async syncClock(n = 1): Promise<void> {
    for (let i = 0; i < n; i++) {
      const t0 = Date.now();
      const reply = await this.request('time.sync', { t0 });
      this.clock.add(reply.t0, reply.serverTime, Date.now());
    }
  }

  // ─── Room ──────────────────────────────────────────────────────────────────

  createRoom(payload: ClientPayload<'room.create'>): Promise<JoinedReply> {
    return this.request('room.create', payload).then((r) => this.onJoined(r));
  }

  joinRoom(payload: ClientPayload<'room.join'>): Promise<JoinedReply> {
    return this.request('room.join', payload).then((r) => this.onJoined(r));
  }

  /** Re-binds to the seat of `sessionToken` (default: the stored token). */
  resume(sessionToken = this.store.get()): Promise<JoinedReply> {
    if (!sessionToken) return Promise.reject(new BoucanError('SESSION_NOT_FOUND', 'request', 'No session token to resume'));
    return this.request('room.resume', { sessionToken }).then((r) => this.onJoined(r));
  }

  async leaveRoom(): Promise<void> {
    await this.request('room.leave', {});
    this.clearRoom();
  }

  setReady(ready: boolean): Promise<void> {
    return this.request('player.ready', { ready }).then(() => undefined);
  }

  updatePlayer(update: { nickname?: string; characterId?: string | null }): Promise<void> {
    return this.request('player.update', update).then(() => undefined);
  }

  kick(playerId: string): Promise<void> {
    return this.request('room.kick', { playerId }).then(() => undefined);
  }

  configureMatch(config: Partial<MatchConfig>): Promise<void> {
    return this.request('match.configure', config).then(() => undefined);
  }

  startMatch(): Promise<void> {
    return this.request('match.start', {}).then(() => undefined);
  }

  abortMatch(): Promise<void> {
    return this.request('match.abort', {}).then(() => undefined);
  }

  returnToLobby(): Promise<void> {
    return this.request('match.returnToLobby', {}).then(() => undefined);
  }

  // ─── Minigames ─────────────────────────────────────────────────────────────

  /** "My assets are loaded" for the current (or given) minigame session. */
  minigameReady(sessionId = this.currentSessionId()): Promise<void> {
    return this.request('minigame.ready', { sessionId }).then(() => undefined);
  }

  /**
   * Sends a gameplay input, fire-and-forget (no reply: refusals arrive as
   * `error` events). `at` defaults to the synced server time of the call.
   */
  sendInput(input: JsonValue, options: { at?: number; sessionId?: string } = {}): void {
    this.post('minigame.input', {
      sessionId: options.sessionId ?? this.currentSessionId(),
      input,
      at: Math.round(options.at ?? this.serverNow()),
      seq: ++this.inputSeq,
    });
  }

  /** Same as sendInput but awaits the server's verdict (useful for debugging). */
  sendInputChecked(input: JsonValue, options: { at?: number; sessionId?: string } = {}): Promise<void> {
    return this.request('minigame.input', {
      sessionId: options.sessionId ?? this.currentSessionId(),
      input,
      at: Math.round(options.at ?? this.serverNow()),
      seq: ++this.inputSeq,
    }).then(() => undefined);
  }

  /** Final result of a `local` minigame (once per session). */
  reportResult(result: PlayerResult, sessionId = this.currentSessionId()): Promise<void> {
    return this.request('minigame.report', { sessionId, result }).then(() => undefined);
  }

  // ─── Low level ─────────────────────────────────────────────────────────────

  /** Typed request/response for any client message. */
  request<T extends ClientMessageType>(type: T, payload: ClientPayload<T>): Promise<ClientReply<T>> {
    const transport = this.transport;
    if (!transport) return Promise.reject(BoucanError.network('NOT_CONNECTED', 'call connect() first', type));
    const rid = `r${++this.ridCounter}`;
    return new Promise<ClientReply<T>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        reject(BoucanError.network('TIMEOUT', `no reply to ${type} within ${this.options.requestTimeoutMs} ms`, type));
      }, this.options.requestTimeoutMs);
      this.pending.set(rid, { resolve: resolve as (v: unknown) => void, reject, timer, type });
      transport.send(JSON.stringify({ type, rid, payload }));
    });
  }

  /** Fire-and-forget message (no rid). */
  post<T extends ClientMessageType>(type: T, payload: ClientPayload<T>): void {
    this.transport?.send(JSON.stringify({ type, payload }));
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private currentSessionId(): string {
    const id = this._snapshot?.match.minigame?.sessionId;
    if (!id) throw new BoucanError('INVALID_PHASE', 'request', 'No minigame session in progress');
    return id;
  }

  private onJoined(reply: JoinedReply): JoinedReply {
    this._playerId = reply.playerId;
    this.store.set(reply.sessionToken);
    this.applySnapshot(reply.snapshot, true);
    return reply;
  }

  private clearRoom(): void {
    this._playerId = null;
    this._snapshot = null;
    this.store.set(null);
  }

  private applySnapshot(snapshot: RoomSnapshot, force = false): void {
    const previous = this._snapshot;
    const sameRoom = previous?.lobby.code === snapshot.lobby.code;
    // Out-of-order or duplicate snapshots are ignored (rev only grows within a room).
    if (!force && sameRoom && snapshot.rev <= previous.rev) return;
    this._snapshot = snapshot;
    this.emit('snapshot', snapshot, previous);
  }

  private onMessage(data: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      this.emit('error', new BoucanError('CONTRACT_VIOLATION', 'protocol', 'Server sent invalid JSON'));
      return;
    }
    let message: ServerMessage;
    if (this.options.validateIncoming) {
      const parsed = ServerMessage.safeParse(raw);
      if (!parsed.success) {
        const type = (raw as { type?: string })?.type;
        // Unknown push types are allowed (additive contract changes): ignore them.
        if (typeof type === 'string' && !KNOWN_PUSH.has(type) && type !== 'reply') return;
        this.emit('error', new BoucanError('CONTRACT_VIOLATION', 'protocol', `Server message "${type}" does not match the contract: ${parsed.error.issues[0]?.message ?? ''}`, { path: parsed.error.issues[0]?.path.join('.') ?? '' }));
        return;
      }
      message = parsed.data;
    } else {
      message = raw as ServerMessage;
    }

    switch (message.type) {
      case 'reply': {
        const pending = this.pending.get(message.rid);
        if (!pending) return;
        this.pending.delete(message.rid);
        clearTimeout(pending.timer);
        if (message.ok) pending.resolve(message.payload);
        else pending.reject(BoucanError.fromPayload(message.error, pending.type));
        return;
      }
      case 'room.snapshot':
        this.applySnapshot(message.payload);
        return;
      case 'room.event':
        this.emit('roomEvent', message.payload);
        return;
      case 'minigame.state':
        this.emit('minigameState', message.payload);
        return;
      case 'minigame.event':
        this.emit('minigameEvent', message.payload);
        return;
      case 'error':
        this.emit('error', BoucanError.fromPayload(message.payload));
        return;
      case 'session.ended':
        this.clearRoom();
        this.emit('sessionEnded', message.payload.reason);
        return;
    }
  }

  private onClose(transport: Transport, code: number, reason: string): void {
    if (transport !== this.transport) return;
    this.transport = null;
    this.failPending(BoucanError.network('CONNECTION_LOST', `connection closed (${code} ${reason})`));
    if (this.manualClose) return;
    if (code === CLOSE_CODES.PROTOCOL_MISMATCH) {
      this.emit('error', new BoucanError('PROTOCOL_MISMATCH', 'protocol', `Server refused protocol ${PROTOCOL_VERSION}: update the SDK / frontend.`));
    } else {
      this.emit('error', BoucanError.network('CONNECTION_LOST', `connection closed (${code}${reason ? ` ${reason}` : ''})`));
    }
    if (!this.options.autoReconnect || NO_RECONNECT.has(code)) {
      this.clearTimers();
      this.setStatus('closed');
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.setStatus('reconnecting');
    const delay = Math.min(5_000, 300 * 2 ** this.reconnectAttempt) + Math.random() * 200;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => void this.reconnect(), delay);
  }

  private async reconnect(): Promise<void> {
    if (this.manualClose) return;
    try {
      await this.connect();
      const token = this.store.get();
      if (token) {
        try {
          await this.resume(token);
        } catch (error) {
          if (error instanceof BoucanError && error.code === 'SESSION_NOT_FOUND') {
            this.clearRoom();
            this.emit('sessionEnded', 'expired');
          } else throw error;
        }
      }
    } catch {
      if (this.reconnectAttempt < 30) this.scheduleReconnect();
      else this.setStatus('closed');
    }
  }

  private failPending(error: BoucanError): void {
    for (const [rid, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new BoucanError(error.code, error.category, error.message, undefined, p.type));
      this.pending.delete(rid);
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.reconnectTimer = null;
    this.syncTimer = null;
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this._status) return;
    this._status = status;
    this.emit('status', status);
  }
}

const KNOWN_PUSH = new Set(['room.snapshot', 'room.event', 'minigame.state', 'minigame.event', 'error', 'session.ended']);
