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
import { hasEligible } from '../match/selection';
import type { MiniGameRegistry } from '../minigames/registry';
import type { EngineOutput } from '../output';
import { newId } from '../util/ids';

export interface RoomDeps {
  config: GameConfig;
  registry: MiniGameRegistry;
  logger: Logger;
  output: EngineOutput;
  rttOf(playerId: string): number;
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
}

export type LeaveReason = 'left' | 'kicked' | 'timeout';

/**
 * A room: its players, host, lobby configuration and match. All game-rule
 * checks for lobby actions live here; the match flow lives in Match.
 *
 * Every public command ends with flush(): at most one snapshot per command,
 * followed by the semantic events it produced.
 */
export class Room {
  readonly code: string;
  readonly createdAt: number;
  private readonly players = new Map<string, RoomPlayer>();
  private hostId: string | null = null;
  private config: MatchConfig;
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
    this.config = { rounds: GAME_RULES.defaultRounds, minigamePool: null };
    this.match = new Match(
      {
        code,
        config: deps.config,
        registry: deps.registry,
        logger: this.logger,
        output: deps.output,
        activePlayerIds: () => this.sorted().filter((p) => p.connection !== 'left').map((p) => p.id),
        isConnected: (id) => this.players.get(id)?.connection === 'connected',
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

  get playerCount(): number {
    return this.players.size;
  }

  get connectedCount(): number {
    return this.sorted().filter((p) => p.connection === 'connected').length;
  }

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

  /** No connected player for longer than the TTL (or nobody at all). */
  isAbandoned(now: number): boolean {
    const seated = this.sorted().filter((p) => p.connection !== 'left');
    if (seated.length === 0) return true;
    if (seated.some((p) => p.connection === 'connected')) return false;
    const lastSeen = Math.max(...seated.map((p) => p.disconnectedAt ?? now));
    return now - lastSeen >= this.deps.config.reconnect.emptyRoomTtlMs;
  }

  /** Ids of every player still holding a seat (for cleanup). */
  seatedPlayerIds(): string[] {
    return this.sorted()
      .filter((p) => p.connection !== 'left')
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
      match: this.match.toState(this.config.rounds),
    };
  }

  // ─── Membership ────────────────────────────────────────────────────────────

  join(rawNickname: string, characterId: string | undefined, now: number): string {
    if (this.match.inProgress) fail('MATCH_IN_PROGRESS');
    if (this.players.size >= GAME_RULES.maxPlayers) fail('ROOM_FULL');
    const nickname = this.validNickname(rawNickname);
    const character = characterId === undefined ? null : this.validCharacter(characterId);
    const player: RoomPlayer = {
      id: newId('p'),
      nickname,
      characterId: character,
      seat: this.firstFreeSeat(),
      ready: false,
      connection: 'connected',
      joinedAt: now,
      disconnectedAt: null,
    };
    this.players.set(player.id, player);
    if (this.hostId === null) this.setHost(player.id);
    this.logger.info('player joined', { player: player.id, nickname, players: this.players.size });
    this.pendingEvents.push({ kind: 'playerJoined', playerId: player.id });
    this.dirty = true;
    this.flush(now);
    return player.id;
  }

  /** Explicit leave, kick or grace expiry. */
  leave(playerId: string, now: number, reason: LeaveReason): void {
    const player = this.players.get(playerId);
    if (!player || player.connection === 'left') return;
    if (this.match.inProgress) {
      // Kept (as `left`) so standings stay complete; purged when back in the lobby.
      player.connection = 'left';
      player.ready = false;
      this.match.onPlayerDisconnected(playerId, now);
    } else {
      this.players.delete(playerId);
    }
    this.deps.releaseSession(playerId);
    if (reason !== 'left') this.deps.output.sessionEnded(playerId, reason === 'kicked' ? 'kicked' : 'expired');
    this.logger.info('player left', { player: playerId, reason, players: this.seatedPlayerIds().length });
    this.pendingEvents.push({ kind: 'playerLeft', playerId, reason });
    if (this.hostId === playerId) this.reassignHost();
    this.dirty = true;
    this.flush(now);
  }

  disconnect(playerId: string, now: number): void {
    const player = this.players.get(playerId);
    if (!player || player.connection !== 'connected') return;
    player.connection = 'disconnected';
    player.disconnectedAt = now;
    this.match.onPlayerDisconnected(playerId, now);
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
    this.match.onPlayerReconnected(playerId, now);
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

  updatePlayer(
    playerId: string,
    update: { nickname?: string; characterId?: string | null },
    now: number,
  ): void {
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
    if (update.minigamePool !== undefined && update.minigamePool !== null) {
      const unknown = update.minigamePool.find((id) => !this.deps.registry.isEnabled(id));
      if (unknown !== undefined) fail('CONFIG_INVALID', { reason: 'unknownMinigame', minigameId: unknown });
    }
    this.config = {
      rounds: update.rounds ?? this.config.rounds,
      minigamePool:
        update.minigamePool === undefined
          ? this.config.minigamePool
          : update.minigamePool === null
            ? null
            : dedupe(update.minigamePool),
    };
  }

  start(byId: string, now: number): void {
    this.requireHost(byId);
    this.requireLobby();
    const connected = this.sorted().filter((p) => p.connection === 'connected');
    if (connected.length < GAME_RULES.minPlayers) fail('NOT_ENOUGH_PLAYERS');
    if (connected.some((p) => !p.ready)) fail('NOT_ALL_READY');
    const pool = this.poolModules();
    if (!hasEligible(pool, connected.length)) {
      fail('CONFIG_INVALID', { reason: 'noEligibleMinigame', players: connected.length });
    }
    // Seats left empty by closed tabs are freed rather than dragged into the match.
    for (const p of this.sorted()) {
      if (p.connection !== 'connected') {
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
    if (this.match.currentPhase !== 'MATCH_RESULTS') fail('INVALID_PHASE');
    this.match.returnToLobby(now);
    this.flush(now);
  }

  // ─── Minigame traffic ──────────────────────────────────────────────────────

  minigameReady(playerId: string, sessionId: string, now: number): void {
    this.requireSeated(playerId);
    this.match.minigameReady(playerId, sessionId);
    this.flush(now);
  }

  minigameInput(
    playerId: string,
    sessionId: string,
    input: JsonValue,
    at: number | undefined,
    seq: number | undefined,
    now: number,
  ): void {
    this.requireSeated(playerId);
    this.match.minigameInput(playerId, sessionId, input, at, seq, now);
    this.flush(now);
  }

  minigameReport(playerId: string, sessionId: string, result: PlayerResult, now: number): void {
    this.requireSeated(playerId);
    this.match.minigameReport(playerId, sessionId, result, now);
    this.flush(now);
  }

  // ─── Clock ─────────────────────────────────────────────────────────────────

  tick(now: number): void {
    this.expireDisconnected(now);
    this.transferHostIfAway(now);
    this.match.tick(now);
    this.flush(now);
  }

  /** Sends the snapshot (if anything changed) then the queued events. */
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

  /** Ends every remaining seat (room closing). */
  close(): void {
    for (const id of this.seatedPlayerIds()) {
      this.deps.releaseSession(id);
      this.deps.output.sessionEnded(id, 'roomClosed');
    }
    this.players.clear();
    this.logger.info('room closed');
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private lobby(): Lobby {
    const players: Player[] = this.sorted().map((p) => ({
      id: p.id,
      nickname: p.nickname,
      characterId: p.characterId,
      seat: p.seat,
      isHost: p.id === this.hostId,
      ready: p.ready,
      connection: p.connection,
      score: this.match.scoreOf(p.id),
      joinedAt: p.joinedAt,
    }));
    const connected = players.filter((p) => p.connection === 'connected');
    return {
      code: this.code,
      hostId: this.hostId,
      players,
      config: { rounds: this.config.rounds, minigamePool: this.config.minigamePool },
      maxPlayers: GAME_RULES.maxPlayers,
      canStart:
        !this.match.inProgress &&
        connected.length >= GAME_RULES.minPlayers &&
        connected.every((p) => p.ready) &&
        hasEligible(this.poolModules(), connected.length),
    };
  }

  private onReturnToLobby(now: number): void {
    for (const p of this.sorted()) {
      if (p.connection === 'left') this.players.delete(p.id);
      else p.ready = false;
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
      if (this.players.size > 0) this.reassignHost();
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

  /** New host = connected player with the lowest seat (fallback: any seated player). */
  private reassignHost(): void {
    const seated = this.sorted().filter((p) => p.connection !== 'left' && p.id !== this.hostId);
    const next = seated.find((p) => p.connection === 'connected') ?? null;
    if (next === null) {
      // Nobody else can take over: keep a disconnected host rather than none.
      const current = this.hostId === null ? undefined : this.players.get(this.hostId);
      if (current && current.connection !== 'left') return;
      this.setHost(seated[0]?.id ?? null);
      return;
    }
    this.setHost(next.id);
  }

  private setHost(playerId: string | null): void {
    if (playerId === this.hostId) return;
    const previousHostId = this.hostId;
    this.hostId = playerId;
    this.logger.info('host changed', { player: playerId ?? 'none', previous: previousHostId ?? 'none' });
    this.pendingEvents.push({ kind: 'hostChanged', hostId: playerId, previousHostId });
    this.dirty = true;
  }

  private poolModules() {
    const pool = this.config.minigamePool;
    return this.deps.registry.enabled().filter((m) => pool === null || pool.includes(m.id));
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

function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
