import type { Screen } from './screen';

/**
 * Unified input, in logical coordinates:
 *   down / up : touch, click, or Space / Enter (x = null for keys)
 *   move      : pointer position (pressed = button held)
 *   key       : arrows / ZQSD (repeat = held key auto-repeat: ignore it when mashing)
 *   keyup     : that key released (hold mechanics)
 * Every microgame is playable with one finger OR the keyboard.
 */
export type ArrowKey = 'left' | 'right' | 'up' | 'down';
export type GameInput =
  | { type: 'down'; x: number | null; y: number | null }
  | { type: 'up'; x: number | null; y: number | null }
  | { type: 'move'; x: number; y: number; pressed: boolean }
  | { type: 'key'; key: ArrowKey; repeat: boolean }
  | { type: 'keyup'; key: ArrowKey };

export class Input {
  private listeners = new Set<(e: GameInput) => void>();
  pointer: { x: number; y: number; pressed: boolean } = { x: 640, y: 360, pressed: false };
  /** Keys currently held (for continuous movement). */
  held = new Set<string>();

  constructor(screen: Screen) {
    const el = screen.canvas;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const [x, y] = screen.toLogical(e.clientX, e.clientY);
      this.pointer = { x, y, pressed: true };
      this.emit({ type: 'down', x, y });
    });
    el.addEventListener('pointermove', (e) => {
      const [x, y] = screen.toLogical(e.clientX, e.clientY);
      this.pointer = { x, y, pressed: this.pointer.pressed };
      this.emit({ type: 'move', x, y, pressed: this.pointer.pressed });
    });
    const up = (e: PointerEvent) => {
      const [x, y] = screen.toLogical(e.clientX, e.clientY);
      if (!this.pointer.pressed) return;
      this.pointer = { x, y, pressed: false };
      this.emit({ type: 'up', x, y });
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      const k = keyOf(e);
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!e.repeat) this.emit({ type: 'down', x: null, y: null });
      } else if (k) {
        e.preventDefault();
        this.held.add(k);
        this.emit({ type: 'key', key: k, repeat: e.repeat });
      }
    });
    addEventListener('keyup', (e) => {
      if (isTyping(e)) return;
      if (e.key === ' ' || e.key === 'Enter') this.emit({ type: 'up', x: null, y: null });
      const k = keyOf(e);
      if (k) {
        this.held.delete(k);
        this.emit({ type: 'keyup', key: k });
      }
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
