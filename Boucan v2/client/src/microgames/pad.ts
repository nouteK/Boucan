import { circle, g, INK, outlineText } from '../engine/draw';
import type { ArrowKey, GameInput } from '../engine/input';
import type { MgContext } from './api';
import { keyCap } from './props';

/**
 * Buttons of the microgames with several actions (move + jump…).
 *
 * Touch screens get round on-screen buttons: each finger presses its own
 * (multi-touch), and sliding a finger onto the neighbouring button switches.
 * The keyboard triggers the same actions (`keys`); Space / Enter, a click, or
 * a tap outside the buttons trigger the `tap` action — or, with a mouse, the
 * `halves` actions (left / right half of the screen held). In touch mode the
 * pad draws the buttons, otherwise small key caps at the same places.
 */
export interface PadButton {
  action: string;
  label: string;
  x: number;
  y: number;
  r?: number;
  keys?: readonly ArrowKey[];
  /** Main action: bigger, yellow. */
  big?: boolean;
}

export interface PadEvent {
  action: string;
  down: boolean;
}

/** Usual places: left thumb, right thumb (above the fuse timer). */
export const PAD_Y = 520;
export const PAD_LEFT = [110, 262];
export const PAD_RIGHT = [1170, 1018];

export class Pad {
  /** Who holds what: pointer (`p<id>`), key (`k<key>`) or Space (`space`) → action. */
  private readonly sources = new Map<string, string>();

  constructor(
    private readonly ctx: MgContext,
    private readonly buttons: readonly PadButton[],
    private readonly options: { tap?: string; halves?: readonly [string, string] } = {},
  ) {}

  held(action: string): boolean {
    for (const a of this.sources.values()) if (a === action) return true;
    return false;
  }

  /** −1 / 0 / +1 from two opposite actions held. */
  axis(minus: string, plus: string): -1 | 0 | 1 {
    return ((this.held(plus) ? 1 : 0) - (this.held(minus) ? 1 : 0)) as -1 | 0 | 1;
  }

  /** Feeds an input; returns the actions pressed / released by it. */
  input(e: GameInput): PadEvent[] {
    const out: PadEvent[] = [];
    const press = (source: string, action: string | null) => {
      if (!action) return;
      this.release(source, out);
      this.sources.set(source, action);
      out.push({ action, down: true });
    };
    if (e.type === 'down') {
      const { tap = null, halves } = this.options;
      if (e.x === null || e.y === null) press('space', tap);
      else press(`p${e.id ?? 0}`, this.hit(e.x, e.y)?.action ?? (halves && !this.ctx.touch ? halves[e.x < 640 ? 0 : 1] : tap));
    } else if (e.type === 'up') {
      this.release(e.x === null ? 'space' : `p${e.id ?? 0}`, out);
    } else if (e.type === 'move' && e.pressed) {
      const source = `p${e.id ?? 0}`;
      const current = this.sources.get(source);
      const over = this.hit(e.x, e.y);
      if (current && over && over.action !== current && this.buttons.some((b) => b.action === current)) press(source, over.action);
    } else if (e.type === 'key') {
      const source = `k${e.key}`;
      if (!e.repeat || !this.sources.has(source)) press(source, this.buttons.find((b) => b.keys?.includes(e.key))?.action ?? null);
    } else if (e.type === 'keyup') {
      this.release(`k${e.key}`, out);
    }
    return out;
  }

  /** Draws the buttons (touch) or key caps (keyboard). */
  draw(): void {
    const c = g();
    for (const b of this.buttons) {
      const on = this.held(b.action);
      if (this.ctx.touch) {
        const r = b.r ?? (b.big ? 70 : 60);
        c.save();
        c.globalAlpha = 0.92;
        circle(b.x + 5, b.y + 6, r, INK, 0);
        const d = on ? 3 : 0;
        circle(b.x + d, b.y + d, r, on ? '#7dff9b' : b.big ? '#ffe04a' : '#fff8e8', 6);
        c.restore();
        outlineText(b.label, b.x + d, b.y + d, b.label.length > 2 ? 26 : 44, INK, 'center', 0);
      } else if (b.keys?.[0]) {
        keyCap(b.x, b.y + 10, b.keys[0], on ? 0.78 : 0.7, on ? 'ok' : null);
        if (b.label.length > 2) outlineText(b.label, b.x, b.y + 62, 20, '#fff', 'center', 4);
      }
    }
  }

  private hit(x: number, y: number): PadButton | undefined {
    if (!this.ctx.touch) return undefined;
    return this.buttons.find((b) => Math.hypot(x - b.x, y - b.y) <= (b.r ?? (b.big ? 70 : 60)) + 14);
  }

  private release(source: string, out: PadEvent[]): void {
    const action = this.sources.get(source);
    if (action === undefined) return;
    this.sources.delete(source);
    if (!this.held(action)) out.push({ action, down: false });
  }
}
