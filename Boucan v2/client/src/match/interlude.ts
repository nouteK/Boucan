import type { Verdict, ZoneId } from '@boucan/shared';
import { ZONE_THEMES } from '../config';
import { drawCharacter, type Pose } from '../engine/assets';
import { bone, box, circle, g, INK, outlineText, poly, shadow, star, W } from '../engine/draw';
import { sceneBg } from '../microgames/backdrops';
import type { RosterEntry } from './roster';

/**
 * The interlude stage (like the Smooth Moves disco floor): the world's set, a
 * big "screen" in the middle — where the counter shows and into which the
 * camera zooms to enter each microgame — and every player lined up with
 * their lives. Players are the "lives on stage": fails and eliminations show
 * on them.
 */

/** The screen of the set, in logical coordinates (16:9). */
export const PORTAL = { x: 392, y: 54, w: 496, h: 279 };

export interface LineupState {
  /** Verdict to act out (null = neutral poses). */
  verdict: Verdict | null;
  /** ms since the verdict started (drives reactions). */
  verdictT: number;
}

/** Floor line of the stage: the world's ground, where the players stand. */
const FLOOR_Y = 470;

export function drawStage(zone: ZoneId, t: number): void {
  const th = ZONE_THEMES[zone];
  const c = g();
  sceneBg(zone, FLOOR_Y);
  c.fillStyle = th.tint;
  c.fillRect(0, 0, W, 720);
  // Sunburst behind the screen.
  c.save();
  c.translate(640, 200);
  c.rotate(t / 6000);
  c.fillStyle = 'rgba(255,255,255,.1)';
  for (let i = 0; i < 16; i++) {
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, 1200, (i / 16) * Math.PI * 2, ((i + 0.5) / 16) * Math.PI * 2);
    c.fill();
  }
  c.restore();
  // Moving floor stripes (the stage), on the world's ground.
  c.fillStyle = 'rgba(0,0,0,.1)';
  for (let x = -110; x < W; x += 110) c.fillRect(x + ((t / 20) % 110), FLOOR_Y, 55, 720 - FLOOR_Y);
  c.fillStyle = INK;
  c.fillRect(0, FLOOR_Y - 4, W, 8);
}

/** The central screen (frame + inner content drawn by the caller). */
export function drawPortalFrame(inner: () => void): void {
  const c = g();
  const { x, y, w, h } = PORTAL;
  box(x - 22, y - 22, w + 44, h + 44, '#2a2a36', 8, 22);
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  inner();
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = 7;
  c.strokeRect(x, y, w, h);
  circle(x + w + 4, y + h + 4, 0, INK, 0);
  box(x + w / 2 - 60, y + h + 22, 120, 26, '#2a2a36', 6, 6);
}

/** Players lined up at the bottom, with lives and reactions. */
export function drawLineup(players: readonly RosterEntry[], t: number, state: LineupState): void {
  const n = players.length;
  if (n === 0) return;
  const spacing = Math.min(170, 1180 / n);
  const h = n <= 2 ? 250 : n <= 4 ? 220 : n <= 6 ? 190 : 165;
  const y = 650;
  players.forEach((p, i) => {
    const x = 640 + (i - (n - 1) / 2) * spacing;
    const entry = state.verdict?.entries.find((e) => e.playerId === p.id);
    const react = entry && state.verdictT < 2600;
    let pose: Pose = 'idle';
    if (react && entry.counted) pose = entry.outcome === 'success' ? 'win' : 'hurt';
    if (!p.alive && !(react && entry?.eliminated)) pose = 'lose';
    const hop = react && entry?.outcome === 'success' ? Math.abs(Math.sin(state.verdictT / 120)) * 22 * Math.max(0, 1 - state.verdictT / 1200) : 0;
    const c = g();
    c.fillStyle = p.color;
    c.globalAlpha = 0.85;
    c.beginPath();
    c.ellipse(x, y, h * 0.3, h * 0.07, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
    shadow(x, y, h * 0.25, 0.15);
    const fall = !p.alive && entry?.eliminated && react ? Math.min(1, state.verdictT / 500) : !p.alive ? 1 : 0;
    drawCharacter(p.characterId, pose, t + i * 97, x, y - hop, h, {
      flip: x > 640,
      color: p.color,
      alpha: p.alive ? 1 : 0.45,
      rot: fall * (x > 640 ? 0.25 : -0.25),
    });
    if (react && entry.counted && entry.outcome === 'success') star(x + 50, y - h - 10, Math.min(1, state.verdictT / 700), '#ffe04a', 40);
    // Name + lives.
    const label = p.isMe ? 'TOI' : p.nickname;
    outlineText(label, x, y - h - 50, p.isMe ? 30 : 22, p.color, 'center', 5);
    if (p.isMe) poly([[x - 14, y - h - 30], [x + 14, y - h - 30], [x, y - h - 14]], p.color, 5);
    const lives = p.lives;
    const lost = react && entry.counted && entry.livesDelta < 0;
    const gained = react && entry.counted && entry.livesDelta > 0;
    const shown = lives + (lost ? 1 : 0);
    const bw = Math.min(26, (spacing - 20) / Math.max(1, shown));
    for (let k = 0; k < shown; k++) {
      const bx = x + (k - (shown - 1) / 2) * bw;
      const breaking = lost && k === shown - 1;
      if (breaking) {
        const k2 = Math.min(1, state.verdictT / 900);
        c.save();
        c.globalAlpha = 1 - k2;
        bone(bx - k2 * 20, y + 30 + k2 * 60, 0.22, -k2 * 2);
        bone(bx + k2 * 20, y + 30 + k2 * 70, 0.22, k2 * 2);
        c.restore();
      } else {
        const pop = gained && k === shown - 1 ? 1 + Math.max(0, 0.6 - state.verdictT / 1000) : 1;
        bone(bx, y + 32, 0.22 * pop, 0);
      }
    }
    if (!p.alive) outlineText('ÉLIMINÉ', x, y + 36, 20, '#ff6b6b', 'center', 4);
    if (p.connection === 'disconnected') outlineText('⚡', x + 40, y - h, 28, '#ffe04a');
  });
}

/** Huge counter shown in the screen (like WarioWare's 004). */
export function counterText(n: number): string {
  return String(n).padStart(3, '0');
}
