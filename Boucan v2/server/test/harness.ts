import {
  createRng,
  PROTOCOL_VERSION,
  ServerMessage,
  type ClientMessageType,
  type ClientPayload,
  type JsonValue,
  type MatchPhase,
  type PlayerResult,
  type RoomEvent,
  type RoomSnapshot,
  type TypedPayload,
} from '@boucan/shared';
import { resolveGameConfig, type GameConfigOverrides } from '../src/config/game-config';
import type { MiniGameModule } from '../src/engine/minigames/api';
import { genericBot, type BotApi } from '../src/engine/minigames/bot-api';
import { MINIGAME_BOTS, MINIGAME_MODULES } from '../src/engine/minigames/catalog';
import { MiniGameRegistry } from '../src/engine/minigames/registry';
import { silentLogger } from '../src/engine/logger';
import { Gateway, type ConnectionHandle } from '../src/gateway/gateway';

/**
 * Synchronous test harness: a Gateway fed by in-memory connections and a
 * fake clock. Every server message is validated against the contract
 * (ServerMessage schema) — a malformed message fails the test immediately.
 */

/** Short, deterministic timings so full matches run in a few thousand fake ms. */
export const FAST_TIMINGS = {
  matchStartingMs: 100,
  preparingMinMs: 100,
  preparingMaxMs: 1_000,
  countdownMs: 300,
  endingMinMs: 50,
  reportGraceMs: 300,
  resultsMs: 200,
  intermissionMs: 100,
  matchResultsMs: null,
} as const;

export interface HarnessOptions {
  config?: GameConfigOverrides;
  modules?: readonly MiniGameModule[];
  enabled?: string[] | null;
  /** RTT reported for every connection. */
  rtt?: number;
}

type Scheduled = { at: number; fn: () => void; owner: TestClient };

export class Harness {
  now = 1_700_000_000_000;
  readonly gateway: Gateway;
  readonly tickMs: number;
  private seq = 0;
  private scheduled: Scheduled[] = [];
  readonly clients: TestClient[] = [];
  /** Contract violations detected in server messages. */
  readonly violations: string[] = [];

  assertContract(): void {
    if (this.violations.length > 0) throw new Error(this.violations.join('\n'));
  }

  constructor(options: HarnessOptions = {}) {
    const config = resolveGameConfig({
      seed: 42,
      ...options.config,
      timings: { ...FAST_TIMINGS, ...options.config?.timings },
      minigames: { enabled: options.enabled ?? null, ...options.config?.minigames },
    });
    this.tickMs = config.network.tickMs;
    this.gateway = new Gateway({
      config,
      registry: new MiniGameRegistry(options.modules ?? MINIGAME_MODULES, config.minigames.enabled),
      logger: silentLogger,
      serverVersion: 'test',
      environment: 'test',
      clock: () => this.now,
    });
    this.rtt = options.rtt ?? 0;
  }

  private readonly rtt: number;

  /** Opens a connection and performs the handshake. */
  client(options: { handshake?: boolean } = {}): TestClient {
    const client = new TestClient(this, `c${++this.seq}`, this.rtt);
    this.clients.push(client);
    if (options.handshake !== false) client.request('hello', { protocolVersion: PROTOCOL_VERSION });
    return client;
  }

  /** Advances the fake clock tick by tick, running scheduled bot actions. */
  advance(ms: number): void {
    const end = this.now + ms;
    while (this.now < end) {
      this.now = Math.min(end, this.now + this.tickMs);
      this.runScheduled();
      this.gateway.tick();
      this.runScheduled();
      this.assertContract();
    }
  }

  /** Advances until `predicate` is true (fails after `maxMs`). */
  advanceUntil(predicate: () => boolean, maxMs = 120_000): void {
    const limit = this.now + maxMs;
    while (!predicate()) {
      if (this.now >= limit) throw new Error(`advanceUntil: condition not met after ${maxMs} ms`);
      this.advance(this.tickMs);
    }
  }

  schedule(owner: TestClient, delay: number, fn: () => void): void {
    this.scheduled.push({ at: this.now + delay, fn, owner });
  }

  cancel(owner: TestClient): void {
    this.scheduled = this.scheduled.filter((s) => s.owner !== owner);
  }

  private runScheduled(): void {
    const due = this.scheduled.filter((s) => s.at <= this.now).sort((a, b) => a.at - b.at);
    this.scheduled = this.scheduled.filter((s) => s.at > this.now);
    for (const s of due) if (s.owner.isOpen) s.fn();
  }

  dispose(): void {
    for (const c of this.clients) c.close();
  }
}

export class TestClient {
  readonly received: ServerMessage[] = [];
  /** Fake-clock time at which each entry of `received` arrived. */
  readonly receivedAt: number[] = [];
  playerId: string | null = null;
  sessionToken: string | null = null;
  isOpen = true;
  closeCode: number | null = null;
  private readonly handle: ConnectionHandle;
  private rid = 0;
  private bot: { skill: number; sessionId: string | null } | null = null;
  private eventListeners: ((e: TypedPayload) => void)[] = [];
  private stateListeners: ((s: JsonValue) => void)[] = [];

  constructor(
    private readonly harness: Harness,
    readonly id: string,
    rtt: number,
  ) {
    this.handle = harness.gateway.open({
      id,
      send: (data) => this.onMessage(data),
      close: (code) => {
        this.isOpen = false;
        this.closeCode = code;
      },
      rttMs: () => rtt,
    });
  }

  // ─── Sending ───────────────────────────────────────────────────────────────

  /** Sends with a rid and returns the reply (the gateway is synchronous). */
  request<T extends ClientMessageType>(type: T, payload?: ClientPayload<T>) {
    const rid = `r${++this.rid}`;
    this.raw(JSON.stringify({ type, rid, payload }));
    this.harness.assertContract();
    const reply = this.received.find((m) => m.type === 'reply' && m.rid === rid);
    if (!reply || reply.type !== 'reply') throw new Error(`no reply to ${type}`);
    if (reply.ok && (type === 'room.create' || type === 'room.join' || type === 'room.resume')) {
      const data = reply.payload as { playerId: string; sessionToken: string };
      this.playerId = data.playerId;
      this.sessionToken = data.sessionToken;
    }
    return reply;
  }

  /** Like request() but throws on refusal and returns the payload. */
  ok<T extends ClientMessageType>(type: T, payload?: ClientPayload<T>): unknown {
    const reply = this.request(type, payload);
    if (!reply.ok) throw new Error(`${type} refused: ${reply.error.code} ${JSON.stringify(reply.error.details ?? {})}`);
    return reply.payload;
  }

  /** Fire-and-forget (no rid). */
  send<T extends ClientMessageType>(type: T, payload?: ClientPayload<T>): void {
    this.raw(JSON.stringify({ type, payload }));
  }

  raw(data: string): void {
    this.handle.receive(data);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.harness.cancel(this);
    this.handle.closed();
  }

  // ─── Reading ───────────────────────────────────────────────────────────────

  get snapshot(): RoomSnapshot {
    for (let i = this.received.length - 1; i >= 0; i--) {
      const m = this.received[i]!;
      if (m.type === 'room.snapshot') return m.payload;
      if (m.type === 'reply' && m.ok && isJoined(m.payload)) return m.payload.snapshot;
    }
    throw new Error('no snapshot received');
  }

  get phase(): MatchPhase {
    return this.snapshot.match.phase;
  }

  events(): RoomEvent[] {
    return this.received.flatMap((m) => (m.type === 'room.event' ? [m.payload] : []));
  }

  minigameEvents(): TypedPayload[] {
    return this.received.flatMap((m) => (m.type === 'minigame.event' ? [m.payload.event] : []));
  }

  errors() {
    return this.received.flatMap((m) => (m.type === 'error' ? [m.payload] : []));
  }

  phaseHistory(): string[] {
    return this.events().flatMap((e) => (e.kind === 'phaseChanged' ? [e.phase] : []));
  }

  // ─── Bot behaviour (plays minigames through the protocol) ──────────────────

  /** Makes this client play automatically: ready + minigame bots. */
  autoplay(skill = 0.7): this {
    this.bot = { skill, sessionId: null };
    return this;
  }

  private onMessage(data: string): void {
    const parsed = ServerMessage.safeParse(JSON.parse(data));
    if (!parsed.success) {
      // Thrown later by request()/advance(): the gateway swallows errors thrown inside send().
      this.harness.violations.push(`${this.id} received a message violating the contract: ${parsed.error.message}
${data}`);
      return;
    }
    const message = parsed.data;
    this.received.push(message);
    this.receivedAt.push(this.harness.now);
    if (message.type === 'minigame.event') this.eventListeners.forEach((l) => l(message.payload.event));
    if (message.type === 'minigame.state') this.stateListeners.forEach((l) => l(message.payload.state));
    if (message.type === 'room.snapshot' && this.bot) this.botReact(message.payload);
  }

  private botReact(snapshot: RoomSnapshot): void {
    const session = snapshot.match.minigame;
    const me = this.playerId;
    if (!session || !me || !session.participants.includes(me)) return;
    const phase = snapshot.match.phase;
    if (phase === 'MINIGAME_PREPARING' && !session.readyPlayerIds.includes(me)) {
      this.harness.schedule(this, 20, () => this.send('minigame.ready', { sessionId: session.sessionId }));
    }
    if (phase === 'MINIGAME_ACTIVE' && this.bot!.sessionId !== session.sessionId) {
      this.bot!.sessionId = session.sessionId;
      this.eventListeners = [];
      this.stateListeners = [];
      const strategy = MINIGAME_BOTS[session.minigameId] ?? genericBot;
      const api: BotApi = {
        playerId: me,
        session,
        rng: createRng(session.seed ^ hash(me)),
        skill: this.bot!.skill,
        now: () => this.harness.now,
        input: (input) => this.send('minigame.input', { sessionId: session.sessionId, input }),
        report: (result: PlayerResult) => this.send('minigame.report', { sessionId: session.sessionId, result }),
        onEvent: (l) => this.eventListeners.push(l),
        onState: (l) => this.stateListeners.push(l),
        after: (ms, fn) =>
          this.harness.schedule(this, ms, () => {
            if (this.bot?.sessionId === session.sessionId && this.snapshot.match.minigame?.sessionId === session.sessionId) fn();
          }),
      };
      strategy.play(api);
    }
  }
}

function isJoined(payload: unknown): payload is { snapshot: RoomSnapshot } {
  return typeof payload === 'object' && payload !== null && 'snapshot' in payload && 'sessionToken' in payload;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Creates a room with `count` players (first = host), all ready. */
export function setupRoom(harness: Harness, count: number, options: { ready?: boolean; rounds?: number } = {}) {
  const host = harness.client();
  host.ok('room.create', { nickname: 'Hôte', ...(options.rounds && { config: { rounds: options.rounds } }) });
  const code = host.snapshot.lobby.code;
  const players = [host];
  for (let i = 1; i < count; i++) {
    const c = harness.client();
    c.ok('room.join', { code, nickname: `Joueur ${i}` });
    players.push(c);
  }
  if (options.ready !== false) for (const p of players) p.ok('player.ready', { ready: true });
  return { host, players, code };
}
