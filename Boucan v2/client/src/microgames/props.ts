import { drawSprite } from '../engine/assets';
import { box, burst, circle, ellipse, font, g, INK, outlineText, poly } from '../engine/draw';

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

export function tray(x: number, y: number, rot = 0, sc = 1, items: readonly string[] = ['puree', 'verre', 'pomme']): void {
  const c = g();
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(sc, sc);
  for (const it of items) {
    if (it === 'puree') {
      c.fillStyle = '#f3dfa0';
      c.strokeStyle = INK;
      c.lineWidth = 6;
      c.beginPath();
      c.ellipse(-40, -16, 34, 20, 0, Math.PI, 0);
      c.fill();
      c.stroke();
    }
    if (it === 'verre') box(18, -58, 26, 50, 'rgba(140,210,255,.9)', 6);
    if (it === 'pomme') {
      circle(62, -22, 18, '#ff4a3d', 6);
      box(59, -48, 6, 10, '#2fb65a', 0);
    }
  }
  box(-92, -8, 184, 16, '#b9c3cc', 6, 6);
  c.restore();
}

export function pureeBall(x: number, y: number, r = 34, rot = 0): void {
  const c = g();
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  poly(
    Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      const rr = r * (i % 2 ? 0.85 : 1.05);
      return [Math.cos(a) * rr, Math.sin(a) * rr] as [number, number];
    }),
    '#f3dfa0',
    6,
  );
  circle(-r * 0.3, -r * 0.3, r * 0.2, 'rgba(255,255,255,.6)', 0);
  c.restore();
}

export function splat(x: number, y: number, s = 1, col = '#f3dfa0'): void {
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
    col,
    6,
  );
  c.restore();
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

export function table(x: number, y: number, w: number, groundY: number, col = '#e07b39'): void {
  box(x - w / 2, y, w, 26, col, 7);
  box(x - w / 2 + 20, y + 26, 18, groundY - y - 26, '#a9562a', 5);
  box(x + w / 2 - 38, y + 26, 18, groundY - y - 26, '#a9562a', 5);
}

/** The teacher (a drawn adult silhouette; `back` = facing the board). */
export function teacher(x: number, y: number, h: number, facing: 'front' | 'back' | 'turning', t: number, mood: 'calm' | 'angry' = 'calm'): void {
  const c = g();
  const s = h / 420;
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  const turn = facing === 'turning' ? Math.sin(t / 30) * 0.08 : 0;
  c.rotate(turn);
  box(-60, -40, 50, 40, INK, 0);
  box(10, -40, 50, 40, INK, 0);
  box(-80, -250, 160, 220, '#7a4fd6', 8, 30);
  circle(0, -310, 70, '#ffd9b3', 8);
  // hair bun
  circle(0, -385, 34, '#5a3a22', 7);
  if (facing === 'back') {
    ellipse(0, -318, 72, 62, '#5a3a22', 8);
  } else {
    box(-50, -330, 40, 22, 'rgba(255,255,255,.4)', 5, 8);
    box(10, -330, 40, 22, 'rgba(255,255,255,.4)', 5, 8);
    c.fillStyle = INK;
    c.beginPath();
    c.arc(-30, -318, 6, 0, Math.PI * 2);
    c.arc(30, -318, 6, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 7;
    c.strokeStyle = INK;
    c.beginPath();
    if (mood === 'angry') {
      c.moveTo(-50, -350);
      c.lineTo(-12, -338);
      c.moveTo(50, -350);
      c.lineTo(12, -338);
      c.moveTo(-20, -270);
      c.lineTo(20, -270);
    } else c.arc(0, -285, 18, 0.2, Math.PI - 0.2);
    c.stroke();
  }
  c.restore();
}

export function desk(x: number, y: number, w = 300, col = '#d9a55a'): void {
  box(x - w / 2, y, w, 30, col, 7);
  box(x - w / 2 + 16, y + 30, 20, 120, '#8a5a2b', 5);
  box(x + w / 2 - 36, y + 30, 20, 120, '#8a5a2b', 5);
}

export function paperSheet(x: number, y: number, w: number, h: number, rot = 0, lines = 5): void {
  const c = g();
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  box(-w / 2, -h / 2, w, h, '#fff', 5);
  c.strokeStyle = '#8fc3ff';
  c.lineWidth = 3;
  for (let i = 1; i <= lines; i++) {
    const ly = -h / 2 + (i * h) / (lines + 1);
    c.beginPath();
    c.moveTo(-w / 2 + 10, ly);
    c.lineTo(w / 2 - 10, ly);
    c.stroke();
  }
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

export function gem(x: number, y: number, s = 1, col = '#3fb8ff', rot = 0): void {
  const c = g();
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  poly([[0, -40], [30, -14], [0, 34], [-30, -14]], col, 6);
  poly([[0, -40], [-30, -14], [-6, -14]], 'rgba(255,255,255,.55)', 0);
  c.restore();
}

export function crystal(x: number, y: number, s = 1, rot = 0): void {
  const c = g();
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  poly([[0, -56], [22, -26], [16, 30], [-16, 30], [-22, -26]], '#7ff0ff', 6);
  c.fillStyle = 'rgba(255,255,255,.6)';
  c.fillRect(-8, -36, 6, 56);
  c.restore();
}

/** Treasure chest, lid opening with `open` (0..1). Bottom centre at (x, y). */
export function chest(x: number, y: number, s = 1, open = 0): void {
  const c = g();
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  box(-110, -70, 220, 70, '#a8612f', 7);
  box(-110, -44, 220, 12, '#ffc93c', 0);
  box(-14, -58, 28, 30, '#ffc93c', 5);
  c.save();
  c.translate(-110, -70);
  c.rotate(-open * 1.1);
  c.fillStyle = '#b86d37';
  c.strokeStyle = INK;
  c.lineWidth = 7;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(220, 0);
  c.quadraticCurveTo(220, -60, 110, -62);
  c.quadraticCurveTo(0, -60, 0, 0);
  c.fill();
  c.stroke();
  c.restore();
  c.restore();
}

export function snowBall(x: number, y: number, r = 30, rot = 0): void {
  const c = g();
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  circle(0, 0, r, '#f4f8ff', 6);
  circle(r * 0.25, r * 0.3, r * 0.55, '#bcd3f5', 0);
  circle(-r * 0.35, -r * 0.35, r * 0.2, '#fff', 0);
  c.restore();
}

export function snowSplat(x: number, y: number, s = 1): void {
  splat(x, y, s, '#f4f8ff');
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
