import type { Screen } from './screen';

/**
 * Unified input, in logical coordinates:
 *   down / up : touch, click, or Space / Enter (x = null for keys)
 *   move      : pointer position (pressed = that pointer is down)
 *   key       : arrows / ZQSD (repeat = held key auto-repeat: ignore it when mashing)
 *   keyup     : that key released (hold mechanics)
 * Pointer events carry the pointer `id`: several fingers can be down at once
 * (on-screen buttons, see microgames/pad.ts); keys have no id.
 * Every microgame is playable with one finger OR the keyboard.
 */
export type ArrowKey = 'left' | 'right' | 'up' | 'down';
export type GameInput =
  | { type: 'down'; x: number | null; y: number | null; id?: number }
  | { type: 'up'; x: number | null; y: number | null; id?: number }
  | { type: 'move'; x: number; y: number; pressed: boolean; id?: number }
  | { type: 'key'; key: ArrowKey; repeat: boolean }
  | { type: 'keyup'; key: ArrowKey };

/**
 * Touch mode: the last thing used was a finger (on-screen buttons shown), not
 * a mouse or the keyboard. Starts from the device's main pointer.
 */
let touchMode = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function isTouchMode(): boolean {
  return touchMode;
}

export class Input {
  private listeners = new Set<(e: GameInput) => void>();
  /** Pointers currently down. */
  private readonly down = new Set<number>();

  constructor(screen: Screen) {
    const el = screen.canvas;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      touchMode = e.pointerType === 'touch' || e.pointerType === 'pen';
      const [x, y] = screen.toLogical(e.clientX, e.clientY);
      this.down.add(e.pointerId);
      this.emit({ type: 'down', x, y, id: e.pointerId });
    });
    el.addEventListener('pointermove', (e) => {
      const [x, y] = screen.toLogical(e.clientX, e.clientY);
      this.emit({ type: 'move', x, y, pressed: this.down.has(e.pointerId), id: e.pointerId });
    });
    const up = (e: PointerEvent) => {
      if (!this.down.delete(e.pointerId)) return;
      const [x, y] = screen.toLogical(e.clientX, e.clientY);
      this.emit({ type: 'up', x, y, id: e.pointerId });
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      const k = keyOf(e);
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        touchMode = false;
        if (!e.repeat) this.emit({ type: 'down', x: null, y: null });
      } else if (k) {
        e.preventDefault();
        touchMode = false;
        this.emit({ type: 'key', key: k, repeat: e.repeat });
      }
    });
    addEventListener('keyup', (e) => {
      if (isTyping(e)) return;
      if (e.key === ' ' || e.key === 'Enter') this.emit({ type: 'up', x: null, y: null });
      const k = keyOf(e);
      if (k) this.emit({ type: 'keyup', key: k });
    });
  }

  on(listener: (e: GameInput) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: GameInput): void {
    for (const l of this.listeners) l(e);
  }
}

/** Arrows, plus ZQSD (AZERTY) and WASD (QWERTY). */
const KEYS: Record<string, ArrowKey> = {
  arrowleft: 'left',
  arrowright: 'right',
  arrowup: 'up',
  arrowdown: 'down',
  q: 'left',
  a: 'left',
  d: 'right',
  z: 'up',
  w: 'up',
  s: 'down',
};

function keyOf(e: KeyboardEvent): ArrowKey | undefined {
  return KEYS[e.key.toLowerCase()];
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
