import { outlineText } from '../engine/draw';
import type { MgContext, MgPlayer } from './api';
import { Actor } from './common';

/** Shared bits of the arena duels: one actor per participant, name tags. */
export interface Fighter {
  player: MgPlayer;
  actor: Actor;
  x: number;
}

export function fighters(ctx: MgContext, y: number, margin = 120): Fighter[] {
  const n = ctx.players.length;
  return ctx.players.map((player, i) => ({
    player,
    actor: new Actor(player),
    x: n === 1 ? 640 : margin + ((1280 - margin * 2) * i) / (n - 1),
    y,
  }));
}

/** Character height that fits n players side by side. */
export function arenaHeight(n: number): number {
  return n <= 2 ? 300 : n <= 4 ? 250 : n <= 6 ? 200 : 170;
}

export function nameTag(f: Fighter, y: number): void {
  outlineText(f.player.isMe ? 'TOI' : f.player.nickname, f.x, y, f.player.isMe ? 34 : 26, f.player.color);
}
