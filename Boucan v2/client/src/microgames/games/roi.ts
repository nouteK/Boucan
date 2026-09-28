import type { TypedPayload } from '@boucan/shared';
import { box, circle, clamp, ellipse, g, INK, outlineText, poly, slam } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { Actor } from '../common';
import { Pad, PAD_LEFT, PAD_RIGHT, PAD_Y } from '../pad';
import { bomb, boom } from '../props';

/**
 * DUEL — LE ROI DE LA COLLINE ! One king on the summit throws bombs down the
 * slope; the others climb on their own and dodge left / right. A climber at
 * the top dethrones the king; otherwise the king wins. Server-judged; the
 * client extrapolates positions between states (see server roi.ts). The
 * king looks down the slope from the top, a climber from behind themself.
 */
interface State {
  king: string;
  kx: number;
  kdir: number;
  ready: boolean;
  bombs: { id: number; x: number; z: number; dx: number }[];
  climbers: Record<string, { x: number; z: number; dir: number; stun: boolean }>;
  result: 'king' | 'climbers' | null;
}

/** Mirror of the server's ROI constants (metres, m/s). */
const L = 20;
const W = 3;
const MOVE = 4.2;
const CLIMB = 2.3;
const BOMB_SPEED = 11;
const SLOPE = 0.35;
const KNOCK = 5;
const FOCAL = 840;
const height = (z: number) => clamp(z, 0, L) * SLOPE;

type Vec = [number, number, number];

export default defineMicrogame({
  id: 'roi',
  verb: 'LE ROI DE LA COLLINE !',
  create(ctx) {
    const actors = new Map(ctx.players.map((p) => [p.id, new Actor(p, 'run')]));
    const kingPad = new Pad(
      ctx,
      [
        { action: 'left', label: '◀', x: PAD_LEFT[0]!, y: PAD_Y, keys: ['left'] },
        { action: 'right', label: '▶', x: PAD_LEFT[1]!, y: PAD_Y, keys: ['right'] },
        { action: 'throw', label: 'BOMBE', x: PAD_RIGHT[0]!, y: PAD_Y, keys: ['up', 'down'], big: true },
      ],
      { tap: 'throw' },
    );
    const climberPad = new Pad(
      ctx,
      [
        { action: 'left', label: '◀', x: PAD_LEFT[0]!, y: PAD_Y, keys: ['left'] },
        { action: 'right', label: '▶', x: PAD_RIGHT[0]!, y: PAD_Y, keys: ['right'] },
      ],
      { halves: ['left', 'right'] },
    );
    let state: State | null = null;
    let stateAt = 0;
    let dir = 0;
    let resultAt = -1;
    let clock = 0;
    let fx: { x: number; z: number; t: number }[] = [];
    const isKing = () => state?.king === ctx.me.id;
    return {
      input(e) {
        if (!state || state.result) return;
        const pad = isKing() ? kingPad : climberPad;
        for (const ev of pad.input(e)) {
          if (ev.down && ev.action === 'throw' && state.ready) {
            ctx.send({ type: 'throw' });
            actors.get(ctx.me.id)?.force('throw');
          }
        }
        const next = pad.axis('left', 'right');
        if (next !== dir) {
          dir = next;
          ctx.send({ type: 'move', dir });
        }
      },
      onState(s, serverTime) {
        const next = s as State;
        if (next.result && !state?.result) resultAt = clock;
        state = next;
        stateAt = serverTime;
      },
      onEvent(e: TypedPayload) {
        if (e.type === 'throw') {
          if (state) actors.get(state.king)?.force('throw');
          ctx.sfx('whoosh');
        } else if (e.type === 'hit') {
          const id = String(e.playerId);
          actors.get(id)?.force('hurt');
          const c = state?.climbers[id];
          if (c) fx.push({ x: c.x, z: Math.max(0, c.z - KNOCK) + KNOCK * 0.2, t: 0 });
          ctx.sfx('boom');
          if (id === ctx.me.id) ctx.shake(280);
        } else if (e.type === 'summit') ctx.sfx('pop');
      },
      update(dt, t) {
        clock = t;
        fx = fx.filter((f) => (f.t += dt) < 500);
        if (!state) return;
        for (const [id, a] of actors) {
          const c = state.climbers[id];
          if (state.result) a.set((id === state.king) === (state.result === 'king') ? 'win' : 'lose');
          else if (c) a.set(c.stun ? 'hurt' : 'run');
          else if (a.pose !== 'throw' || a.t > 380) a.set('idle');
          a.update(dt);
        }
      },
      draw(t) {
        const c = g();
        if (!state) {
          sceneBg('foret', 360, 0, true);
          return;
        }
        const s = state;
        // Positions now, extrapolated from the last state.
        const late = s.result ? 0 : Math.min(0.3, Math.max(0, (ctx.serverNow() - stateAt) / 1000));
        const climbers = Object.entries(s.climbers).map(([id, cl]) => {
          const d = id === ctx.me.id ? dir : cl.dir;
          const boost = Object.keys(s.climbers).length === 1 ? 1.2 : 1;
          return { id, x: clamp(cl.x + d * MOVE * late, -W, W), z: cl.stun ? cl.z : Math.min(L, cl.z + CLIMB * boost * late), stun: cl.stun };
        });
        const kx = clamp(s.kx + (isKing() ? dir : s.kdir) * MOVE * late, -W, W);
        const bombs = s.bombs.map((b) => ({ id: b.id, x: clamp(b.x + b.dx * late, -W, W), z: b.z - BOMB_SPEED * late }));
        // Camera: from the top for the king, behind yourself (or the leader) for a climber.
        const mine = climbers.find((cl) => cl.id === ctx.me.id);
        const follow = mine ?? [...climbers].sort((a, b) => b.z - a.z)[0];
        const cam = isKing() || !follow
          ? { x: kx * 0.4, z: L + 4.5, y: height(L) + 4.5, ph: 0.45, d: -1, hy: 288, ground: 528 }
          : { x: follow.x * 0.6, z: follow.z - 4.5, y: height(follow.z) + 2.3, ph: -0.12, d: 1, hy: 144, ground: 360 };
        const cs = Math.cos(cam.ph);
        const sn = Math.sin(cam.ph);
        const project = (x: number, y: number, z: number) => {
          const dx = (x - cam.x) * cam.d;
          const dz = (z - cam.z) * cam.d;
          const dy = y - cam.y;
          const zc = Math.max(0.3, -dy * sn + dz * cs);
          const yc = dy * cs + dz * sn;
          return { x: 640 + (FOCAL * dx) / zc, y: cam.hy - (FOCAL * yc) / zc, s: FOCAL / zc };
        };
        const visible = (z: number) => (cam.d > 0 ? z > cam.z + 0.4 : z < cam.z - 0.4);
        const quad = (pts: Vec[], fill: string, lw = 0) => {
          c.beginPath();
          pts.forEach((p, i) => {
            const q = project(...p);
            if (i) c.lineTo(q.x, q.y);
            else c.moveTo(q.x, q.y);
          });
          c.closePath();
          c.fillStyle = fill;
          c.fill();
          if (lw) {
            c.strokeStyle = INK;
            c.lineWidth = lw;
            c.stroke();
          }
        };
        // Forest far away, meadow, then the hill.
        sceneBg('foret', cam.ground, 0, true);
        c.fillStyle = '#4a9e4a';
        c.fillRect(0, cam.ground, 1280, 720 - cam.ground);
        for (let z = -6; z < L + 3; z += 1) {
          if (!visible(z) && !visible(z + 1)) continue;
          const a = Math.max(z, cam.d > 0 ? cam.z + 0.4 : -99);
          const b = Math.min(z + 1, cam.d < 0 ? cam.z - 0.4 : 99);
          if (a >= b) continue;
          quad([[-W - 0.7, height(a), a], [W + 0.7, height(a), a], [W + 0.7, height(b), b], [-W - 0.7, height(b), b]], (z + 6) % 2 ? '#5fc25a' : '#6fd46a');
        }
        for (const side of [-1, 1]) {
          c.strokeStyle = '#2e7a2e';
          c.lineWidth = 6;
          c.beginPath();
          let first = true;
          for (let z = -6; z <= L + 1; z += 0.5) {
            if (!visible(z)) continue;
            const q = project(side * (W + 0.7), height(z), z);
            if (first) c.moveTo(q.x, q.y);
            else c.lineTo(q.x, q.y);
            first = false;
          }
          c.stroke();
        }
        quad([[-2, height(L), L], [2, height(L), L], [2, height(L), L + 2.5], [-2, height(L), L + 2.5]], '#c9a36a', 3);
        // Everything sorted by depth.
        const items: { z: number; draw: () => void }[] = [];
        const label = (id: string, x: number, y: number, size: number) => {
          const p = ctx.players.find((pl) => pl.id === id);
          if (p) outlineText(p.isMe ? 'TOI' : p.nickname, x, y, size, p.color, 'center', 5);
        };
        items.push({
          z: L + 1,
          draw: () => {
            if (cam.d > 0 && !visible(L + 1)) return;
            const q = project(kx, height(L), L + 1);
            const h = 1.55 * q.s * (isKing() ? 1 : 2.2);
            actors.get(s.king)?.draw(q.x, q.y, h, { flip: cam.d > 0 });
            const r = Math.max(10, h * 0.1);
            c.save();
            c.translate(q.x, q.y - h - 4);
            poly([[-r, r * 0.3], [-r, -r * 0.7], [-r / 2, -r * 0.2], [0, -r], [r / 2, -r * 0.2], [r, -r * 0.7], [r, r * 0.3]], '#ffd23c', 4);
            c.restore();
            label(s.king, q.x, Math.max(24, q.y - h - r * 2 - 8), Math.round(Math.min(30, q.s * 0.1 + 14)));
          },
        });
        for (const cl of climbers) {
          items.push({
            z: cl.z,
            draw: () => {
              if (!visible(cl.z)) return;
              const q = project(cl.x, height(cl.z), cl.z);
              const h = 1.55 * q.s;
              ellipse(q.x, q.y, 0.45 * q.s, 0.12 * q.s, 'rgba(0,0,0,.25)', 0);
              actors.get(cl.id)?.draw(q.x, q.y, h, { flip: cam.d < 0, shadow: false });
              label(cl.id, q.x, q.y - h - 6, Math.round(Math.min(30, q.s * 0.1 + 10)));
              if (cl.z >= L) outlineText('AU SOMMET !', q.x, q.y - h - 40, 34, '#7dff9b');
            },
          });
        }
        for (const b of bombs) {
          items.push({
            z: b.z,
            draw: () => {
              if (!visible(b.z)) return;
              const q = project(b.x, height(b.z) + 0.35, b.z);
              const gq = project(b.x, height(b.z), b.z);
              ellipse(gq.x, gq.y, 0.4 * gq.s, 0.1 * gq.s, 'rgba(0,0,0,.3)', 0);
              bomb(q.x, q.y + 0.35 * q.s, 0.8 * q.s, b.z < L * 0.4 ? 2 : 1, true, t / 80 + b.id);
            },
          });
        }
        for (const f of fx) {
          items.push({
            z: f.z,
            draw: () => {
              if (!visible(f.z)) return;
              const q = project(f.x, height(f.z) + 0.8, f.z);
              boom(q.x, q.y, Math.min(420, 2.2 * q.s) * (0.6 + Math.min(1, f.t / 150) * 0.4));
            },
          });
        }
        items.sort((a, b) => (cam.d > 0 ? b.z - a.z : a.z - b.z)).forEach((i) => i.draw());
        // Race to the top.
        const X0 = 1200;
        const Y0 = 130;
        const HH = 400;
        box(X0 - 14, Y0 - 10, 28, HH + 20, INK, 0, 14);
        c.fillStyle = '#5fc25a';
        c.fillRect(X0 - 8, Y0, 16, HH);
        outlineText('SOMMET', X0 - 10, Y0 - 24, 18, '#fff', 'center', 4);
        for (const cl of climbers) {
          const p = ctx.players.find((pl) => pl.id === cl.id);
          circle(X0, Y0 + HH * (1 - cl.z / L), cl.id === ctx.me.id ? 11 : 8, p?.color ?? '#fff', 3);
        }
        if (!s.result) {
          const left = Math.max(0, Math.ceil((ctx.activeAt + ctx.info.durationMs - ctx.serverNow()) / 1000));
          outlineText(`${left} s`, 1130, 96, 34, '#fff', 'right', 7);
          if (t > 950 && t < 3200) outlineText(isKing() ? 'TU ES LE ROI : BOMBARDE-LES !' : 'GRIMPE ET ESQUIVE LES BOMBES !', 640, 150, 34, '#fff', 'center', 7);
          (isKing() ? kingPad : climberPad).draw();
        } else slam(s.result === 'king' ? 'VIVE LE ROI !' : 'DÉTRÔNÉ !', clock - resultAt, '#ffe04a', 640, 220, 90, 1000);
      },
    };
  },
});
