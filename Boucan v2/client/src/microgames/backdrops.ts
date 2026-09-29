import type { ZoneId } from '@boucan/shared';
import { assets } from '../engine/assets';
import { g, H, INK, W } from '../engine/draw';

/**
 * The worlds' scenery, shared by the microgames and the stage (intro,
 * interludes). A world = a painted picture (manifest "backgrounds", with its
 * ground line). Prairie, desert and treasure room are "dioramas": the
 * picture slightly blurred, far pieces veiled by the air, a cut-out paper
 * ground band, big trees / rocks / chests in front, a warm light and a few
 * floating particles. Built once per (world, ground, layout) in an offscreen
 * canvas, so a frame costs one drawImage plus the particles.
 */
export type SceneId = ZoneId;

/** Flat stand-ins when the picture is missing: sky, ground. */
const FALLBACK: Record<SceneId, [string, string]> = {
  prairie: ['#5fb7ff', '#78c458'],
  desert: ['#4aa8ff', '#f2c86a'],
  tresor: ['#1d2346', '#b88a5a'],
  futur: ['#7fd0ff', '#dfe8ee'],
  ville: ['#8fd3ff', '#4cc06d'],
};

interface Piece {
  k: string;
  x: number;
  /** Feet, relative to the ground line. */
  y: number;
  h: number;
  flip?: boolean;
  /** Trees and palms: a wider contact shadow. */
  tree?: boolean;
}
interface Layout {
  far: Piece[];
  near: Piece[];
}

/** Deterministic layout of the decor pieces for a game (same seed = same arrangement). */
function layoutOf(world: SceneId, seed: string): Layout | null {
  let v = 2166136261;
  for (const ch of world + seed) v = Math.imul(v ^ ch.charCodeAt(0), 16777619);
  v = v >>> 0 || 7;
  const R = () => {
    v ^= v << 13;
    v ^= v >>> 17;
    v ^= v << 5;
    return (v >>> 0) / 4294967296;
  };
  const pick = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)]!;
  if (world === 'prairie') {
    const trees = ['p-t1', 'p-t2', 'p-t3', 'p-t4'];
    const far: Piece[] = [];
    const groups: [number, number][] = [
      [60 + R() * 80, 2],
      [380 + R() * 120, 1 + Math.floor(R() * 2)],
      [760 + R() * 140, 2],
      [1110 + R() * 110, 1 + Math.floor(R() * 2)],
    ];
    for (const [gx, n] of groups) {
      for (let i = 0; i < n; i++) far.push({ k: pick(trees), x: gx + (i - (n - 1) / 2) * 70 + R() * 20, y: -24 + R() * 8, h: 104 + R() * 54, flip: R() < 0.5 });
    }
    const near: Piece[] = [];
    for (const [right, tx] of [
      [false, 70 + R() * 70],
      [true, 1210 - R() * 70],
    ] as const) {
      near.push({ k: pick(trees), x: tx, y: -30, h: 243 + R() * 45, flip: right, tree: true });
      near.push({ k: pick(['p-r1', 'p-r3', 'p-r4']), x: right ? tx - 125 - R() * 25 : tx + 125 + R() * 25, y: -28, h: 56 + R() * 23, flip: R() < 0.5 });
    }
    return { far: far.sort((a, b) => a.y - b.y), near };
  }
  if (world === 'desert') {
    const sw = R() < 0.5;
    const px = sw ? 330 + R() * 80 : 900 + R() * 80;
    const far: Piece[] = [
      { k: 'd-pyr', x: px, y: -65, h: 171 + R() * 27 },
      { k: 'd-pyr', x: px + (sw ? 185 : -185), y: -61, h: 95 + R() * 13 },
      { k: 'd-camel', x: sw ? 960 + R() * 120 : 230 + R() * 120, y: -45, h: 70, flip: R() < 0.5 },
    ];
    const palm = () => (R() < 0.5 ? 'd-palm1' : 'd-palm2');
    const bush = () => (R() < 0.5 ? 'd-agave' : 'd-bush');
    const near: Piece[] = [
      { k: palm(), x: 70 + R() * 70, y: -30, h: 270 + R() * 45, tree: true },
      { k: bush(), x: 200 + R() * 30, y: -28, h: 56 + R() * 16, flip: R() < 0.5 },
      { k: palm(), x: 1210 - R() * 70, y: -30, h: 261 + R() * 45, flip: true, tree: true },
      { k: bush(), x: 1080 - R() * 30, y: -28, h: 52 + R() * 16, flip: R() < 0.5 },
    ];
    return { far: far.sort((a, b) => a.y - b.y), near };
  }
  if (world === 'tresor') {
    const sw = R() < 0.5;
    const far: Piece[] = [
      { k: 't-coins', x: 470 + R() * 40, y: -128, h: 47 },
      { k: 't-skull', x: 800 + R() * 40, y: -128, h: 34 },
      { k: 't-chest', x: sw ? 560 : 740, y: -130, h: 43 },
    ];
    type Pile = Omit<Piece, 'x'> & { dx: number };
    const chest: Pile[] = [
      { k: 't-chest', dx: 0, y: -74, h: 101 + R() * 13 },
      { k: 't-coins', dx: 118, y: -70, h: 59 + R() * 11 },
      { k: 't-gemr', dx: 58, y: -65, h: 31 },
    ];
    const coins: Pile[] = [
      { k: 't-coins', dx: 0, y: -72, h: 79 + R() * 11 },
      { k: 't-skull', dx: -110, y: -68, h: 41 },
      { k: 't-gemb', dx: 58, y: -65, h: 31 },
    ];
    const lx = 110 + R() * 40;
    const rx = 1160 - R() * 40;
    const near: Piece[] = [
      ...(sw ? coins : chest).map(({ dx, ...p }) => ({ ...p, x: lx + dx })),
      ...(sw ? chest : coins).map(({ dx, ...p }) => ({ ...p, x: rx - dx, flip: true })),
    ];
    return { far: far.sort((a, b) => a.y - b.y), near: near.sort((a, b) => a.y - b.y) };
  }
  return null;
}

/** Colours of the paper ground band: top, middle, bottom, shadow rgb. */
const BAND: Partial<Record<SceneId, [string, string, string, string]>> = {
  prairie: ['#94d86a', '#78c458', '#4f9a45', '20,50,30'],
  desert: ['#fbe39a', '#f2c86a', '#d9a04a', '90,60,20'],
};
/** Air veiling the far pieces. */
const HAZE: Partial<Record<SceneId, string>> = {
  prairie: 'rgba(140,195,255,.42)',
  desert: 'rgba(255,226,185,.4)',
  tresor: 'rgba(60,35,80,.38)',
};
/** Light of each world: warm key light (soft-light), shade in the opposite corner (multiply). */
const LIGHT: Record<SceneId, [number, number, string, number][]> = {
  prairie: [[260, -72, '255,228,160', 0.55], [1180, 738, '30,50,90', 0.26]],
  desert: [[1050, -54, '255,238,190', 0.55], [200, 756, '120,60,20', 0.22]],
  tresor: [[640, 234, '255,175,90', 0.5], [640, 828, '40,15,40', 0.3]],
  futur: [[1000, -54, '190,240,255', 0.5], [200, 738, '20,30,90', 0.3]],
  ville: [[260, -72, '255,214,150', 0.55], [1180, 738, '40,20,90', 0.35]],
};
/** Floating particles: count, kind, sun rays. */
const AMBIENT: Record<SceneId, [number, 'leaf' | 'mote' | 'spark', boolean]> = {
  prairie: [16, 'leaf', true],
  desert: [20, 'mote', true],
  tresor: [26, 'spark', false],
  futur: [28, 'spark', true],
  ville: [22, 'mote', true],
};

type Surface = HTMLCanvasElement | OffscreenCanvas;
const cache = new Map<string, Surface>();
const veiled = new Map<string, Surface>();

function surface(w: number, h: number): Surface | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function context(s: Surface | null): CanvasRenderingContext2D | null {
  return s ? (s.getContext('2d') as CanvasRenderingContext2D | null) : null;
}

/** A decor piece seen through the air: slightly blurred and tinted (built once). */
function veil(k: string, tint: string): CanvasImageSource | undefined {
  const img = assets.image(k);
  if (!img) return undefined;
  const key = `${k}|${tint}`;
  const done = veiled.get(key);
  if (done) return done;
  const s = surface(img.width, img.height);
  const x = context(s);
  if (!s || !x) return img;
  x.filter = 'blur(1.4px)';
  x.drawImage(img, 0, 0);
  x.filter = 'none';
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = tint;
  x.fillRect(0, 0, s.width, s.height);
  veiled.set(key, s);
  return s;
}

function drawPiece(c: CanvasRenderingContext2D, p: Piece, groundY: number, far: boolean, world: SceneId): void {
  const ref = assets.image(p.k);
  const img = far ? veil(p.k, HAZE[world] ?? 'rgba(0,0,0,0)') : ref;
  if (!img || !ref) return;
  const w = (p.h * ref.width) / ref.height;
  c.save();
  c.translate(p.x, groundY + p.y);
  if (p.flip) c.scale(-1, 1);
  if (!far) {
    c.shadowColor = 'rgba(25,40,30,.3)';
    c.shadowBlur = 8;
    c.shadowOffsetX = p.flip ? -10 : 10;
    c.shadowOffsetY = 6;
  }
  c.drawImage(img, -w / 2, -p.h, w, p.h);
  c.restore();
}

/** The picture covering the view with its ground line at `groundY` (mirrored tiles when scrolling). */
function picture(c: CanvasRenderingContext2D, id: SceneId, groundY: number, scroll: number, skyOnly: boolean, blur: boolean): boolean {
  const bg = assets.background(id);
  if (!bg) {
    const [sky, ground] = FALLBACK[id];
    c.fillStyle = sky;
    c.fillRect(0, 0, W, groundY);
    c.fillStyle = ground;
    c.fillRect(0, groundY, W, H - groundY);
    c.fillStyle = INK;
    c.fillRect(0, groundY - 4, W, 8);
    return false;
  }
  const { image, floor } = bg;
  const s = Math.max(W / image.width, groundY / (floor * image.height), skyOnly ? 0 : (H - groundY) / ((1 - floor) * image.height || 1));
  const w = image.width * s;
  const h = image.height * s;
  const y = groundY - floor * h;
  if (blur) c.filter = 'blur(2px) saturate(1.08)';
  if (!scroll) c.drawImage(image, (W - w) / 2, y, w, h);
  else {
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
  c.filter = 'none';
  return true;
}

function band(c: CanvasRenderingContext2D, world: SceneId, groundY: number): void {
  const col = BAND[world];
  if (!col) return;
  const top = (x: number) => groundY - 38 + Math.sin(x / 150) * 6 + Math.sin(x / 61) * 2;
  c.save();
  c.beginPath();
  c.moveTo(-20, H);
  for (let x = -20; x <= 1300; x += 20) c.lineTo(x, top(x));
  c.lineTo(1300, H);
  c.closePath();
  const gr = c.createLinearGradient(0, groundY - 50, 0, H);
  gr.addColorStop(0, col[0]);
  gr.addColorStop(0.35, col[1]);
  gr.addColorStop(1, col[2]);
  c.fillStyle = gr;
  c.shadowColor = `rgba(${col[3]},.35)`;
  c.shadowBlur = 14;
  c.shadowOffsetY = -2;
  c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = '#fffdf6';
  c.lineWidth = 5;
  c.beginPath();
  for (let x = -20; x <= 1300; x += 20) {
    if (x === -20) c.moveTo(x, top(x));
    else c.lineTo(x, top(x));
  }
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,.12)';
  for (let i = 0; i < 26; i++) {
    c.beginPath();
    c.ellipse((i * 97) % 1280, groundY + ((i * 53) % 90), 26, 5, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function light(c: CanvasRenderingContext2D, world: SceneId): void {
  c.save();
  LIGHT[world].forEach(([x, y, col, a], i) => {
    const gr = c.createRadialGradient(x, y, 40, x, y, i ? 900 : 1100);
    gr.addColorStop(0, `rgba(${col},${a})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    c.globalCompositeOperation = i ? 'multiply' : 'soft-light';
    c.fillStyle = gr;
    c.fillRect(0, 0, W, H);
  });
  c.restore();
}

/** Everything that does not move, in one picture. */
function bake(c: CanvasRenderingContext2D, world: SceneId, groundY: number, seed: string): void {
  if (!picture(c, world, groundY, 0, false, true)) return;
  const L = layoutOf(world, seed);
  if (L) for (const p of L.far) drawPiece(c, p, groundY, true, world);
  band(c, world, groundY);
  if (L) {
    for (const p of L.near) {
      c.fillStyle = 'rgba(20,30,20,.22)';
      c.beginPath();
      c.ellipse(p.x + 10, groundY + p.y - 2, p.h * (p.tree ? 0.26 : 0.4), p.h * 0.04 + 4, 0, 0, Math.PI * 2);
      c.fill();
      drawPiece(c, p, groundY, false, world);
    }
  }
  light(c, world);
}

/** Particles in the air (drawn every frame, over the baked scenery). */
function ambient(c: CanvasRenderingContext2D, world: SceneId, t: number, height: number): void {
  const [count, kind, rays] = AMBIENT[world];
  const T = t / 1000;
  const rnd = (i: number, k: number) => {
    const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  c.save();
  c.globalCompositeOperation = 'lighter';
  if (rays) {
    for (let k = 0; k < 3; k++) {
      const x = 200 + k * 380 + Math.sin(T * 0.15 + k * 2) * 90;
      const gr = c.createLinearGradient(x, 0, x + 260, height);
      gr.addColorStop(0, 'rgba(255,245,200,.10)');
      gr.addColorStop(1, 'rgba(255,245,200,0)');
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 120, 0);
      c.lineTo(x + 380, height);
      c.lineTo(x + 200, height);
      c.closePath();
      c.fill();
    }
  }
  for (let i = 0; i < count; i++) {
    const a = rnd(i, 1);
    const b = rnd(i, 2);
    const e = rnd(i, 3);
    const d = rnd(i, 4);
    if (kind === 'leaf') {
      const x = ((a * 1400 + T * (28 + e * 30) + Math.sin(T * 1.2 + i) * 40) % 1400) - 60;
      const y = ((b * (height + 100) + T * (22 + d * 30)) % (height + 100)) - 50;
      c.save();
      c.globalCompositeOperation = 'source-over';
      c.translate(x, y);
      c.rotate(T * (1 + e) + i);
      c.fillStyle = e > 0.5 ? 'rgba(150,210,80,.85)' : 'rgba(240,200,80,.8)';
      c.beginPath();
      c.ellipse(0, 0, 7 + e * 4, 3.5, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
      continue;
    }
    const spark = kind === 'spark';
    const x = spark ? a * 1280 + Math.sin(T + i) * 10 : ((a * 1340 + T * (6 + e * 10)) % 1340) - 30;
    const y = spark ? height - ((b * height + T * (25 + d * 30)) % height) : b * height * 0.9 + Math.sin(T * 0.4 + i) * 20;
    const r = spark ? 1.5 + e * 2 : 1.2 + e * 2.2;
    const col = spark ? (world === 'tresor' ? '255,205,90' : '150,240,255') : '255,255,235';
    const al = spark ? 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(T * 4 + i)) : 0.25 + 0.3 * Math.sin(T * 1.3 + i);
    if (al <= 0) continue;
    c.fillStyle = `rgba(${col},${al * 0.18})`;
    c.beginPath();
    c.arc(x, y, r * 3.4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = `rgba(${col},${al})`;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/**
 * Draws a world so that it covers the whole 1280×720 view with its ground
 * line exactly at `groundY` (characters stand on the painted floor).
 * `scroll` pans the bare picture (mirrored tiles, for running games).
 * `skyOnly`: the game paints its own ground, only cover what is above it.
 * `seed` picks the arrangement of the decor pieces (use the microgame id).
 */
export function sceneBg(id: SceneId, groundY: number, scroll = 0, skyOnly = false, seed = ''): void {
  const c = g();
  if (scroll || skyOnly) {
    picture(c, id, groundY, scroll, skyOnly, false);
    return;
  }
  const key = `${id}|${Math.round(groundY)}|${seed}`;
  let baked = cache.get(key);
  if (!baked && assets.background(id)) {
    const s = surface(W, H);
    const x = context(s);
    if (s && x) {
      bake(x, id, groundY, seed);
      if (cache.size >= 8) cache.delete(cache.keys().next().value!);
      cache.set(key, s);
      baked = s;
    }
  }
  if (baked) c.drawImage(baked, 0, 0, W, H);
  else bake(c, id, groundY, seed);
  ambient(c, id, typeof performance === 'undefined' ? 0 : performance.now(), groundY + 60);
}

/**
 * Sky, hills and far groves of the prairie with the horizon at `horizonY`,
 * for 3D scenes that paint their own ground (jump rope, tug of war, boxing,
 * rafting). `pan` slides it sideways.
 */
export function skyline(horizonY: number, pan = 0, seed = ''): void {
  const c = g();
  c.fillStyle = FALLBACK.prairie[0];
  c.fillRect(0, 0, W, Math.max(0, horizonY + 40));
  const bg = assets.background('prairie');
  if (bg) {
    const s = 1340 / bg.image.width;
    const w = bg.image.width * s;
    const h = bg.image.height * s;
    c.filter = 'blur(2px)';
    c.drawImage(bg.image, (W - w) / 2 - pan, horizonY + 54 - 0.86 * h, w, h);
    c.filter = 'none';
  }
  const L = layoutOf('prairie', `sky${seed}`);
  if (!L) return;
  const k = Math.max(0.5, Math.min(1, (horizonY + 72) / 540));
  for (const p of L.far) drawPiece(c, { ...p, y: 7, h: p.h * k }, horizonY, true, 'prairie');
}
