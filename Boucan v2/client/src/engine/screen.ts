import { GAME } from '../config';
import { setContext } from './draw';

/**
 * The game canvas: a fixed logical 1280×720 space, letterboxed to fit any
 * window (phones in landscape included), sharp on high-DPI screens.
 */
export class Screen {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** CSS px per logical px, and letterbox offsets (CSS px). */
  private scale = 1;
  private offX = 0;
  private offY = 0;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.canvas.setAttribute('aria-label', `${GAME.title} — jeu`);
    parent.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    const resize = () => this.resize();
    addEventListener('resize', resize);
    screen.orientation?.addEventListener?.('change', resize);
    this.resize();
  }

  private resize(): void {
    const vw = innerWidth;
    const vh = innerHeight;
    // Hidden / minimised window or mid-rotation: keep the last size (a 0 px canvas cannot be drawn).
    if (vw < 1 || vh < 1) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.scale = Math.min(vw / GAME.width, vh / GAME.height);
    const cssW = GAME.width * this.scale;
    const cssH = GAME.height * this.scale;
    this.offX = (vw - cssW) / 2;
    this.offY = (vh - cssH) / 2;
    Object.assign(this.canvas.style, {
      width: `${cssW}px`,
      height: `${cssH}px`,
      left: `${this.offX}px`,
      top: `${this.offY}px`,
    });
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
  }

  /** Prepares the context for a frame in logical coordinates. */
  begin(): CanvasRenderingContext2D {
    const k = this.canvas.width / GAME.width;
    this.ctx.setTransform(k, 0, 0, k, 0, 0);
    this.ctx.imageSmoothingQuality = 'high';
    setContext(this.ctx);
    return this.ctx;
  }

  /** Window coordinates → logical coordinates. */
  toLogical(clientX: number, clientY: number): [number, number] {
    return [(clientX - this.offX) / this.scale, (clientY - this.offY) / this.scale];
  }

  /** Portrait phone: the game asks to rotate. */
  get portrait(): boolean {
    return innerHeight > innerWidth * 1.1 && innerWidth < 900;
  }
}

/** Offscreen logical canvas (microgames are drawn here, then composed with zoom transitions). */
export function offscreen(dprScale = 1): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; resize(k: number): void } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const resize = (k: number) => {
    canvas.width = Math.round(GAME.width * k);
    canvas.height = Math.round(GAME.height * k);
  };
  resize(dprScale);
  return { canvas, ctx, resize };
}
