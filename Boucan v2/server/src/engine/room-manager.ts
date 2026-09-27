import { createRng, randomSeed, type MatchConfig, type Rng } from '@boucan/shared';
import type { GameConfig } from '../config/game-config';
import { fail } from './errors';
import type { Logger } from './logger';
import type { MiniGameRegistry } from './minigames/registry';
import type { EngineOutput } from './output';
import { Room } from './room/room';
import { newRoomCode, newSessionToken } from './util/ids';

export interface EngineOptions {
  config: GameConfig;
  registry: MiniGameRegistry;
  logger: Logger;
  output: EngineOutput;
  /** Measured round-trip time of a player's connection (ms). Default 0. */
  rttOf?: (playerId: string) => number;
}

export interface Seat {
  room: Room;
  playerId: string;
  sessionToken: string;
}

interface SessionEntry {
  roomCode: string;
  playerId: string;
}

/**
 * Entry point of the engine: owns rooms and session tokens, drives time.
 * IO-free — the Node gateway, the in-browser local server and the tests all
 * drive it the same way (commands + tick(now)).
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly tokenByPlayer = new Map<string, string>();
  private readonly rng: Rng;

  constructor(private readonly options: EngineOptions) {
    this.rng = createRng(options.config.seed ?? randomSeed());
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  get playerCount(): number {
    let n = 0;
    for (const room of this.rooms.values()) n += room.seatedPlayerIds().length;
    return n;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  createRoom(
    input: { nickname: string; characterId?: string; config?: Partial<MatchConfig> },
    now: number,
  ): Seat {
    if (this.rooms.size >= this.options.config.limits.maxRooms) fail('SERVER_FULL');
    const code = this.freeCode();
    const room = new Room(code, this.roomDeps(), now);
    // Validate the config before anyone joins, so a refusal leaves no empty room behind.
    if (input.config) room.applyConfig(input.config);
    const playerId = room.join(input.nickname, input.characterId, now);
    this.rooms.set(code, room);
    this.options.logger.info('room created', { room: code, rooms: this.rooms.size });
    return { room, playerId, sessionToken: this.issueToken(code, playerId) };
  }

  joinRoom(input: { code: string; nickname: string; characterId?: string }, now: number): Seat {
    const room = this.rooms.get(input.code);
    if (!room) fail('ROOM_NOT_FOUND');
    const playerId = room.join(input.nickname, input.characterId, now);
    return { room, playerId, sessionToken: this.issueToken(room.code, playerId) };
  }

  /** Re-binds a returning client to its seat. */
  resume(sessionToken: string, now: number): Seat {
    const entry = this.sessions.get(sessionToken);
    const room = entry ? this.rooms.get(entry.roomCode) : undefined;
    if (!entry || !room || !room.isSeated(entry.playerId)) fail('SESSION_NOT_FOUND');
    room.reconnect(entry.playerId, now);
    return { room, playerId: entry.playerId, sessionToken };
  }

  leave(roomCode: string, playerId: string, now: number): void {
    this.rooms.get(roomCode)?.leave(playerId, now, 'left');
  }

  disconnect(roomCode: string, playerId: string, now: number): void {
    this.rooms.get(roomCode)?.disconnect(playerId, now);
  }

  tick(now: number): void {
    for (const room of this.rooms.values()) {
      try {
        room.tick(now);
      } catch (error) {
        // A bug in one room must not stop the others. The room is closed to avoid a zombie state.
        this.options.logger.error('room tick failed, closing room', { room: room.code }, error);
        this.closeRoom(room);
        continue;
      }
      if (room.isAbandoned(now)) this.closeRoom(room);
    }
  }

  /** Closes every room (graceful shutdown). */
  closeAll(): void {
    for (const room of [...this.rooms.values()]) this.closeRoom(room);
  }

  private closeRoom(room: Room): void {
    room.close();
    this.rooms.delete(room.code);
    this.options.logger.info('room removed', { room: room.code, rooms: this.rooms.size });
  }

  private roomDeps() {
    return {
      config: this.options.config,
      registry: this.options.registry,
      logger: this.options.logger,
      output: this.options.output,
      rttOf: this.options.rttOf ?? (() => 0),
      random: () => this.rng.next(),
      releaseSession: (playerId: string) => this.releaseToken(playerId),
    };
  }

  private issueToken(roomCode: string, playerId: string): string {
    const token = newSessionToken();
    this.sessions.set(token, { roomCode, playerId });
    this.tokenByPlayer.set(playerId, token);
    return token;
  }

  private releaseToken(playerId: string): void {
    const token = this.tokenByPlayer.get(playerId);
    if (token === undefined) return;
    this.tokenByPlayer.delete(playerId);
    this.sessions.delete(token);
  }

  private freeCode(): string {
    for (let i = 0; i < 100; i++) {
      const code = newRoomCode();
      if (!this.rooms.has(code)) return code;
    }
    fail('SERVER_FULL');
  }
}
