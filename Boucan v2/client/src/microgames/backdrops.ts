import { assets } from '../engine/assets';
import { box, circle, g, H, INK, W } from '../engine/draw';

/**
 * Scenery used by microgames of each zone. A background image declared in the
 * manifest ("backgrounds": { "cantine": "..." }) replaces the drawn one.
 */
function image(zone: string): boolean {
  const bg = assets.background(zone);
  if (!bg) return false;
  g().drawImage(bg.image, 0, 0, W, H);
  return true;
}

/** Painted scenes of the sport / outdoor microgames (manifest "backgrounds", with their ground line). */
export type SceneId = 'foret' | 'ville' | 'neige' | 'futur';

/** Flat stand-ins when the image is missing: sky, ground. */
const SCENE_FALLBACK: Record<SceneId, [string, string]> = {
  foret: ['#2a1f5c', '#6b4f9e'],
  ville: ['#8fd3ff', '#e9dcc5'],
  neige: ['#f0a07c', '#eef4ff'],
  futur: ['#7fd0ff', '#dfe8ee'],
};

/**
 * Draws a scene so that it covers the whole 1280×720 view with its ground
 * line exactly at `groundY` (characters stand on the painted floor).
 * `scroll` pans it horizontally (mirrored tiles, for running games).
 * `skyOnly`: the game paints its own ground, only cover what is above it.
 */
export function sceneBg(id: SceneId, groundY: number, scroll = 0, skyOnly = false): void {
  const c = g();
  const bg = assets.background(id);
  if (!bg) {
    const [sky, ground] = SCENE_FALLBACK[id];
    c.fillStyle = sky;
    c.fillRect(0, 0, W, groundY);
    c.fillStyle = ground;
    c.fillRect(0, groundY, W, H - groundY);
    c.fillStyle = INK;
    c.fillRect(0, groundY - 4, W, 8);
    return;
  }
  const { image, floor } = bg;
  const iw = image.width;
  const ih = image.height;
  const s = Math.max(W / iw, groundY / (floor * ih), skyOnly ? 0 : (H - groundY) / ((1 - floor) * ih || 1));
  const w = iw * s;
  const h = ih * s;
  const y = groundY - floor * h;
  if (!scroll) {
    c.drawImage(image, (W - w) / 2, y, w, h);
    return;
  }
  const x0 = -(((scroll % (2 * w)) + 2 * w) % (2 * w));
  for (let k = 0; x0 + k * w < W; k++) {
    const x = x0 + k * w;
    if (x + w < 0) continue;
    c.save();
    c.translate(x + (k % 2 ? w : 0), y);
    if (k % 2) c.scale(-1, 1);
    c.drawImage(image, 0, 0, w, h);
    c.restore();
  }
}

/** Playground: sky, clouds, fence, grass. */
export function recreBg(t: number, groundY: number, sky = '#8fd3ff'): void {
  if (image('recre')) return;
  const c = g();
  c.fillStyle = sky;
  c.fillRect(0, 0, W, groundY);
  for (let i = 0; i < 3; i++) {
    const x = ((i * 470 + t * 0.012) % (W + 300)) - 150;
    const y = 90 + i * 55;
    c.fillStyle = '#fff';
    for (const [dx, dy, r] of [[0, 0, 40], [40, -18, 46], [85, 0, 38]] as const) {
      c.beginPath();
      c.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      c.fill();
    }
  }
  // fence
  c.fillStyle = '#e8c07a';
  for (let x = 10; x < W; x += 70) box(x, groundY - 150, 44, 150, '#e8c07a', 5);
  box(0, groundY - 120, W, 18, '#d6a55a', 5);
  c.fillStyle = '#52c46b';
  c.fillRect(0, groundY, W, H - groundY);
  c.fillStyle = INK;
  c.fillRect(0, groundY - 4, W, 8);
  c.fillStyle = '#3fae57';
  for (let x = 0; x < W; x += 46) c.fillRect(x + ((x / 46) % 2) * 12, groundY + 30 + ((x * 7) % 40), 16, 8);
}

/** Canteen: tiles, wall, menu board. */
export function cantineBg(t: number, groundY: number): void {
  if (image('cantine')) return;
  const c = g();
  c.fillStyle = '#ffe6a8';
  c.fillRect(0, 0, W, groundY);
  c.fillStyle = '#bfe3d8';
  c.fillRect(0, groundY - 210, W, 210);
  c.strokeStyle = '#9fcbbf';
  c.lineWidth = 3;
  for (let x = 0; x < W; x += 70) {
    c.beginPath();
    c.moveTo(x, groundY - 210);
    c.lineTo(x, groundY);
    c.stroke();
  }
  for (let y = groundY - 210; y < groundY; y += 70) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  c.fillStyle = INK;
  c.fillRect(0, groundY - 214, W, 6);
  box(90, 60, 250, 170, '#8fd3ff', 8);
  c.fillStyle = '#fff';
  c.beginPath();
  c.ellipse(150 + ((t * 0.01) % 200), 110, 34, 14, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 8;
  c.beginPath();
  c.moveTo(215, 60);
  c.lineTo(215, 230);
  c.moveTo(90, 145);
  c.lineTo(340, 145);
  c.stroke();
  for (let y = groundY, r = 0; y < H; y += 56, r++) {
    for (let x = -(r % 2) * 56, k = 0; x < W; x += 56, k++) {
      c.fillStyle = (r + k) % 2 ? '#efe6d2' : '#cdbfa2';
      c.fillRect(x, y, 56, 56);
    }
  }
  c.fillStyle = INK;
  c.fillRect(0, groundY - 4, W, 8);
}

/** Classroom: wall, windows, floor boards. */
export function classeBg(t: number, groundY: number, board = true): void {
  if (image('classe')) return;
  const c = g();
  c.fillStyle = '#f4d9a8';
  c.fillRect(0, 0, W, groundY);
  c.fillStyle = '#e8c890';
  c.fillRect(0, groundY - 120, W, 120);
  c.fillStyle = INK;
  c.fillRect(0, groundY - 124, W, 6);
  if (board) {
    box(300, 60, 680, 300, '#8a5a2b', 8);
    box(316, 76, 648, 268, '#2e5b3f', 6);
  }
  for (const x of [60, 1040]) {
    box(x, 80, 180, 220, '#8fd3ff', 8);
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(x + 60 + Math.sin(t / 2000) * 20, 150, 26, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(x + 90, 80);
    c.lineTo(x + 90, 300);
    c.stroke();
  }
  c.fillStyle = '#c98a4c';
  c.fillRect(0, groundY, W, H - groundY);
  c.strokeStyle = '#a86f35';
  c.lineWidth = 4;
  for (let y = groundY + 30; y < H; y += 36) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  c.fillStyle = INK;
  c.fillRect(0, groundY - 4, W, 8);
  circle(640, 40, 0, INK, 0);
}
