import type { Player, RoomSnapshot } from '@boucan/shared';
import { GAME } from '../config';
import { assets } from '../engine/assets';
import type { MgPlayer } from '../microgames/api';

/** Players as the presentation layer sees them (colour, character, me). */
export interface RosterEntry extends MgPlayer {
  seat: number;
  lives: number;
  wins: number;
  isBot: boolean;
  connection: Player['connection'];
}

export function characterFor(p: Pick<Player, 'characterId' | 'seat'>): string | null {
  if (p.characterId && assets.hasCharacter(p.characterId)) return p.characterId;
  const fallback = GAME.defaultCharacters[p.seat % GAME.defaultCharacters.length]!;
  return assets.hasCharacter(fallback) ? fallback : null;
}

export function roster(snapshot: RoomSnapshot, meId: string | null): RosterEntry[] {
  return snapshot.lobby.players.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    characterId: characterFor(p),
    color: GAME.seatColors[p.seat % GAME.seatColors.length]!,
    isMe: p.id === meId,
    alive: p.alive,
    seat: p.seat,
    lives: p.lives,
    wins: p.wins,
    isBot: p.isBot,
    connection: p.connection,
  }));
}
