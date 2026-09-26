import type {
  MiniGameEventMessage,
  MiniGameStateMessage,
  RoomEvent,
  RoomSnapshot,
  SessionEndReason,
} from '@boucan/shared';

/**
 * Outbound side effects of the engine. The gateway maps them onto
 * connections; tests record them. The engine never knows about sockets.
 */
export interface EngineOutput {
  snapshot(roomCode: string, snapshot: RoomSnapshot): void;
  roomEvent(roomCode: string, event: RoomEvent): void;
  minigameState(roomCode: string, message: MiniGameStateMessage): void;
  /** `to` = one player only; otherwise the whole room. */
  minigameEvent(roomCode: string, message: MiniGameEventMessage, to?: string): void;
  /** The player's seat is gone (kicked, expired, room closed…). */
  sessionEnded(playerId: string, reason: SessionEndReason): void;
}

export const nullOutput: EngineOutput = {
  snapshot() {},
  roomEvent() {},
  minigameState() {},
  minigameEvent() {},
  sessionEnded() {},
};
