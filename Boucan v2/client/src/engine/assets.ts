import { GAME } from '../config';
import { circle, ellipse, g, INK } from './draw';

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
  poses?: Record<string, PoseSpec>;
}

interface SpriteEntry {
  image: string;
  atlas: string;
}

interface Manifest {
  characters?: Record<string, CharacterEntry>;
  sprites?: Record<string, SpriteEntry>;
  sounds?: Record<string, string>;
  music?: Record<string, string>;
  /** Zone backdrops (path, 1280×720) or microgame scenes ({ image, floor }). */
  backgrounds?: Record<string, string | { image: string; floor?: number }>;
}

/** A scenery image and the height of its ground line (0..1 of the image height). */
export interface Scene {
  image: HTMLImageElement;
  floor: number;
}

export interface LoadedSheet {
  image: HTMLImageElement;
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
  | 'pull_hard';

const BASE = `${import.meta.env.BASE_URL}assets/`;

class AssetStore {
  private characters = new Map<string, { entry: CharacterEntry; sheet: LoadedSheet }>();
  /** Character ids in manifest order (loading finishes in any order). */
  private characterOrder: string[] = [];
  private sprites = new Map<string, LoadedSheet>();
  private backgrounds = new Map<string, Scene>();
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
        track(loadSheet(entry.image, entry.atlas)).then(
          (sheet) => void this.characters.set(id, { entry, sheet }),
          (e) => console.warn(`[assets] character "${id}" skipped`, e),
        ),
      );
    }
    for (const [id, entry] of Object.entries(manifest.sprites ?? {})) {
      jobs.push(
        track(loadSheet(entry.image, entry.atlas)).then(
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

  /** Zone backdrop (recre, cantine, classe) or microgame scene (foret, ville…); undefined → drawn fallback. */
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

  character(id: string) {
    return this.characters.get(id);
  }
}

export const assets = new AssetStore();

function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image ${path}`));
    img.src = BASE + path;
  });
}

async function loadSheet(image: string, atlas: string): Promise<LoadedSheet> {
  const [img, json] = await Promise.all([loadImage(image), fetch(BASE + atlas).then((r) => r.json() as Promise<Atlas>)]);
  return { image: img, atlas: json };
}

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
    c.save();
    c.translate(x + (s.dx ?? 0) * sgn * (h / 330), y + (s.dy ?? 0) * (h / 330));
    if (s.sx || s.sy) c.scale(s.sx ?? 1, s.sy ?? 1);
    if (s.squash) c.scale(1 + s.squash, 1 - s.squash * Math.abs(Math.sin(t / 120)));
    drawFrame(sheet, frame, 0, 0, hh, opts.flip, ((s.rot ?? 0) + (opts.rot ?? 0)) * sgn);
    c.restore();
  }
  if (opts.alpha !== undefined) c.restore();
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
