import { createRng, type RoomSnapshot, type Round, type TypedPayload } from '@boucan/shared';
import { BoucanClient } from '../client';
import type { TransportFactory } from '../transport';

export interface BotOptions {
  /** WebSocket URL or transport factory (local server). */
  url?: string;
  transport?: TransportFactory;
  nickname: string;
  characterId?: string;
  /** 0 (clumsy) … 1 (excellent). Default 0.7. */
  skill?: number;
  /** Mark ready as soon as in the lobby. Default true. */
  autoReady?: boolean;
  /** When host: start as soon as `canStart` and at least this many players. */
  autoStartAt?: number;
  /** When host: back to the lobby this long after the final ranking (ms). */
  autoReturnAfterMs?: number;
}

/**
 * A simulated player that goes through the public protocol like a real
 * client (dev tool: bots CLI, integration check, end-to-end tests).
 * In-room bots for real games are server-side (room.addBot); this one
 * exercises the full network path.
 */
export class BotPlayer {
  readonly client: BoucanClient;
  private readonly options: BotOptions;
  private roundId: string | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
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
      if (m.roundId === this.roundId) this.onEvent(m.event);
    });
    this.client.on('minigameState', (m) => {
      const state = m.state as { holder?: string | null };
      if (m.roundId === this.roundId && m.seq === 1 && state?.holder === this.client.playerId) this.pass(350);
    });
  }

  get playerId(): string | null {
    return this.client.playerId;
  }

  private get skill(): number {
    return this.options.skill ?? 0.7;
  }

  async join(code: string): Promise<void> {
    if (this.client.status !== 'connected') await this.client.connect();
    await this.client.joinRoom({ code, nickname: this.options.nickname, characterId: this.options.characterId });
  }

  async create(config?: Parameters<BoucanClient['createRoom']>[0]['config']): Promise<string> {
    if (this.client.status !== 'connected') await this.client.connect();
    const reply = await this.client.createRoom({
      nickname: this.options.nickname,
      characterId: this.options.characterId,
      ...(config && { config }),
    });
    return reply.snapshot.lobby.code;
  }

  stop(): void {
    this.cancelTimers();
    this.client.disconnect();
  }

  private react(snapshot: RoomSnapshot): void {
    const me = this.client.playerId;
    if (!me) return;
    const { match, lobby } = snapshot;
    const isHost = lobby.hostId === me;
    if (match.phase === 'LOBBY') {
      const self = lobby.players.find((p) => p.id === me);
      if (this.options.autoReady !== false && self && !self.ready) this.once(() => this.client.setReady(true));
      const min = this.options.autoStartAt;
      if (isHost && min !== undefined && lobby.canStart && lobby.players.length >= min) this.once(() => this.client.startMatch());
      return;
    }
    const round = match.round;
    if (match.phase === 'MICROGAME' && round && round.roundId !== this.roundId && round.participants.includes(me)) {
      this.play(round);
    }
    if (
      match.phase === 'STAGE_RESULTS' &&
      isHost &&
      this.options.autoReturnAfterMs !== undefined &&
      this.returnScheduledFor !== match.matchId
    ) {
      this.returnScheduledFor = match.matchId;
      this.after(this.options.autoReturnAfterMs, () => void this.client.returnToLobby().catch(() => {}));
    }
  }

  private play(round: Round): void {
    this.cancelTimers();
    this.roundId = round.roundId;
    const rng = createRng((round.seed ^ hash(this.client.playerId!)) >>> 0);
    const d = round.timing.durationMs;
    const roundId = round.roundId;
    if (round.kind !== 'duel') {
      const success = rng.chance(Math.max(0.1, this.skill - (round.tempo - 1) * 0.25));
      this.after(d * rng.range(0.3, 0.9), () => {
        void this.client.reportResult({ outcome: success ? 'success' : 'failure' }, roundId).catch(() => {});
      });
    }
  }

  private onEvent(event: TypedPayload): void {
    const me = this.client.playerId;
    if (event.type === 'signal') this.press(180 + (1 - this.skill) * 350);
    if (event.type === 'pass' && event.to === me) this.pass(450 + (1 - this.skill) * 400);
  }

  private press(delay: number): void {
    const roundId = this.roundId;
    this.after(delay, () => roundId && this.client.sendInput({ type: 'press' }, { roundId }));
  }

  private pass(delay: number): void {
    const roundId = this.roundId;
    this.after(delay, () => roundId && this.client.sendInput({ type: 'pass' }, { roundId }));
  }

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

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const BOT_NAMES = ['Robot Rita', 'Bip Boup', 'Cyber Momo', 'Robo Lulu', 'Zorglub', 'Tic Tac', 'Méca Zoé', 'Boulon'];
