import {
  checkNickname,
  dedupeNickname,
  GAME_RULES,
  type ConnectionStatus,
  type JsonValue,
  type Lobby,
  type MatchConfig,
  type MiniGameStateMessage,
  type Player,
  type PlayerResult,
  type RoomEvent,
  type RoomSnapshot,
} from '@boucan/shared';
import type { GameConfig } from '../../config/game-config';
import { EngineError, fail } from '../errors';
import type { Logger } from '../logger';
import { Match } from '../match/match';
import type { MiniGameRegistry } from '../minigames/registry';
import type { EngineOutput } from '../output';
import { newId } from '../util/ids';

export interface RoomDeps {
  config: GameConfig;
  registry: MiniGameRegistry;
  logger: Logger;
  output: EngineOutput;
  rttOf(playerId: string): number;
  /** Server-side randomness for bots (names, skills). */
  random(): number;
  /** The player's seat is gone for good: invalidate their session token. */
  releaseSession(playerId: string): void;
}

interface RoomPlayer {
  id: string;
  nickname: string;
  characterId: string | null;
  seat: number;
  ready: boolean;
  connection: ConnectionStatus;
  joinedAt: number;
  disconnectedAt: number | null;
  /** null for humans. */
  bot: { skill: number } | null;
}

export type LeaveReason = 'left' | 'kicked' | 'timeout';

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  zone: 'mix',
  lives: GAME_RULES.defaultLives,
  length: GAME_RULES.defaultLength,
};

/**
 * A room: players (humans and server bots), host, lobby configuration and the
 * match. Every public command ends with flush(): at most one snapshot per
 * command, followed by the semantic events it produced.
 */
export class Room {
  readonly code: string;
  readonly createdAt: number;
  private readonly players = new Map<string, RoomPlayer>();
  private hostId: string | null = null;
  private config: MatchConfig = { ...DEFAULT_MATCH_CONFIG };
  private readonly match: Match;
  private rev = 0;
  private dirty = true;
  private pendingEvents: RoomEvent[] = [];
  private readonly logger: Logger;

  constructor(
    code: string,
    private readonly deps: RoomDeps,
    now: number,
  ) {
    this.code = code;
    this.createdAt = now;
    this.logger = deps.logger.child({ room: code });
    this.match = new Match(
      {
        code,
        config: deps.config,
        registry: deps.registry,
        logger: this.logger,
        output: deps.output,
        seatedIds: () => this.seatedPlayerIds(),
        isConnected: (id) => this.players.get(id)?.connection === 'connected',
        isBot: (id) => this.players.get(id)?.bot != null,
        skillOf: (id) => this.players.get(id)?.bot?.skill ?? 0,
        seatOf: (id) => this.players.get(id)?.seat ?? GAME_RULES.maxPlayers,
        rttOf: (id) => deps.rttOf(id),
        markDirty: () => {
          this.dirty = true;
        },
        queueEvent: (event) => this.pendingEvents.push(event),
        onReturnToLobby: (t) => this.onReturnToLobby(t),
      },
      now,
    );
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  get phase() {
    return this.match.currentPhase;
  }

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  isSeated(playerId: string): boolean {
    const p = this.players.get(playerId);
    return p !== undefined && p.connection !== 'left';
  }

  /** No connected human for longer than the TTL (bots never keep a room alive). */
  isAbandoned(now: number): boolean {
    const humans = this.sorted().filter((p) => p.connection !== 'left' && !p.bot);
    if (humans.length === 0) return true;
    if (humans.some((p) => p.connection === 'connected')) return false;
    const lastSeen = Math.max(...humans.map((p) => p.disconnectedAt ?? now));
    return now - lastSeen >= this.deps.config.reconnect.emptyRoomTtlMs;
  }

  /** Every player still holding a seat (humans and bots), in seat order. */
  seatedPlayerIds(): string[] {
    return this.sorted()
      .filter((p) => p.connection !== 'left')
      .map((p) => p.id);
  }

  humanIds(): string[] {
    return this.sorted()
      .filter((p) => p.connection !== 'left' && !p.bot)
      .map((p) => p.id);
  }

  latestMiniGameState(): MiniGameStateMessage | null {
    return this.match.latestMiniGameState();
  }

  snapshot(now: number): RoomSnapshot {
    return {
      rev: Math.max(1, this.rev),
      serverTime: now,
      lobby: this.lobby(),
      match: this.match.toState(this.config),
    };
  }

  // ─── Membership ────────────────────────────────────────────────────────────

  join(rawNickname: string, characterId: string | undefined, now: number): string {
    if (this.match.inProgress) fail('MATCH_IN_PROGRESS');
    if (this.players.size >= GAME_RULES.maxPlayers) fail('ROOM_FULL');
    const nickname = this.validNickname(rawNickname);
    const character = characterId === undefined ? null : this.validCharacter(characterId);
    const player = this.seatPlayer(nickname, character, null, now);
    if (this.hostId === null) this.setHost(player.id);
    this.flush(now);
    return player.id;
  }

  addBot(byId: string, now: number): void {
    this.requireHost(byId);
    this.requireLobby();
    if (this.players.size >= GAME_RULES.maxPlayers) fail('ROOM_FULL');
    const { bots } = this.deps.config;
    const taken = new Set(this.sorted().map((p) => p.nickname));
    const name = bots.names.find((n) => !taken.has(n)) ?? dedupeNickname('Robot', [...taken]);
    const skill = bots.minSkill + this.deps.random() * (bots.maxSkill - bots.minSkill);
    const player = this.seatPlayer(name, null, { skill: Math.round(skill * 100) / 100 }, now);
    player.ready = true;
    this.flush(now);
  }

  /** Explicit leave, kick or grace expiry. */
  leave(playerId: string, now: number, reason: LeaveReason): void {
    const player = this.players.get(playerId);
    if (!player || player.connection === 'left') return;
    if (this.match.inProgress) {
      player.connection = 'left';
      player.ready = false;
      this.match.onPlayerLeft(playerId);
    } else {
      this.players.delete(playerId);
    }
    if (!player.bot) {
      this.deps.releaseSession(playerId);
      if (reason !== 'left') this.deps.output.sessionEnded(playerId, reason === 'kicked' ? 'kicked' : 'expired');
    }
    this.logger.info('player left', { player: playerId, reason, bot: player.bot !== null });
    this.pendingEvents.push({ kind: 'playerLeft', playerId, reason });
    if (this.hostId === playerId) this.reassignHost();
    this.dirty = true;
    // No human left: the room is abandoned (manager closes it on the next tick).
    this.flush(now);
  }

  disconnect(playerId: string, now: number): void {
    const player = this.players.get(playerId);
    if (!player || player.connection !== 'connected' || player.bot) return;
    player.connection = 'disconnected';
    player.disconnectedAt = now;
    this.logger.info('player disconnected', { player: playerId });
    this.pendingEvents.push({ kind: 'playerDisconnected', playerId });
    this.dirty = true;
    this.flush(now);
  }

  reconnect(playerId: string, now: number): void {
    const player = this.players.get(playerId);
    if (!player || player.connection === 'left') fail('SESSION_NOT_FOUND');
    if (player.connection === 'connected') return;
    player.connection = 'connected';
    player.disconnectedAt = null;
    this.logger.info('player reconnected', { player: playerId });
    this.pendingEvents.push({ kind: 'playerReconnected', playerId });
    if (this.hostId === null) this.setHost(playerId);
    this.dirty = true;
    this.flush(now);
  }

  // ─── Lobby commands ────────────────────────────────────────────────────────

  setReady(playerId: string, ready: boolean, now: number): void {
    const player = this.requireSeated(playerId);
    this.requireLobby();
    if (player.ready === ready) return;
    player.ready = ready;
    this.dirty = true;
    this.flush(now);
  }

  updatePlayer(playerId: string, update: { nickname?: string; characterId?: string | null }, now: number): void {
    const player = this.requireSeated(playerId);
    this.requireLobby();
    const nickname = update.nickname === undefined ? undefined : this.validNickname(update.nickname, playerId);
    const character =
      update.characterId === undefined || update.characterId === null
        ? update.characterId
        : this.validCharacter(update.characterId);
    if (nickname !== undefined) player.nickname = nickname;
    if (character !== undefined) player.characterId = character;
    this.dirty = true;
    this.flush(now);
  }

  kick(byId: string, targetId: string, now: number): void {
    this.requireHost(byId);
    this.requireLobby();
    if (targetId === byId || !this.players.has(targetId)) fail('PLAYER_NOT_FOUND');
    this.leave(targetId, now, 'kicked');
  }

  configure(byId: string, update: Partial<MatchConfig>, now: number): void {
    this.requireHost(byId);
    this.requireLobby();
    this.applyConfig(update);
    this.dirty = true;
    this.flush(now);
  }

  /** Used at creation (no host check: the creator is the host). */
  applyConfig(update: Partial<MatchConfig>): void {
    this.config = { ...this.config, ...Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined)) };
  }

  start(byId: string, now: number): void {
    this.requireHost(byId);
    this.requireLobby();
    const humans = this.sorted().filter((p) => !p.bot && p.connection === 'connected');
    if (humans.length === 0 || this.players.size < GAME_RULES.minPlayers) fail('NOT_ENOUGH_PLAYERS');
    if (humans.some((p) => !p.ready)) fail('NOT_ALL_READY');
    // Seats left empty by closed tabs are freed rather than dragged into the match.
    for (const p of this.sorted()) {
      if (!p.bot && p.connection !== 'connected') {
        this.players.delete(p.id);
        this.deps.releaseSession(p.id);
        this.deps.output.sessionEnded(p.id, 'expired');
        this.pendingEvents.push({ kind: 'playerLeft', playerId: p.id, reason: 'timeout' });
      }
    }
    this.match.start(this.config, now);
    this.flush(now);
  }

  abort(byId: string, now: number): void {
    this.requireHost(byId);
    if (!this.match.inProgress) fail('INVALID_PHASE');
    this.match.abort(now, 'host');
    this.flush(now);
  }

  returnToLobby(byId: string, now: number): void {
    this.requireHost(byId);
    if (this.match.currentPhase !== 'STAGE_RESULTS') fail('INVALID_PHASE');
    this.match.returnToLobby(now);
    this.flush(now);
  }

  // ─── Microgame traffic ─────────────────────────────────────────────────────

  minigameInput(playerId: string, roundId: string, input: JsonValue, at: number | undefined, now: number): void {
    this.requireSeated(playerId);
    this.match.input(playerId, roundId, input, at, now);
    this.flush(now);
  }

  minigameReport(playerId: string, roundId: string, result: PlayerResult, now: number): void {
    this.requireSeated(playerId);
    this.match.report(playerId, roundId, result, now);
    this.flush(now);
  }

  // ─── Clock ─────────────────────────────────────────────────────────────────

  tick(now: number): void {
    this.expireDisconnected(now);
    this.transferHostIfAway(now);
    this.match.tick(now);
    this.flush(now);
  }

  flush(now: number): void {
    if (this.dirty) {
      this.dirty = false;
      this.rev += 1;
      this.deps.output.snapshot(this.code, this.snapshot(now));
    }
    if (this.pendingEvents.length > 0) {
      const events = this.pendingEvents;
      this.pendingEvents = [];
      for (const event of events) this.deps.output.roomEvent(this.code, event);
    }
  }

  close(): void {
    for (const id of this.humanIds()) {
      this.deps.releaseSession(id);
      this.deps.output.sessionEnded(id, 'roomClosed');
    }
    this.players.clear();
    this.logger.info('room closed');
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private seatPlayer(nickname: string, characterId: string | null, bot: RoomPlayer['bot'], now: number): RoomPlayer {
    const player: RoomPlayer = {
      id: newId(bot ? 'b' : 'p'),
      nickname,
      characterId,
      seat: this.firstFreeSeat(),
      ready: false,
      connection: 'connected',
      joinedAt: now,
      disconnectedAt: null,
      bot,
    };
    this.players.set(player.id, player);
    this.logger.info(bot ? 'bot added' : 'player joined', { player: player.id, nickname, players: this.players.size });
    this.pendingEvents.push({ kind: 'playerJoined', playerId: player.id });
    this.dirty = true;
    return player;
  }

  private lobby(): Lobby {
    const inMatch = this.match.inProgress;
    const players: Player[] = this.sorted().map((p) => {
      const s = this.match.stateOf(p.id);
      return {
        id: p.id,
        nickname: p.nickname,
        characterId: p.characterId,
        seat: p.seat,
        isHost: p.id === this.hostId,
        isBot: p.bot !== null,
        ready: p.ready,
        connection: p.connection,
        lives: inMatch ? (s?.lives ?? 0) : this.config.lives,
        wins: inMatch ? (s?.wins ?? 0) : 0,
        alive: inMatch ? (s?.alive ?? false) : true,
      };
    });
    const humans = players.filter((p) => !p.isBot && p.connection === 'connected');
    return {
      code: this.code,
      hostId: this.hostId,
      players,
      config: { ...this.config },
      maxPlayers: GAME_RULES.maxPlayers,
      canStart: !inMatch && humans.length > 0 && humans.every((p) => p.ready),
    };
  }

  private onReturnToLobby(now: number): void {
    for (const p of this.sorted()) {
      if (p.connection === 'left') this.players.delete(p.id);
      else p.ready = p.bot !== null;
    }
    if (this.hostId !== null && !this.players.has(this.hostId)) this.reassignHost();
    this.logger.info('back to lobby', { players: this.players.size });
    this.dirty = true;
    void now;
  }

  private expireDisconnected(now: number): void {
    const { lobbyGraceMs, matchGraceMs } = this.deps.config.reconnect;
    const grace = this.match.inProgress ? matchGraceMs : lobbyGraceMs;
    for (const p of this.sorted()) {
      if (p.connection === 'disconnected' && p.disconnectedAt !== null && now - p.disconnectedAt >= grace) {
        this.leave(p.id, now, 'timeout');
      }
    }
  }

  private transferHostIfAway(now: number): void {
    const host = this.hostId === null ? undefined : this.players.get(this.hostId);
    if (host === undefined) {
      if (this.humanIds().length > 0) this.reassignHost();
      return;
    }
    if (
      host.connection === 'disconnected' &&
      host.disconnectedAt !== null &&
      now - host.disconnectedAt >= this.deps.config.reconnect.hostTransferMs
    ) {
      this.reassignHost();
    }
  }

  /** New host = connected human with the lowest seat (bots are never host). */
  private reassignHost(): void {
    const humans = this.sorted().filter((p) => !p.bot && p.connection !== 'left' && p.id !== this.hostId);
    const next = humans.find((p) => p.connection === 'connected') ?? null;
    if (next === null) {
      const current = this.hostId === null ? undefined : this.players.get(this.hostId);
      if (current && current.connection !== 'left') return;
      this.setHost(humans[0]?.id ?? null);
      return;
    }
    this.setHost(next.id);
  }

  private setHost(playerId: string | null): void {
    if (playerId === this.hostId) return;
    const previousHostId = this.hostId;
    this.hostId = playerId;
    this.pendingEvents.push({ kind: 'hostChanged', hostId: playerId, previousHostId });
    this.dirty = true;
  }

  private validNickname(raw: string, selfId?: string): string {
    const check = checkNickname(raw);
    if (!check.ok) {
      if (check.reason === 'banned') fail('NICKNAME_NOT_ALLOWED');
      fail('NICKNAME_INVALID', { reason: check.reason });
    }
    const taken = this.sorted()
      .filter((p) => p.id !== selfId)
      .map((p) => p.nickname);
    return dedupeNickname(check.nickname, taken);
  }

  private validCharacter(characterId: string): string {
    const allowed = this.deps.config.characters.allowed;
    if (allowed !== null && !allowed.includes(characterId)) fail('CHARACTER_INVALID');
    return characterId;
  }

  private firstFreeSeat(): number {
    const taken = new Set([...this.players.values()].map((p) => p.seat));
    for (let seat = 0; seat < GAME_RULES.maxPlayers; seat++) if (!taken.has(seat)) return seat;
    throw new EngineError('ROOM_FULL');
  }

  private requireSeated(playerId: string): RoomPlayer {
    const player = this.players.get(playerId);
    if (!player || player.connection === 'left') fail('NOT_IN_ROOM');
    return player;
  }

  private requireHost(playerId: string): void {
    this.requireSeated(playerId);
    if (this.hostId !== playerId) fail('NOT_HOST');
  }

  private requireLobby(): void {
    if (this.match.inProgress) fail('INVALID_PHASE');
  }

  private sorted(): RoomPlayer[] {
    return [...this.players.values()].sort((a, b) => a.seat - b.seat);
  }
}
