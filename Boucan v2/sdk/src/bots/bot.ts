import { createRng, type JsonValue, type RoomSnapshot, type TypedPayload } from '@boucan/shared';
import { genericBot, MINIGAME_BOTS, type BotApi } from '@boucan/server';
import { BoucanClient } from '../client';
import type { TransportFactory } from '../transport';

export interface BotOptions {
  /** WebSocket URL or transport factory (local server). */
  url?: string;
  transport?: TransportFactory;
  nickname: string;
  characterId?: string;
  /** 0 (clumsy) … 1 (excellent). Default 0.6. */
  skill?: number;
  /** Mark ready as soon as in the lobby. Default true. */
  autoReady?: boolean;
  /** When host: start as soon as `canStart` and at least this many players. */
  autoStartAt?: number;
  /** When host: go back to the lobby this long after the final results (ms). */
  autoReturnAfterMs?: number;
}

/**
 * Simulated player driven through the public protocol, like a real client.
 * Dev tooling only (local games, bots CLI, integration check).
 */
export class BotPlayer {
  readonly client: BoucanClient;
  private readonly options: BotOptions;
  private sessionId: string | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private eventListeners: ((event: TypedPayload) => void)[] = [];
  private stateListeners: ((state: JsonValue) => void)[] = [];
  private lastSnapshot: RoomSnapshot | null = null;
  private busy = false;
  private returnScheduledFor: string | null = null;

  constructor(options: BotOptions) {
    this.options = options;
    this.client = new BoucanClient({
      url: options.url,
      transport: options.transport,
      clientName: `bot/${options.nickname}`,
      autoReconnect: false,
    });
    this.client.on('snapshot', (s) => this.react(s));
    this.client.on('minigameEvent', (m) => {
      if (m.sessionId === this.sessionId) this.eventListeners.forEach((l) => l(m.event));
    });
    this.client.on('minigameState', (m) => {
      if (m.sessionId === this.sessionId) this.stateListeners.forEach((l) => l(m.state));
    });
  }

  get playerId(): string | null {
    return this.client.playerId;
  }

  async join(code: string): Promise<void> {
    if (this.client.status !== 'connected') await this.client.connect();
    await this.client.joinRoom({ code, nickname: this.options.nickname, characterId: this.options.characterId });
  }

  async create(config?: { rounds?: number; minigamePool?: string[] | null }): Promise<string> {
    if (this.client.status !== 'connected') await this.client.connect();
    const reply = await this.client.createRoom({
      nickname: this.options.nickname,
      characterId: this.options.characterId,
      ...(config && { config: config as never }),
    });
    return reply.snapshot.lobby.code;
  }

  stop(): void {
    this.cancelTimers();
    this.client.disconnect();
  }

  private react(snapshot: RoomSnapshot): void {
    this.lastSnapshot = snapshot;
    const me = this.client.playerId;
    if (!me) return;
    const { match, lobby } = snapshot;
    const self = lobby.players.find((p) => p.id === me);
    const isHost = lobby.hostId === me;

    if (match.phase === 'LOBBY') {
      if (this.options.autoReady !== false && self && !self.ready) this.once(() => this.client.setReady(true));
      const min = this.options.autoStartAt;
      if (isHost && min !== undefined && lobby.canStart && lobby.players.length >= min) {
        this.once(() => this.client.startMatch());
      }
      return;
    }
    const session = match.minigame;
    if (
      match.phase === 'MINIGAME_PREPARING' &&
      session?.participants.includes(me) &&
      !session.readyPlayerIds.includes(me)
    ) {
      this.once(() => this.client.minigameReady(session.sessionId));
    }
    if (
      match.phase === 'MINIGAME_ACTIVE' &&
      session &&
      session.sessionId !== this.sessionId &&
      session.participants.includes(me)
    ) {
      this.startMinigame(snapshot);
    }
    const matchId = match.matchId;
    if (
      match.phase === 'MATCH_RESULTS' &&
      isHost &&
      this.options.autoReturnAfterMs !== undefined &&
      this.returnScheduledFor !== matchId
    ) {
      this.returnScheduledFor = matchId;
      this.after(this.options.autoReturnAfterMs, () => {
        if (this.lastSnapshot?.match.matchId === matchId && this.lastSnapshot.match.phase === 'MATCH_RESULTS') {
          void this.client.returnToLobby().catch(() => {});
        }
      });
    }
  }

  private startMinigame(snapshot: RoomSnapshot): void {
    const session = snapshot.match.minigame!;
    this.cancelTimers();
    this.sessionId = session.sessionId;
    this.eventListeners = [];
    this.stateListeners = [];
    const strategy = MINIGAME_BOTS[session.minigameId] ?? genericBot;
    const alive = () =>
      this.sessionId === session.sessionId && this.client.snapshot?.match.minigame?.sessionId === session.sessionId;
    const api: BotApi = {
      playerId: this.client.playerId!,
      session,
      rng: createRng((session.seed ^ hashString(this.client.playerId!)) >>> 0),
      skill: this.options.skill ?? 0.6,
      now: () => this.client.serverNow(),
      input: (input) => {
        if (alive()) this.client.sendInput(input, { sessionId: session.sessionId });
      },
      report: (result) => {
        if (alive()) void this.client.reportResult(result, session.sessionId).catch(() => {});
      },
      onEvent: (l) => this.eventListeners.push(l),
      onState: (l) => this.stateListeners.push(l),
      after: (ms, fn) => this.after(ms, () => alive() && fn()),
    };
    strategy.play(api);
  }

  /** Runs one request at a time, ignoring refusals (the state may have moved on). */
  private once(fn: () => Promise<unknown>): void {
    if (this.busy) return;
    this.busy = true;
    void fn()
      .catch(() => {})
      .finally(() => {
        this.busy = false;
      });
  }

  private after(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, Math.max(0, ms)));
  }

  private cancelTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const BOT_NAMES = ['Robot Rita', 'Bip Boup', 'Cyber Momo', 'Robo Lulu', 'Zorglub', 'Tic Tac', 'Méca Zoé', 'Boulon'];
