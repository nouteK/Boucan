import { drawSprite } from '../engine/assets';
import { box, burst, circle, ellipse, font, g, INK, item, outlineText, poly } from '../engine/draw';

/**
 * Reusable props, drawn in the game style. Sprites from the manifest are used
 * when present (e.g. "bombe"), with a drawn fallback otherwise.
 */

/** Bomb character: stage 0 (cold) → 2 (about to blow). Feet at (x, y). */
export function bomb(x: number, y: number, h: number, stage = 0, flip = false, rot = 0): void {
  if (drawSprite('bombe', ['b0', 'b1', 'b2'][Math.max(0, Math.min(2, stage))]!, 0, x, y, h, flip, rot)) return;
  const c = g();
  c.save();
  c.translate(x, y - h * 0.45);
  c.rotate(rot);
  const r = h * 0.36;
  circle(0, 0, r, ['#2b2b3a', '#6b1d3a', '#e8322b'][stage]!, 7);
  box(-r * 0.25, -r * 1.15, r * 0.5, r * 0.3, '#888', 5);
  c.strokeStyle = '#c9a36b';
  c.lineWidth = 7;
  c.beginPath();
  c.moveTo(0, -r * 1.15);
  c.quadraticCurveTo(r * 0.4, -r * 1.6, r * 0.7, -r * 1.4);
  c.stroke();
  burst(r * 0.75, -r * 1.45, r * 0.25, '#ffe04a', '#fff', rot * 3);
  ellipse(-r * 0.35, -r * 0.1, r * 0.16, r * 0.2, '#fff', 4);
  ellipse(r * 0.25, -r * 0.1, r * 0.16, r * 0.2, '#fff', 4);
  c.restore();
}

export function boom(x: number, y: number, h: number, rot = 0): void {
  if (drawSprite('bombe', 'boom', 0, x, y + h / 2, h, false, rot)) return;
  burst(x, y, h * 0.5, '#ffcf3b', '#fff4c2', rot);
}

export function flag(x: number, groundY: number): void {
  const c = g();
  c.fillStyle = INK;
  c.fillRect(x, groundY - 300, 12, 300);
  poly(
    [
      [x + 12, groundY - 300],
      [x + 150, groundY - 255],
      [x + 12, groundY - 210],
    ],
    '#fff',
    8,
  );
  for (let i = 0; i < 3; i++) {
    c.fillStyle = INK;
    c.fillRect(x + 20 + i * 36, groundY - 282 + i * 9, 18, 18);
  }
}

export function bee(x: number, y: number, t: number, flip = false): void {
  const c = g();
  c.save();
  c.translate(x, y);
  if (flip) c.scale(-1, 1);
  const flap = Math.sin(t / 25) * 0.5;
  c.save();
  c.rotate(-0.3 + flap);
  ellipse(-4, -26, 14, 22, 'rgba(255,255,255,.9)', 5);
  c.restore();
  ellipse(0, 0, 34, 24, '#ffd23c', 6);
  c.fillStyle = INK;
  c.fillRect(-14, -22, 9, 44);
  c.fillRect(4, -23, 9, 46);
  poly([[-34, 0], [-52, 0], [-34, -6]], INK, 0);
  circle(22, -6, 4, INK, 0);
  c.restore();
}

/** Direction arrow (triangle) centred on (x, y). */
export function arrow(x: number, y: number, dir: 'left' | 'right' | 'up' | 'down', r: number, fill = INK, lw = 0): void {
  const a = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir];
  const pt = (ang: number, rr: number): [number, number] => [x + Math.cos(a + ang) * rr, y + Math.sin(a + ang) * rr];
  poly([pt(0, r), pt(2.4, r), pt(-2.4, r)], fill, lw);
}

/**
 * On-screen key / button badge: an arrow (left, right, up, down) or a short
 * label. state: 'ok' (done), 'bad' (wrong), 'next' (the one to press now).
 */
export function keyCap(x: number, y: number, key: string, s = 1, state: 'ok' | 'bad' | 'next' | null = null): void {
  const c = g();
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  box(-44, -36, 88, 84, INK, 0, 16);
  box(-44, -46, 88, 84, state === 'ok' ? '#7dff9b' : state === 'bad' ? '#ff6b6b' : state === 'next' ? '#ffe04a' : '#fff8e8', 6, 16);
  if (key === 'left' || key === 'right' || key === 'up' || key === 'down') arrow(0, -4, key, 24);
  else outlineText(key, 0, -2, 44, INK, 'center', 0);
  c.restore();
}

/** Circular countdown ring: p = remaining fraction (1 → 0). */
export function ringTimer(x: number, y: number, r: number, p: number, col = '#ffe04a'): void {
  const c = g();
  c.lineCap = 'round';
  c.strokeStyle = INK;
  c.lineWidth = 12;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = col;
  c.lineWidth = 7;
  c.beginPath();
  c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, p));
  c.stroke();
}

/** Horizontal gauge: value 0..1, in a black frame. */
export function gauge(x: number, y: number, w: number, h: number, value: number, col: string): void {
  box(x - 5, y - 5, w + 10, h + 10, INK, 0, (h + 10) / 2);
  const c = g();
  c.fillStyle = col;
  c.beginPath();
  c.roundRect(x, y, Math.max(h, w * Math.min(1, Math.max(0, value))), h, h / 2);
  c.fill();
}

export function snowBall(x: number, y: number, r = 30, rot = 0): void {
  if (item('snow', x, y, r * 2.1, rot)) return;
  const c = g();
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  circle(0, 0, r, '#f4f8ff', 6);
  circle(r * 0.25, r * 0.3, r * 0.55, '#bcd3f5', 0);
  circle(-r * 0.35, -r * 0.35, r * 0.2, '#fff', 0);
  c.restore();
}

/** Snow splash flattened on the ground, centred on (x, y). */
export function snowSplat(x: number, y: number, s = 1): void {
  const c = g();
  c.save();
  c.translate(x, y);
  c.scale(s, s * 0.45);
  poly(
    Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2;
      const rr = i % 2 ? 40 : 62;
      return [Math.cos(a) * rr, Math.sin(a) * rr] as [number, number];
    }),
    '#f4f8ff',
    6,
  );
  c.restore();
}

/** Label on a sign board. */
export function sign(x: number, y: number, text: string, fill = '#ffe04a', size = 44): void {
  const c = g();
  c.font = font(size);
  const w = c.measureText(text).width + size;
  box(x - w / 2, y - size * 0.8, w, size * 1.6, fill, 7, 14);
  outlineText(text, x, y + 2, size, INK, 'center', 0);
}

/** Speckled egg, standing on (x, y). */
export function egg(x: number, y: number, s = 1, rot = 0): void {
  if (item('egg', x, y - 46 * s, 108 * s, rot)) return;
  const c = g();
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  ellipse(0, -46, 38, 48, '#fff3d6', 7);
  for (const [a, b, r] of [[-14, -62, 9], [15, -42, 7], [-6, -22, 6], [16, -74, 5]] as const) circle(a, b, r, '#8a5cff', 0);
  ellipse(-16, -70, 6, 12, 'rgba(255,255,255,.7)', 0, -0.4);
  c.restore();
}

/** Round potion flask, standing on (x, y); `fill` 0..1 of liquid. */
export function potion(x: number, y: number, s = 1, fill = 0, col = '#35e0ff'): void {
  const c = g();
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  circle(0, -40, 38, 'rgba(220,240,255,.55)', 0);
  if (fill > 0) {
    c.save();
    c.beginPath();
    c.arc(0, -40, 38, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = col;
    c.fillRect(-40, -2 - 76 * fill, 80, 80);
    c.restore();
  }
  circle(0, -40, 38, 'rgba(0,0,0,0)', 6);
  box(-12, -104, 24, 30, 'rgba(220,240,255,.8)', 6, 0);
  box(-15, -116, 30, 14, '#a9562a', 6, 0);
  ellipse(-14, -54, 6, 12, 'rgba(255,255,255,.7)', 0, -0.5);
  c.restore();
}

/** Hovering drone with spinning rotors, centred on (x, y). */
export function drone(x: number, y: number, t: number, tilt = 0, s = 1): void {
  if (item('drone', x, y + 6, 125 * s, tilt)) return;
  const c = g();
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  c.scale(s, s);
  box(-70, -26, 140, 52, '#ffd23c', 6, 26);
  circle(0, 0, 14, '#3fb8ff', 6);
  for (const px of [-70, 70]) {
    c.fillStyle = INK;
    c.fillRect(px - 3, -44, 6, 20);
    const w = 34 * Math.abs(Math.sin(t / 30));
    c.fillStyle = 'rgba(22,22,22,.55)';
    c.fillRect(px - w, -48, w * 2, 6);
  }
  c.restore();
}
