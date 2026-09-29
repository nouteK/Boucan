import { GAME } from '../config';
import { circle, ellipse, g, INK, setPictureSource } from './draw';

/**
 * Assets are declared in public/assets/manifest.json (see README there).
 * Everything has a drawn fallback, so the game runs with no asset at all and
 * a new character / sprite / sound only needs a manifest entry.
 */

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  anchor?: { x: number; y: number };
}
interface AtlasAnim {
  loop?: boolean;
  next?: string;
  frames: { frame: string; ms: number }[];
}
interface Atlas {
  frames: Record<string, AtlasFrame>;
  meta?: { anims?: Record<string, AtlasAnim> };
}

/**
 * How a character shows a logical pose: an animation of its own sheet, or of
 * a sprite sheet (`sprite`) for poses with their own art (boxing gloves,
 * paddle…). scale = height factor, rot / dx / dy = offset, sx / sy = fixed
 * stretch, squash = breathing stretch.
 */
type PoseSpec =
  | string
  | { anim: string; sprite?: string; scale?: number; rot?: number; dx?: number; dy?: number; sx?: number; sy?: number; squash?: number };

interface CharacterEntry {
  name: string;
  image: string;
  atlas: string;
  scale?: number;
  /** Width (source px) of the white "cut-out paper" border drawn around the art. */
  outline?: number;
  poses?: Record<string, PoseSpec>;
}

interface SpriteEntry {
  image: string;
  atlas: string;
  outline?: number;
}

interface Manifest {
  characters?: Record<string, CharacterEntry>;
  sprites?: Record<string, SpriteEntry>;
  sounds?: Record<string, string>;
  music?: Record<string, string>;
  /** World scenes ({ image, floor }), or a plain path. */
  backgrounds?: Record<string, string | { image: string; floor?: number }>;
  /** Plain pictures by name: sticker objects, decor pieces, scene photos. */
  images?: Record<string, string>;
}

/** A scenery image and the height of its ground line (0..1 of the image height). */
export interface Scene {
  image: HTMLImageElement;
  floor: number;
}

export interface LoadedSheet {
  /** The sheet, or its "cut-out paper" version (a canvas of the same size). */
  image: HTMLImageElement | HTMLCanvasElement;
  atlas: Atlas;
}

export interface CharacterInfo {
  id: string;
  name: string;
}

export type Pose =
  | 'idle'
  | 'run'
  | 'start'
  | 'stop'
  | 'punch'
  | 'kick'
  | 'throw'
  | 'duck'
  | 'slide'
  | 'ready'
  | 'hold'
  | 'catch'
  | 'carry'
  | 'hurt'
  | 'win'
  | 'lose'
  | 'box'
  | 'box_punch'
  | 'box_guard'
  | 'box_hurt'
  | 'box_win'
  | 'paddle'
  | 'paddle_hurt'
  | 'pull'
  | 'pull_hard'
  | 'ping'
  | 'ping_ready'
  | 'ping_hit';

const BASE = `${import.meta.env.BASE_URL}assets/`;

class AssetStore {
  private characters = new Map<string, { entry: CharacterEntry; sheet: LoadedSheet }>();
  /** Character ids in manifest order (loading finishes in any order). */
  private characterOrder: string[] = [];
  private sprites = new Map<string, LoadedSheet>();
  private backgrounds = new Map<string, Scene>();
  private images = new Map<string, HTMLImageElement>();
  sounds: Record<string, string> = {};
  music: Record<string, string> = {};

  async load(onProgress?: (k: number) => void): Promise<void> {
    let manifest: Manifest = {};
    try {
      manifest = (await (await fetch(`${BASE}manifest.json`, { cache: 'no-cache' })).json()) as Manifest;
    } catch (error) {
      console.warn('[assets] manifest.json unreadable, drawn fallbacks only', error);
    }
    const jobs: Promise<void>[] = [];
    let done = 0;
    const track = <T>(p: Promise<T>) =>
      p.finally(() => {
        done += 1;
        onProgress?.(done / Math.max(1, jobs.length));
      });
    this.characterOrder = Object.keys(manifest.characters ?? {});
    for (const [id, entry] of Object.entries(manifest.characters ?? {})) {
      jobs.push(
        track(loadSheet(entry.image, entry.atlas, entry.outline)).then(
          (sheet) => void this.characters.set(id, { entry, sheet }),
          (e) => console.warn(`[assets] character "${id}" skipped`, e),
        ),
      );
    }
    for (const [id, entry] of Object.entries(manifest.sprites ?? {})) {
      jobs.push(
        track(loadSheet(entry.image, entry.atlas, entry.outline)).then(
          (sheet) => void this.sprites.set(id, sheet),
          (e) => console.warn(`[assets] sprite "${id}" skipped`, e),
        ),
      );
    }
    for (const [id, bg] of Object.entries(manifest.backgrounds ?? {})) {
      const path = typeof bg === 'string' ? bg : bg.image;
      const floor = typeof bg === 'string' ? 1 : (bg.floor ?? 1);
      jobs.push(
        track(loadImage(path)).then(
          (image) => void this.backgrounds.set(id, { image, floor }),
          () => console.warn(`[assets] background "${id}" skipped`),
        ),
      );
    }
    for (const [id, path] of Object.entries(manifest.images ?? {})) {
      jobs.push(
        track(loadImage(path)).then(
          (image) => void this.images.set(id, image),
          () => console.warn(`[assets] image "${id}" skipped`),
        ),
      );
    }
    this.sounds = manifest.sounds ?? {};
    this.music = manifest.music ?? {};
    await Promise.all(jobs);
  }

  characterList(): CharacterInfo[] {
    const list = this.characterOrder.flatMap((id) => {
      const c = this.characters.get(id);
      return c ? [{ id, name: c.entry.name }] : [];
    });
    return list.length > 0 ? list : [{ id: 'pion', name: 'Pion' }];
  }

  hasCharacter(id: string): boolean {
    return this.characters.has(id);
  }

  /** World scene (prairie, desert, tresor, futur, ville); undefined → drawn fallback. */
  background(id: string): Scene | undefined {
    return this.backgrounds.get(id);
  }

  /** true when the character has dedicated art for this pose (e.g. its own paddle), not a stand-in. */
  hasPoseArt(characterId: string | null, pose: Pose): boolean {
    const spec = characterId ? this.characters.get(characterId)?.entry.poses?.[pose] : undefined;
    return typeof spec === 'object' && spec.sprite !== undefined && this.sprites.has(spec.sprite);
  }

  sprite(id: string): LoadedSheet | undefined {
    return this.sprites.get(id);
  }

  /** Plain picture by name (manifest "images"); undefined → the caller draws a fallback. */
  image(id: string): HTMLImageElement | undefined {
    return this.images.get(id);
  }

  character(id: string) {
    return this.characters.get(id);
  }
}

export const assets = new AssetStore();
setPictureSource((name) => assets.image(name));

function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image ${path}`));
    img.src = BASE + path;
  });
}

async function loadSheet(image: string, atlas: string, outline = 0): Promise<LoadedSheet> {
  const [img, json] = await Promise.all([loadImage(image), fetch(BASE + atlas).then((r) => r.json() as Promise<Atlas>)]);
  return { image: outline > 0 ? paperCut(img, outline) : img, atlas: json };
}

/**
 * "Cut-out paper" look: the art with a cream border of `r` px all around
 * (the silhouette stamped in 16 directions, filled, then the art on top).
 * Built once at load; the original image can then be released.
 */
function paperCut(img: HTMLImageElement, r: number): HTMLImageElement | HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d');
  if (!x) return img;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    x.drawImage(img, Math.cos(a) * r, Math.sin(a) * r);
  }
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = PAPER;
  x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'source-over';
  x.drawImage(img, 0, 0);
  return c;
}

/** Colour of the cut-out border (also used by decor pieces). */
export const PAPER = '#fffdf6';

/** Frame name of an animation at time t (ms since it started). */
export function frameAt(atlas: Atlas, anim: string, t: number): string | null {
  const a = atlas.meta?.anims?.[anim];
  if (!a || a.frames.length === 0) return atlas.frames[anim] ? anim : null;
  const total = a.frames.reduce((s, f) => s + f.ms, 0);
  let k = a.loop ? t % total : Math.min(t, total - 1);
  if (!a.loop && t >= total && a.next) return frameAt(atlas, a.next, t - total);
  for (const f of a.frames) {
    if (k < f.ms) return f.frame;
    k -= f.ms;
  }
  return a.frames[a.frames.length - 1]!.frame;
}

/** Draws one atlas frame with its anchor at (x, y), `h` px tall. */
export function drawFrame(sheet: LoadedSheet, frame: string, x: number, y: number, h: number, flip = false, rot = 0): void {
  const f = sheet.atlas.frames[frame];
  if (!f) return;
  const c = g();
  const fr = f.frame;
  const sc = h / fr.h;
  const w = fr.w * sc;
  const ax = f.anchor?.x ?? 0.5;
  const ay = f.anchor?.y ?? 1;
  c.save();
  c.translate(x, y);
  if (rot) c.rotate(rot);
  if (flip) c.scale(-1, 1);
  c.drawImage(sheet.image, fr.x, fr.y, fr.w, fr.h, -w * ax, -h * ay, w, h);
  c.restore();
}

/** Sprite by id (e.g. "bombe"): anim/frame name + time. Returns false if missing (caller draws a fallback). */
export function drawSprite(id: string, animOrFrame: string, t: number, x: number, y: number, h: number, flip = false, rot = 0): boolean {
  const sheet = assets.sprite(id);
  if (!sheet) return false;
  const frame = frameAt(sheet.atlas, animOrFrame, t);
  if (!frame) return false;
  drawFrame(sheet, frame, x, y, h, flip, rot);
  return true;
}

/**
 * Draws a character in a logical pose. `t` = ms since the pose started
 * (drives the animation). Feet at (x, y), `h` px tall.
 */
export function drawCharacter(
  id: string | null,
  pose: Pose,
  t: number,
  x: number,
  y: number,
  h: number,
  opts: { flip?: boolean; rot?: number; color?: string; alpha?: number } = {},
): void {
  const c = g();
  const found = id ? assets.character(id) : undefined;
  if (opts.alpha !== undefined) {
    c.save();
    c.globalAlpha = opts.alpha;
  }
  if (!found) {
    drawPion(pose, t, x, y, h, opts.color ?? GAME.seatColors[0], opts.flip ?? false, opts.rot ?? 0);
  } else {
    const { entry } = found;
    const spec: PoseSpec = entry.poses?.[pose] ?? entry.poses?.idle ?? 'idle';
    let s: Exclude<PoseSpec, string> = typeof spec === 'string' ? { anim: spec } : spec;
    let sheet = found.sheet;
    if (s.sprite) {
      const own = assets.sprite(s.sprite);
      // Dedicated art not loaded (yet): fall back to the idle pose of the main sheet.
      if (own) sheet = own;
      else s = { anim: typeof entry.poses?.idle === 'string' ? entry.poses.idle : (entry.poses?.idle?.anim ?? 'idle') };
    }
    const frame = frameAt(sheet.atlas, s.anim, t) ?? Object.keys(sheet.atlas.frames)[0]!;
    const hh = h * (entry.scale ?? 1) * (s.scale ?? 1);
    const sgn = opts.flip ? -1 : 1;
    const j = s.sprite ? breathe(t, opts.color) : juice(pose, t, h, sgn, opts.color);
    c.save();
    c.translate(x + j.dx, y + j.dy);
    if (j.r) c.rotate(j.r);
    c.scale(j.sx, j.sy);
    c.translate((s.dx ?? 0) * sgn * (h / 330), (s.dy ?? 0) * (h / 330));
    if (s.sx || s.sy) c.scale(s.sx ?? 1, s.sy ?? 1);
    if (s.squash) c.scale(1 + s.squash, 1 - s.squash * Math.abs(Math.sin(t / 120)));
    drawFrame(sheet, frame, 0, 0, hh, opts.flip, ((s.rot ?? 0) + (opts.rot ?? 0)) * sgn);
    c.restore();
  }
  if (opts.alpha !== undefined) c.restore();
}

interface Juice {
  sx: number;
  sy: number;
  r: number;
  dx: number;
  dy: number;
}
const STILL: Juice = { sx: 1, sy: 1, r: 0, dx: 0, dy: 0 };

/** A phase per player (from their colour), so that idle characters do not breathe in sync. */
function phaseOf(color = ''): number {
  let h = 0;
  for (let i = 0; i < color.length; i++) h = (h * 31 + color.charCodeAt(i)) % 997;
  return (h / 997) * Math.PI * 2;
}

/**
 * Procedural animation over the frames (squash & stretch): breathing when
 * idle, bounce and lean when running, crouch at a jump start, wobble when
 * landing, recoil when hit, lunge on a punch / kick / throw.
 * `t` = ms since the pose started, `h` = drawn height, `sg` = facing (±1).
 */
function juice(pose: Pose, t: number, h: number, sg: number, color?: string): Juice {
  const ph = phaseOf(color);
  switch (pose) {
    case 'idle':
    case 'carry':
    case 'hold': {
      const b = Math.sin(t / 300 + ph);
      return { sx: 1 - 0.014 * b, sy: 1 + 0.024 * b, r: 0.014 * Math.sin(t / 620 + ph), dx: 0, dy: 0 };
    }
    case 'run': {
      const p = t / 82 + ph;
      const c = Math.cos(p * 2);
      return { sx: 1 - 0.025 * c, sy: 1 + 0.035 * c, r: 0.075 * sg + 0.02 * Math.sin(p), dx: 0, dy: -Math.abs(Math.sin(p)) * h * 0.03 };
    }
    case 'start': {
      const k = Math.max(0, 1 - t / 170);
      return { sx: 1 + 0.09 * k, sy: 1 - 0.11 * k, r: 0.05 * sg * (1 - k), dx: 0, dy: 0 };
    }
    case 'stop': {
      const k = Math.max(0, 1 - t / 220) * Math.cos(t / 45);
      return { sx: 1 + 0.1 * k, sy: 1 - 0.12 * k, r: 0, dx: 0, dy: 0 };
    }
    case 'hurt': {
      const k = Math.max(0, 1 - t / 450);
      return { sx: 1 + 0.05 * k, sy: 1 - 0.07 * k, r: -0.14 * sg * k, dx: Math.sin(t / 16) * 11 * k * (h / 330), dy: 0 };
    }
    case 'punch':
    case 'kick':
    case 'throw': {
      const k = Math.max(0, 1 - Math.abs(t - 110) / 130);
      return { sx: 1 + 0.08 * k, sy: 1 - 0.05 * k, r: 0.04 * sg * k, dx: 14 * sg * k * (h / 330), dy: 0 };
    }
    case 'catch':
    case 'ready': {
      const k = Math.max(0, 1 - t / 220);
      return { sx: 1 + 0.08 * k, sy: 1 - 0.1 * k, r: 0, dx: 0, dy: 0 };
    }
    case 'duck':
    case 'slide': {
      const k = Math.max(0, 1 - t / 150);
      return { sx: 1 + 0.08 * k, sy: 1 - 0.08 * k, r: 0, dx: 0, dy: 0 };
    }
    default:
      return STILL;
  }
}

/** Poses drawn from a dedicated sheet (gloves, paddle…) just breathe. */
function breathe(t: number, color?: string): Juice {
  const b = Math.sin(t / 290 + phaseOf(color));
  return { sx: 1 - 0.012 * b, sy: 1 + 0.02 * b, r: 0, dx: 0, dy: 0 };
}

/** Drawn fallback character (no asset needed): a round buddy in the player's colour. */
function drawPion(pose: Pose, t: number, x: number, y: number, h: number, color: string, flip: boolean, rot: number): void {
  const c = g();
  const s = h / 330;
  const bob = pose === 'run' ? Math.abs(Math.sin(t / 70)) * 14 : pose === 'idle' ? Math.sin(t / 260) * 4 : 0;
  const hurt = pose === 'hurt' || pose === 'lose' || pose === 'box_hurt' || pose === 'paddle_hurt';
  const low = pose === 'duck' || pose === 'slide' || pose === 'paddle' || pose === 'paddle_hurt';
  c.save();
  c.translate(x, y - bob * s);
  c.rotate(rot + (hurt ? -0.3 : pose === 'slide' ? -0.5 : pose === 'pull' || pose === 'pull_hard' ? -0.2 : 0) * (flip ? -1 : 1));
  c.scale(s * (flip ? -1 : 1), s * (low ? 0.74 : 1));
  const legA = pose === 'run' ? Math.sin(t / 70) * 30 : 0;
  ellipse(-30 + legA, -20, 26, 20, INK, 0);
  ellipse(30 - legA, -20, 26, 20, INK, 0);
  ellipse(0, -140, 105, 120, color, 8);
  ellipse(0, -250, 80, 72, color, 8);
  circle(28, -262, 16, '#fff', 5);
  circle(32, -262, 7, INK, 0);
  if (hurt) {
    c.strokeStyle = INK;
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(-10, -225);
    c.lineTo(20, -232);
    c.stroke();
  } else {
    c.fillStyle = INK;
    c.beginPath();
    c.arc(8, -228, 16, 0, Math.PI);
    c.fill();
  }
  if (pose === 'punch' || pose === 'box_punch' || pose === 'throw') ellipse(120, -150, 30, 26, color, 7);
  if (pose === 'kick') ellipse(110, -30, 32, 22, INK, 0);
  if (pose === 'box' || pose === 'box_guard' || pose === 'pull' || pose === 'pull_hard') ellipse(70, -190, 28, 26, color, 7);
  if (pose === 'win' || pose === 'box_win' || pose === 'catch' || pose === 'ready' || pose === 'hold' || pose === 'carry') {
    ellipse(-80, -230, 26, 26, color, 7);
    ellipse(80, -230, 26, 26, color, 7);
  }
  c.restore();
}
