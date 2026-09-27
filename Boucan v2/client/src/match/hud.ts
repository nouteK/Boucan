import type { Outcome } from '@boucan/shared';
import { box, circle, g, hintIcon, outlineText, slam } from '../engine/draw';
import { bomb, boom } from '../microgames/props';
import type { RosterEntry } from './roster';

/**
 * In-game overlay, WarioWare style: the fuse bomb timer (bottom left) with a
 * 3-2-1 countdown, the instruction slam + gesture icon, and live chips
 * showing who already won / lost.
 */

/** remaining / total in real ms; `after` = ms since the end (boom). */
export function fuseTimer(remaining: number, total: number, t: number, after: number): void {
  const c = g();
  const p = Math.max(0, remaining / total);
  const x0 = 150;
  const x1 = 1170;
  const y = 682;
  if (after > 0) {
    if (after < 600) boom(90, 610, 260 * Math.min(1, 0.5 + after / 150));
    return;
  }
  const xe = x0 + (x1 - x0) * p;
  c.lineCap = 'round';
  c.strokeStyle = '#161616';
  c.lineWidth = 14;
  c.beginPath();
  c.moveTo(x0, y);
  c.lineTo(xe, y);
  c.stroke();
  c.strokeStyle = '#e8d2a0';
  c.lineWidth = 7;
  c.setLineDash([12, 12]);
  c.beginPath();
  c.moveTo(x0, y);
  c.lineTo(xe, y);
  c.stroke();
  c.setLineDash([]);
  circle(xe, y, 13 + Math.random() * 7, Math.floor(t / 60) % 2 ? '#ffe04a' : '#ff7a1a', 0);
  const stage = p > 0.5 ? 0 : p > 0.22 ? 1 : 2;
  bomb(80, 712, 150, stage, false, stage === 2 ? Math.sin(t / 30) * 0.12 : Math.sin(t / 200) * 0.05);
  // 3-2-1 in the last beats.
  const beat = Math.min(600, total / 5);
  if (remaining > 0 && remaining <= beat * 3) {
    const n = Math.ceil(remaining / beat);
    const k = 1 - (remaining - (n - 1) * beat) / beat;
    c.save();
    c.translate(80, 520);
    c.scale(1.4 - k * 0.4, 1.4 - k * 0.4);
    outlineText(String(n), 0, 0, 90, '#fff');
    c.restore();
  }
}

/** Instruction + gesture hint at the start of a microgame. `t` = game ms since start. */
export function instruction(verb: string, hint: string, t: number, duration: number): void {
  if (t > duration) return;
  const fade = t > duration - 180 ? (duration - t) / 180 : 1;
  const c = g();
  c.save();
  c.globalAlpha = Math.max(0, fade);
  slam(verb, t, '#ffe04a', 640, 250, 118, 1150);
  hintIcon(hint, 640, 430, t, 1);
  c.restore();
}

/** Players' live progress chips (top right). */
export function progressChips(players: readonly RosterEntry[], progress: Record<string, Outcome>, participants: readonly string[]): void {
  const shown = players.filter((p) => participants.includes(p.id));
  if (shown.length <= 1) return;
  const w = 118;
  const x0 = 1270 - shown.length * (w + 6);
  shown.forEach((p, i) => {
    const x = x0 + i * (w + 6);
    const o = progress[p.id];
    box(x, 10, w, 40, o === 'failure' || o === 'dnf' ? '#555' : p.color, 4, 12);
    outlineText(p.isMe ? 'TOI' : p.nickname.slice(0, 7), x + 10, 30, 18, '#fff', 'left', 4);
    if (o === 'success') outlineText('✔', x + w - 18, 30, 28, '#7dff9b');
    else if (o === 'failure' || o === 'dnf') outlineText('✘', x + w - 18, 30, 28, '#ff6b6b');
  });
}

/** "BRAVO !" / "RATÉ !" sticker for my own result during play. */
export function outcomeSticker(outcome: 'success' | 'failure', t: number): void {
  const c = g();
  c.save();
  c.translate(1120, 150);
  c.rotate(-0.15);
  const k = Math.min(1, t / 160);
  c.scale(0.5 + k * 0.5, 0.5 + k * 0.5);
  outlineText(outcome === 'success' ? '✔' : '✘', 0, 0, 120, outcome === 'success' ? '#7dff9b' : '#ff6b6b');
  c.restore();
}
