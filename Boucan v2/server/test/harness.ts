import {
  PROTOCOL_VERSION,
  ServerMessage,
  type ClientMessageType,
  type ClientPayload,
  type JsonValue,
  type MatchPhase,
  type MicrogameInfo,
  type RoomEvent,
  type RoomSnapshot,
  type TypedPayload,
} from '@boucan/shared';
import { resolveGameConfig, type GameConfigOverrides } from '../src/config/game-config';
import type { MiniGameModule } from '../src/engine/minigames/api';
import { DUEL_MODULES } from '../src/engine/minigames/catalog';
import { MiniGameRegistry } from '../src/engine/minigames/registry';
import { silentLogger } from '../src/engine/logger';
import { Gateway, type ConnectionHandle } from '../src/gateway/gateway';

/**
 * Synchronous test harness: a Gateway fed by in-memory connections and a
 * fake clock. Every server message is validated against the contract — a
 * malformed message fails the test.
 */

export interface HarnessOptions {
  config?: GameConfigOverrides;
  modules?: readonly MiniGameModule[];
  enabled?: string[] | null;
  /** Microgame catalog (default: the shared one). */
  catalog?: readonly MicrogameInfo[];
  /** RTT reported for every connection. */
  rtt?: number;
}

type Scheduled = { at: number; fn: () => void; owner: TestClient };

export class Harness {
  now = 1_700_000_000_000;
  readonly gateway: Gateway;
  readonly tickMs: number;
  readonly config;
  private seq = 0;
  private scheduled: Scheduled[] = [];
  readonly clients: TestClient[] = [];
  readonly violations: string[] = [];
  private readonly rtt: number;

  constructor(options: HarnessOptions = {}) {
    this.config = resolveGameConfig({
      seed: 42,
      ...options.config,
      microgames: { enabled: options.enabled ?? null, ...options.config?.microgames },
    });
    this.tickMs = this.config.network.tickMs;
    this.rtt = options.rtt ?? 0;
    this.gateway = new Gateway({
      config: this.config,
      registry: new MiniGameRegistry(options.modules ?? DUEL_MODULES, this.config.microgames.enabled, options.catalog),
      logger: silentLogger,
      serverVersion: 'test',
      environment: 'test',
      clock: () => this.now,
    });
  }

  assertContract(): void {
    if (this.violations.length > 0) throw new Error(this.violations.join('\n'));
  }

  client(options: { handshake?: boolean } = {}): TestClient {
    const client = new TestClient(this, `c${++this.seq}`, this.rtt);
    this.clients.push(client);
    if (options.handshake !== false) client.request('hello', { protocolVersion: PROTOCOL_VERSION });
    return client;
  }

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

  advanceUntil(predicate: () => boolean, maxMs = 600_000): void {
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

export type AutoplayMode = 'win' | 'lose' | 'random' | 'idle';

export class TestClient {
  readonly received: ServerMessage[] = [];
  readonly receivedAt: number[] = [];
  playerId: string | null = null;
  sessionToken: string | null = null;
  isOpen = true;
  closeCode: number | null = null;
  private readonly handle: ConnectionHandle;
  private rid = 0;
  private mode: AutoplayMode | null = null;
  private playedRound: string | null = null;

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

  ok<T extends ClientMessageType>(type: T, payload?: ClientPayload<T>): unknown {
    const reply = this.request(type, payload);
    if (!reply.ok) throw new Error(`${type} refused: ${reply.error.code} ${JSON.stringify(reply.error.details ?? {})}`);
    return reply.payload;
  }

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

  me() {
    return this.snapshot.lobby.players.find((p) => p.id === this.playerId)!;
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

  /**
   * Plays every microgame automatically through the protocol:
   * solo/boss → a report; duels → sensible inputs. `mode` forces the outcome of solo games.
   */
  autoplay(mode: AutoplayMode = 'random'): this {
    this.mode = mode;
    return this;
  }

  private onMessage(data: string): void {
    const parsed = ServerMessage.safeParse(JSON.parse(data));
    if (!parsed.success) {
      this.harness.violations.push(`${this.id} received a message violating the contract: ${parsed.error.message}\n${data}`);
      return;
    }
    const message = parsed.data;
    this.received.push(message);
    this.receivedAt.push(this.harness.now);
    if (this.mode && this.mode !== 'idle') this.react(message);
  }

  private react(message: ServerMessage): void {
    const me = this.playerId;
    if (!me) return;
    if (message.type === 'room.snapshot') {
      const { round } = message.payload.match;
      if (message.payload.match.phase !== 'MICROGAME' || !round || this.playedRound === round.roundId) return;
      if (!round.participants.includes(me)) return;
      this.playedRound = round.roundId;
      const roundId = round.roundId;
      const d = round.timing.durationMs;
      if (round.kind !== 'duel') {
        const outcome = this.mode === 'win' ? 'success' : this.mode === 'lose' ? 'failure' : hash(roundId + me) % 3 === 0 ? 'failure' : 'success';
        this.harness.schedule(this, Math.round(d * 0.5), () => this.send('minigame.report', { roundId, result: { outcome } }));
      }
      return;
    }
    if (message.type === 'minigame.event') {
      const round = this.snapshot.match.round;
      if (!round || round.roundId !== message.payload.roundId) return;
      const ev = message.payload.event as TypedPayload & { to?: string };
      const roundId = round.roundId;
      if (ev.type === 'signal') this.harness.schedule(this, 250, () => this.send('minigame.input', { roundId, input: { type: 'press' } }));
      if (ev.type === 'pass' && ev.to === me) this.harness.schedule(this, 420, () => this.send('minigame.input', { roundId, input: { type: 'pass' } }));
    }
    if (message.type === 'minigame.state') {
      const state = message.payload.state as { holder?: string | null } & JsonValue;
      // Patate: the first holder has no "pass" event.
      if (state && typeof state === 'object' && 'holder' in state && state.holder === me && message.payload.seq === 1) {
        const roundId = message.payload.roundId;
        this.harness.schedule(this, 300, () => this.send('minigame.input', { roundId, input: { type: 'pass' } }));
      }
    }
  }
}

function isJoined(payload: unknown): payload is { snapshot: RoomSnapshot } {
  return typeof payload === 'object' && payload !== null && 'snapshot' in payload && 'sessionToken' in payload;
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Room with `humans` connected clients (first = host, all ready) and `bots` server bots. */
export function setupRoom(
  harness: Harness,
  humans: number,
  options: { bots?: number; ready?: boolean; config?: Record<string, unknown> } = {},
) {
  const host = harness.client();
  host.ok('room.create', { nickname: 'Hôte', ...(options.config && { config: options.config as never }) });
  const code = host.snapshot.lobby.code;
  const players = [host];
  for (let i = 1; i < humans; i++) {
    const c = harness.client();
    c.ok('room.join', { code, nickname: `Joueur ${i}` });
    players.push(c);
  }
  for (let i = 0; i < (options.bots ?? 0); i++) host.ok('room.addBot');
  if (options.ready !== false) for (const p of players) p.ok('player.ready', { ready: true });
  return { host, players, code };
}
