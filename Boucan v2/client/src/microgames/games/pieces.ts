import type { TypedPayload } from '@boucan/shared';
import { clamp, ellipse, g, INK, item, outlineText, slam } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { Actor } from '../common';
import { Pad, PAD_LEFT, PAD_RIGHT, PAD_Y } from '../pad';
import { bomb, boom } from '../props';

/**
 * DUEL — QUI A LE PLUS ? Everyone on their own lane under the same rain of
 * coins and bombs: steer left / right (screen halves, ◀ ▶ or ← →) under the
 * coins, away from the bombs. Most coins when time is up wins. Server-judged
 * (server pieces.ts); your own moves are predicted. Your lane is in front.
 */
interface State {
  drops: { at: number; x: number; bomb: boolean }[];
  players: Record<string, { x: number; dir: number; coins: number; stun: boolean; got: number[] }>;
  end: number;
  winners: string[] | null;
}

/** Mirror of the server's PIECES constants. */
const W = 3;
const SPEED = 4.6;
const FALL_MS = 1100;
/** Camera looking down the lanes (metres). */
const F = 744;
const CAM_Z = -4.5;
const CAM_Y = 5.2;
const TILT = 0.42;
const HY = 360;
const LANE_GAP = 2.3;
/** Where the painted floor of the world meets the lanes. */
const FLOOR_Y = 250;
const project = (x: number, y: number, z: number) => {
  const dz = z - CAM_Z;
  const dy = y - CAM_Y;
  const zc = Math.max(0.3, -dy * Math.sin(TILT) + dz * Math.cos(TILT));
  const yc = dy * Math.cos(TILT) + dz * Math.sin(TILT);
  return { x: 640 + (F * x) / zc, y: HY - (F * yc) / zc, s: F / zc };
};

export default defineMicrogame({
  id: 'pieces',
  verb: 'QUI A LE PLUS ?',
  create(ctx) {
    const actors = new Map(ctx.players.map((p) => [p.id, new Actor(p)]));
    const pad = new Pad(
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
    let fx: { id: string; x: number; bomb: boolean; t: number }[] = [];
    return {
      input(e) {
        if (!state || state.winners) return;
        pad.input(e);
        const next = pad.axis('left', 'right');
        if (next !== dir) {
          dir = next;
          ctx.send({ type: 'move', dir });
        }
      },
      onState(s, serverTime) {
        const next = s as State;
        if (next.winners && !state?.winners) resultAt = clock;
        state = next;
        stateAt = serverTime;
      },
      onEvent(e: TypedPayload) {
        if (!state || (e.type !== 'coin' && e.type !== 'bomb')) return;
        const id = String(e.playerId);
        const d = state.drops[Number(e.i)];
        if (!d) return;
        fx.push({ id, x: d.x, bomb: e.type === 'bomb', t: 0 });
        if (e.type === 'bomb') {
          actors.get(id)?.force('hurt');
          if (id === ctx.me.id) {
            ctx.sfx('boom');
            ctx.shake(200);
          }
        } else if (id === ctx.me.id) ctx.sfx('pop');
      },
      update(dt, t) {
        clock = t;
        fx = fx.filter((f) => (f.t += dt) < 500);
        for (const [id, a] of actors) {
          const p = state?.players[id];
          const moving = id === ctx.me.id ? dir !== 0 : !!p?.dir;
          if (state?.winners) a.set(state.winners.includes(id) ? 'win' : 'lose');
          else if (p?.stun) a.set('hurt');
          else a.set(moving ? 'run' : 'idle');
          a.update(dt);
        }
      },
      draw() {
        const c = g();
        sceneBg('futur', FLOOR_Y, 0, false, 'pieces');
        if (!state) return;
        const s = state;
        const now = ctx.serverNow();
        const late = s.winners ? 0 : Math.min(0.3, Math.max(0, (now - stateAt) / 1000));
        // Your lane in front, then the others.
        const ids = [ctx.me.id, ...Object.keys(s.players).filter((id) => id !== ctx.me.id)].filter((id) => s.players[id]);
        for (let i = ids.length - 1; i >= 0; i--) {
          const id = ids[i]!;
          const p = s.players[id]!;
          const player = ctx.players.find((pl) => pl.id === id);
          const mine = id === ctx.me.id;
          const z = i * LANE_GAP;
          const corners = [project(-W - 0.6, 0, z - 0.6), project(W + 0.6, 0, z - 0.6), project(W + 0.6, 0, z + 0.6), project(-W - 0.6, 0, z + 0.6)];
          c.fillStyle = mine ? '#ffcf5a' : '#b98bd6';
          c.strokeStyle = INK;
          c.lineWidth = 4;
          c.beginPath();
          corners.forEach((q, k) => (k ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
          c.closePath();
          c.fill();
          c.stroke();
          // What is still falling on this lane.
          s.drops.forEach((d, k) => {
            if (p.got.includes(k)) return;
            const u = (now - d.at + FALL_MS) / FALL_MS;
            if (u < 0 || u > 1.08) return;
            const q = project(d.x, Math.max(0.2, 6 * (1 - u) + 0.9), z);
            const gq = project(d.x, 0, z);
            ellipse(gq.x, gq.y, 0.3 * gq.s * u, 0.08 * gq.s * u, 'rgba(0,0,0,.25)', 0);
            if (d.bomb) bomb(q.x, q.y + 0.3 * q.s, 0.6 * q.s, 2, true, now / 200);
            else {
              const r = Math.max(4, 0.28 * q.s);
              const spin = Math.abs(Math.cos(now / 150 + k));
              c.save();
              c.translate(q.x, q.y);
              c.scale(Math.max(0.12, spin), 1);
              if (!item('coin', 0, 0, 2 * r)) ellipse(0, 0, r, r, '#ffd23c', 3);
              c.restore();
            }
          });
          const x = mine ? clamp(p.x + dir * SPEED * late, -W, W) : p.stun ? p.x : clamp(p.x + p.dir * SPEED * late, -W, W);
          const q = project(x, 0, z);
          const h = 1.6 * q.s;
          ellipse(q.x, q.y, 0.5 * q.s, 0.12 * q.s, 'rgba(0,0,0,.25)', 0);
          actors.get(id)?.draw(q.x, q.y, h, { flip: (mine ? dir : p.dir) < 0, shadow: false });
          outlineText(`${mine ? 'TOI' : (player?.nickname ?? '?')}  ${p.coins}`, q.x, q.y - h - 8, Math.round(Math.min(34, q.s * 0.12 + 10)), player?.color ?? '#fff', 'center', 6);
          for (const f of fx) {
            if (f.id !== id) continue;
            const fq = project(f.x, 1.4, z);
            if (f.bomb) boom(fq.x, fq.y, 1.4 * fq.s * (0.6 + Math.min(1, f.t / 150) * 0.4));
            else outlineText('+1', fq.x, fq.y - f.t * 0.08, Math.round(fq.s * 0.25 + 10), '#ffe04a');
          }
        }
        if (!s.winners) {
          outlineText(`${Math.max(0, Math.ceil((s.end - now) / 1000))} s`, 1150, 96, 36, '#fff', 'right', 7);
          if (s.players[ctx.me.id]) pad.draw();
        } else {
          const best = s.winners.includes(ctx.me.id);
          slam(best ? 'LE PLUS RICHE !' : 'FIN !', clock - resultAt, '#ffe04a', 640, 240, 90, 1000);
        }
      },
    };
  },
});
