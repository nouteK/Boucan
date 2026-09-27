import { GAME } from '../config';

/**
 * Drawing toolkit. Everything draws into the "current" 2D context (set by the
 * renderer before each scene) in the logical 1280×720 space, with the game's
 * graphic style: flat colours, thick black outlines, chunky bold type.
 */
let current: CanvasRenderingContext2D | null = null;

export function setContext(ctx: CanvasRenderingContext2D): void {
  current = ctx;
}

export function g(): CanvasRenderingContext2D {
  if (!current) throw new Error('draw: no current context');
  return current;
}

export const W = GAME.width;
export const H = GAME.height;
export const INK = GAME.ink;

export function font(size: number): string {
  return `${size}px ${GAME.font}`;
}

/** Bold text with a thick black outline — the signature of the game. */
export function outlineText(
  text: string,
  x: number,
  y: number,
  size: number,
  fill = '#fff',
  align: CanvasTextAlign = 'center',
  lineWidth?: number,
): void {
  const c = g();
  c.font = font(size);
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = lineWidth ?? Math.max(5, size / 8);
  c.strokeStyle = INK;
  c.strokeText(text, x, y);
  c.fillStyle = fill;
  c.fillText(text, x, y);
}

/**
 * WarioWare-style impact text: arrives huge, slams to size with a wobble.
 * `t` = ms since it appeared.
 */
export function slam(text: string, t: number, fill: string, x: number, y: number, size = 130, maxWidth = 1150, tilt = -0.05): void {
  const c = g();
  const k = Math.min(1, t / 140);
  const s = k < 1 ? 2.8 - 1.8 * easeOutBack(k) : 1 + Math.sin(t / 55) * 0.03 * Math.max(0, 1 - (t - 140) / 450);
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  c.font = font(size);
  const fit = Math.min(1, maxWidth / c.measureText(text).width);
  c.scale(s * fit, s * fit);
  outlineText(text, 0, 0, size, fill, 'center', size / 7);
  c.restore();
}

export function easeOutBack(k: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2;
}
export const easeOutCubic = (k: number) => 1 - (1 - k) ** 3;
export const easeInCubic = (k: number) => k * k * k;
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Diagonal animated stripes background. */
export function stripes(col: string, t: number, speed = 1, alpha = 0.16): void {
  const c = g();
  c.fillStyle = col;
  c.fillRect(0, 0, W, H);
  c.save();
  c.fillStyle = `rgba(255,255,255,${alpha})`;
  c.translate(W / 2, H / 2);
  c.rotate(-0.35);
  const off = ((t * 0.05 * speed) % 140) - 140;
  for (let x = -1100 + off; x < 1100; x += 140) c.fillRect(x, -900, 56, 1800);
  c.restore();
}

/** Polka dots background (alternative pattern). */
export function dots(col: string, dot: string, t: number): void {
  const c = g();
  c.fillStyle = col;
  c.fillRect(0, 0, W, H);
  c.fillStyle = dot;
  const off = (t * 0.02) % 80;
  for (let y = -80; y < H + 80; y += 80) {
    for (let x = -80; x < W + 80; x += 80) {
      c.beginPath();
      c.arc(x + off + ((y / 80) % 2) * 40, y + off, 14, 0, Math.PI * 2);
      c.fill();
    }
  }
}

export function radial(col: string, t: number, rays = 18): void {
  const c = g();
  c.fillStyle = col;
  c.fillRect(0, 0, W, H);
  c.save();
  c.translate(W / 2, H / 2);
  c.rotate(t / 4000);
  c.fillStyle = 'rgba(255,255,255,.14)';
  for (let i = 0; i < rays; i++) {
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, 1400, (i / rays) * Math.PI * 2, ((i + 0.5) / rays) * Math.PI * 2);
    c.fill();
  }
  c.restore();
}

export function box(x: number, y: number, w: number, h: number, fill: string, lw = 7, r = 0): void {
  const c = g();
  c.fillStyle = fill;
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.beginPath();
  if (r > 0) c.roundRect(x, y, w, h, r);
  else c.rect(x, y, w, h);
  c.fill();
  c.stroke();
}

export function circle(x: number, y: number, r: number, fill: string, lw = 6): void {
  const c = g();
  c.fillStyle = fill;
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  if (lw > 0) c.stroke();
}

export function ellipse(x: number, y: number, rx: number, ry: number, fill: string, lw = 6, rot = 0): void {
  const c = g();
  c.fillStyle = fill;
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fill();
  if (lw > 0) c.stroke();
}

export function poly(points: [number, number][], fill: string, lw = 6): void {
  const c = g();
  c.fillStyle = fill;
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
  if (lw > 0) c.stroke();
}

export function shadow(x: number, y: number, w = 110, alpha = 0.25): void {
  const c = g();
  c.fillStyle = `rgba(0,0,0,${alpha})`;
  c.beginPath();
  c.ellipse(x, y, w, w * 0.13, 0, 0, Math.PI * 2);
  c.fill();
}

/** Comic starburst (success, impact). k in [0,1] = life. */
export function star(x: number, y: number, k: number, col = '#ffe04a', r = 55): void {
  const c = g();
  c.save();
  c.translate(x, y);
  c.rotate(k * 2);
  c.scale(0.6 + k * 0.8, 0.6 + k * 0.8);
  c.globalAlpha = Math.max(0, 1 - k);
  poly(
    Array.from({ length: 16 }, (_, i) => {
      const rr = i % 2 ? r * 0.42 : r;
      const a = (i / 16) * Math.PI * 2;
      return [Math.cos(a) * rr, Math.sin(a) * rr] as [number, number];
    }),
    col,
    6,
  );
  c.restore();
}

/** Big static burst (explosions, "BOOM"). */
export function burst(x: number, y: number, r: number, col = '#ffcf3b', inner = '#fff4c2', rot = 0): void {
  const c = g();
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  const pts = (rr: number) =>
    Array.from({ length: 22 }, (_, i) => {
      const q = i % 2 ? rr * 0.55 : rr * (0.9 + ((i * 37) % 10) / 50);
      const a = (i / 22) * Math.PI * 2;
      return [Math.cos(a) * q, Math.sin(a) * q] as [number, number];
    });
  poly(pts(r), '#ff5a2a', 7);
  poly(pts(r * 0.72), col, 0);
  poly(pts(r * 0.4), inner, 0);
  c.restore();
}

export function bone(x: number, y: number, sc = 1, rot = 0, fill: string = GAME.paper): void {
  const c = g();
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(sc, sc);
  c.fillStyle = fill;
  c.strokeStyle = INK;
  c.lineWidth = 7;
  c.beginPath();
  for (const bx of [-45, 45]) {
    c.moveTo(bx + 13, -12);
    c.arc(bx, -12, 13, 0, Math.PI * 2);
    c.moveTo(bx + 13, 12);
    c.arc(bx, 12, 13, 0, Math.PI * 2);
  }
  c.rect(-45, -11, 90, 22);
  c.stroke();
  c.fill();
  c.restore();
}

/** Smoke puffs: a tiny particle list owned by the caller. */
export interface Puff {
  x: number;
  y: number;
  t: number;
}
export function drawPuffs(puffs: Puff[], dt: number, scale = 1): Puff[] {
  const c = g();
  const alive = puffs.filter((p) => (p.t += dt) < 420);
  for (const p of alive) {
    const k = p.t / 420;
    const r = ((k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7) * 26 + 4) * scale;
    c.fillStyle = '#fff';
    c.strokeStyle = INK;
    c.lineWidth = 6 * scale;
    c.beginPath();
    c.arc(p.x - k * 40 * scale, p.y - (16 + k * 24) * scale, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  return alive;
}

/** Speech bubble with text. */
export function bubble(x: number, y: number, text: string, size = 40, fill = '#fff', tailDx = -30): void {
  const c = g();
  c.font = font(size);
  const w = c.measureText(text).width + size * 1.1;
  const h = size * 1.7;
  box(x - w / 2, y - h / 2, w, h, fill, 6, h / 2);
  poly(
    [
      [x + tailDx - 14, y + h / 2 - 4],
      [x + tailDx + 14, y + h / 2 - 4],
      [x + tailDx - 4, y + h / 2 + 26],
    ],
    fill,
    6,
  );
  c.fillStyle = fill;
  c.fillRect(x + tailDx - 12, y + h / 2 - 9, 24, 8);
  outlineText(text, x, y + 2, size, INK, 'center', 0);
}

/**
 * Gesture hint icons shown with the instruction (like the hand icons of
 * WarioWare: Smooth Moves): how to play, in one glance.
 */
export function hintIcon(kind: string, x: number, y: number, t: number, s = 1): void {
  const c = g();
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  const press = kind === 'mash' ? Math.abs(Math.sin(t / 60)) : kind === 'tap' ? Math.max(0, Math.sin(t / 160)) : kind === 'hold' ? 1 : 0;
  // Finger
  const fy = -press * 12;
  if (kind === 'move' || kind === 'drag') {
    const dx = Math.sin(t / (kind === 'drag' ? 110 : 260)) * 50;
    poly([[-100, 0], [-70, -24], [-70, 24]], '#fff', 6);
    poly([[100, 0], [70, -24], [70, 24]], '#fff', 6);
    c.translate(dx, 0);
  }
  if (kind === 'wait') {
    outlineText('…', 0, -10, 90, '#fff');
    c.restore();
    return;
  }
  if (kind === 'alternate') {
    // Two fingers pressing in turn, left then right.
    const phase = Math.floor(t / 180) % 2;
    for (const side of [-1, 1] as const) {
      const down = (side < 0 ? phase === 0 : phase === 1) ? 12 : 0;
      box(side * 70 - 14, -64 + down, 28, 62, '#ffd9b3', 6, 14);
      box(side * 70 - 30, -8 + down, 60, 50, '#ffd9b3', 6, 16);
      outlineText(side < 0 ? '◀' : '▶', side * 70, 80, 34, down ? '#ffe04a' : '#fff');
    }
    c.restore();
    return;
  }
  box(-16, -70 + fy, 32, 70, '#ffd9b3', 6, 16);
  box(-34, -10 + fy, 68, 56, '#ffd9b3', 6, 18);
  if (kind === 'tap' || kind === 'mash') {
    const k = (t % 400) / 400;
    c.globalAlpha = 1 - k;
    c.strokeStyle = '#fff';
    c.lineWidth = 6;
    c.beginPath();
    c.arc(0, -70, 20 + k * 40, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 1;
  }
  if (kind === 'mash') outlineText('×10', 70, -60, 34, '#ffe04a');
  if (kind === 'hold') {
    box(-60, 58, 120, 18, '#fff', 5, 9);
    box(-56, 62, 112 * ((t % 1200) / 1200), 10, '#2fd07a', 0, 5);
  }
  c.restore();
}
