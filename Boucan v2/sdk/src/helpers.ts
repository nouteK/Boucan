import type { Player, RoomSnapshot } from '@boucan/shared';

/*
 * Pure selectors over a RoomSnapshot. No state, no UI: use them from any
 * framework to avoid re-deriving the same things in many components.
 */

export function findPlayer(snapshot: RoomSnapshot, playerId: string | null): Player | undefined {
  return playerId === null ? undefined : snapshot.lobby.players.find((p) => p.id === playerId);
}

export function playersById(snapshot: RoomSnapshot): Map<string, Player> {
  return new Map(snapshot.lobby.players.map((p) => [p.id, p]));
}

export function isHost(snapshot: RoomSnapshot, playerId: string | null): boolean {
  return playerId !== null && snapshot.lobby.hostId === playerId;
}

/** Does `playerId` play the current minigame? (false for players who joined the room too late / left) */
export function isParticipant(snapshot: RoomSnapshot, playerId: string | null): boolean {
  return playerId !== null && (snapshot.match.minigame?.participants.includes(playerId) ?? false);
}

export interface PhaseProgress {
  /** ms since the phase started. */
  elapsedMs: number;
  /** ms before phaseEndsAt (0 when passed), null when the phase is open-ended. */
  remainingMs: number | null;
  /** 0 → 1 over the phase, null when open-ended. */
  ratio: number | null;
  /** false when phaseEndsAt is only an upper bound (the phase may end sooner). */
  exact: boolean;
}

/**
 * Progress of the current phase at `serverNow` (pass client.serverNow()).
 * Call it every animation frame: no network traffic needed for timers.
 */
export function phaseProgress(snapshot: RoomSnapshot, serverNow: number): PhaseProgress {
  const { phaseStartedAt, phaseEndsAt, phaseEndsExactly } = snapshot.match;
  const elapsedMs = Math.max(0, serverNow - phaseStartedAt);
  if (phaseEndsAt === null) return { elapsedMs, remainingMs: null, ratio: null, exact: false };
  const total = Math.max(1, phaseEndsAt - phaseStartedAt);
  const remainingMs = Math.max(0, phaseEndsAt - serverNow);
  return { elapsedMs, remainingMs, ratio: Math.min(1, elapsedMs / total), exact: phaseEndsExactly };
}

/** ms from `serverNow` until `timestamp` (negative when in the past). */
export function msUntil(timestamp: number, serverNow: number): number {
  return timestamp - serverNow;
}
