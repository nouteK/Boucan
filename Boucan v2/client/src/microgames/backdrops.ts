import type { ZoneId } from '@boucan/shared';
import { assets } from '../engine/assets';
import { g, H, INK, W } from '../engine/draw';

/** The four worlds: painted scenes (manifest "backgrounds", with their ground line), also used by the stage. */
export type SceneId = ZoneId;

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
