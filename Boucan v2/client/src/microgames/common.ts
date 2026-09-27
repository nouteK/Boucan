import { drawCharacter, type Pose } from '../engine/assets';
import { shadow } from '../engine/draw';
import type { GameInput } from '../engine/input';
import type { MgContext, MgPlayer } from './api';

/** Ground line and hero size shared by most side-view microgames. */
export const GY = 612;
export const HERO_H = 300;

/** A character with a pose state machine (pose + time in pose). */
export class Actor {
  pose: Pose = 'idle';
  t = 0;
  constructor(
    readonly player: Pick<MgPlayer, 'characterId' | 'color'>,
    pose: Pose = 'idle',
  ) {
    this.pose = pose;
  }
  /** Changes pose (restarts the animation only if it is a different pose). */
  set(pose: Pose): void {
    if (pose !== this.pose) this.force(pose);
  }
  force(pose: Pose): void {
    this.pose = pose;
    this.t = 0;
  }
  update(dt: number): void {
    this.t += dt;
  }
  draw(x: number, y: number, h = HERO_H, opts: { flip?: boolean; rot?: number; shadow?: boolean; alpha?: number } = {}): void {
    if (opts.shadow !== false) shadow(x, y, h * 0.34);
    drawCharacter(this.player.characterId, this.pose, this.t, x, y, h, {
      flip: opts.flip,
      rot: opts.rot,
      color: this.player.color,
      alpha: opts.alpha,
    });
  }
}

export function hero(ctx: MgContext, pose: Pose = 'idle'): Actor {
  return new Actor(ctx.me, pose);
}

/**
 * Extra character of a solo microgame (goalkeeper, thrower, guard…) wearing
 * another participant's character: the other players show up in your game.
 */
export function npc(ctx: MgContext, i = 0, pose: Pose = 'idle'): Actor {
  const others = ctx.players.filter((p) => !p.isMe);
  const p = others[i % Math.max(1, others.length)];
  return new Actor({ characterId: p?.characterId ?? 'renard', color: p?.color ?? '#888' }, pose);
}

/** One deliberate press: touch / click / Space, or an arrow key that is not an auto-repeat (no mashing by holding). */
export function isPress(e: GameInput): boolean {
  return e.type === 'down' || (e.type === 'key' && !e.repeat);
}

/**
 * Side of a two-button press (alternate / left-right games): left or right
 * half of the screen, ← →. null for anything else.
 */
export function sideOf(e: GameInput): -1 | 1 | null {
  if (e.type === 'down') return e.x === null ? null : e.x < 640 ? -1 : 1;
  if (e.type === 'key' && !e.repeat && (e.key === 'left' || e.key === 'right')) return e.key === 'left' ? -1 : 1;
  return null;
}

/**
 * Cosmetic randomness (splinters, sparks…) that never touches the round RNG,
 * so every player keeps exactly the same situation whatever they press.
 */
export function fxRand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Random helpers on the round's deterministic RNG. */
export function between(ctx: MgContext, a: number, b: number): number {
  return ctx.rng.range(a, b);
}

/** Difficulty helper: value for level 1, 2, 3+. */
export function byLevel<T>(ctx: MgContext, l1: T, l2: T, l3: T): T {
  return ctx.level <= 1 ? l1 : ctx.level === 2 ? l2 : l3;
}
