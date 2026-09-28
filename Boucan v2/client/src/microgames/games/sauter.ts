import type { TypedPayload } from '@boucan/shared';
import { box, ellipse, g, INK, outlineText, slam, star } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { Actor, isPress } from '../common';
import { bomb } from '../props';

/**
 * DUEL — CORDE À SAUTER ! Everyone in a line inside a long rope turned by
 * two bombs: jump (one tap) each time it sweeps the ground. It turns faster
 * and faster; whoever is on the ground when it passes is out. Last one
 * jumping wins. The rope follows the server clock (same schedule as the
 * server module sauter.ts); you are in front.
 */
interface State {
  order: string[];
  start: number;
  jumps: Record<string, number>;
  out: Record<string, number>;
  turn: number;
  winners: string[] | null;
}

/** Mirror of the server's SAUTER schedule. */
const PERIOD0 = 1300;
const SPEED_UP = 0.9;
const MIN_PERIOD = 420;
const JUMP_H = 0.75;
const period = (i: number) => Math.max(MIN_PERIOD, PERIOD0 * SPEED_UP ** i);
const jumpMs = (p: number) => Math.min(460, p * 0.85);
/** Rope angle (0 / 2π = on the ground, π = at the top) and period, `u` ms after the rope started. */
function rope(u: number): { th: number; p: number; turn: number } {
  if (u < 0) return { th: Math.PI, p: PERIOD0, turn: 0 };
  let from = -PERIOD0 / 2;
  for (let i = 0; ; i++) {
    const p = period(i);
    if (u < from + p) return { th: (2 * Math.PI * (u - from)) / p, p, turn: i };
    from += p;
  }
}

/** 3D view (metres): players on a diagonal line, camera behind the first one. */
const F = 780;
const CAM = { x: 1.2, y: 2.0, z: -3.2 };
const HY = 204;
const project = (x: number, y: number, z: number) => {
  const d = Math.max(0.3, z - CAM.z);
  return { x: 640 + (F * (x - CAM.x)) / d, y: HY - (F * (y - CAM.y)) / d, s: F / d };
};
const R = 1.2;
const H0 = 1.1;
const NORMAL = [1 / Math.hypot(1, 0.6), 0, -0.6 / Math.hypot(1, 0.6)] as const;
const along = (z: number) => z * 0.6;

export default defineMicrogame({
  id: 'sauter',
  verb: 'CORDE À SAUTER !',
  create(ctx) {
    const actors = new Map(ctx.players.map((p) => [p.id, new Actor(p)]));
    let state: State | null = null;
    let myJump = -1e12;
    const outAt = new Map<string, number>();
    let resultAt = -1;
    let clock = 0;
    const jumpAt = (id: string) => (id === ctx.me.id ? Math.max(myJump, state?.jumps[id] ?? -1e12) : (state?.jumps[id] ?? -1e12));
    const heightOf = (id: string, now: number) => {
      if (!state) return 0;
      const at = jumpAt(id);
      const k = (now - at) / jumpMs(rope(at - state.start).p);
      return k < 0 || k > 1 ? 0 : JUMP_H * 4 * k * (1 - k);
    };
    return {
      input(e) {
        if (!isPress(e) || !state || state.winners || state.out[ctx.me.id] !== undefined) return;
        const now = ctx.serverNow();
        if (heightOf(ctx.me.id, now) > 0) return;
        myJump = now;
        actors.get(ctx.me.id)?.force('start');
        ctx.send({ type: 'jump' });
        ctx.sfx('jump');
      },
      onState(s) {
        const next = s as State;
        if (next.winners && !state?.winners) resultAt = clock;
        state = next;
      },
      onEvent(e: TypedPayload) {
        if (e.type === 'out' && Array.isArray(e.playerIds)) {
          for (const id of e.playerIds.map(String)) {
            outAt.set(id, clock);
            actors.get(id)?.force('hurt');
            if (id === ctx.me.id) ctx.shake(260);
          }
          ctx.sfx('hurt');
        } else if (e.type === 'jump' && e.playerId !== ctx.me.id) actors.get(String(e.playerId))?.force('start');
      },
      update(dt, t) {
        clock = t;
        for (const [id, a] of actors) {
          if (state?.winners) a.set(state.winners.includes(id) ? 'win' : 'lose');
          else if (state?.out[id] !== undefined) a.set(a.pose === 'hurt' && a.t < 500 ? 'hurt' : 'lose');
          else if (a.pose === 'start' && a.t > 460) a.set('idle');
          a.update(dt);
        }
      },
      draw(t) {
        const c = g();
        const horizon = project(0, 0, 300).y;
        sceneBg('ville', horizon + 36, 0, true);
        const dirt = c.createLinearGradient(0, horizon, 0, 720);
        dirt.addColorStop(0, '#b88a5a');
        dirt.addColorStop(1, '#e8c08a');
        c.fillStyle = dirt;
        c.fillRect(0, horizon, 1280, 720 - horizon);
        c.fillStyle = INK;
        c.fillRect(0, horizon - 2, 1280, 5);
        c.strokeStyle = 'rgba(120,80,40,.3)';
        c.lineWidth = 2;
        for (let k = 0; k < 30; k++) {
          const z = CAM.z + 0.4 + k * 1.1;
          const a = project(-30, 0, z);
          const b = project(30, 0, z);
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
        }
        for (let x = -12; x <= 16; x += 1.1) {
          const a = project(x, 0, CAM.z + 0.4);
          const b = project(x, 0, 60);
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
        }
        if (!state) return;
        const s = state;
        const now = ctx.serverNow();
        const r = s.winners ? { th: Math.PI, p: PERIOD0, turn: s.turn } : rope(now - s.start);
        // You in front, then the others in the server's order.
        const line = [ctx.me.id, ...s.order.filter((id) => id !== ctx.me.id)].filter((id) => s.order.includes(id));
        const n = line.length;
        const zA = -2.6;
        const zB = (n - 1) * 1.5 + 2.6;
        const ropeAt = (z: number) => {
          const u = (z - zA) / (zB - zA);
          const rr = R * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.35);
          const st = Math.sin(r.th);
          return project(along(z) + rr * st * NORMAL[0], H0 - rr * Math.cos(r.th), z + rr * st * NORMAL[2]);
        };
        const drawRope = () => {
          c.lineCap = 'round';
          c.beginPath();
          for (let i = 0; i <= 40; i++) {
            const q = ropeAt(zA + ((zB - zA) * i) / 40);
            if (i) c.lineTo(q.x, q.y);
            else c.moveTo(q.x, q.y);
          }
          c.strokeStyle = INK;
          c.lineWidth = 11;
          c.stroke();
          c.strokeStyle = '#ff4f7b';
          c.lineWidth = 6;
          c.stroke();
        };
        const front = Math.sin(r.th) > 0;
        for (const z of [zB, zA]) {
          const q = project(along(z), 0, z);
          bomb(q.x, q.y, 1.3 * q.s, 0, z < 0, Math.sin(r.th) * 0.15);
        }
        if (!front) drawRope();
        if (Math.cos(r.th) > 0.8) {
          for (let i = 0; i < n; i++) {
            const q = project(along(i * 1.5), 0, i * 1.5);
            ellipse(q.x, q.y, 0.7 * q.s, 0.18 * q.s, `rgba(255,224,74,${(0.35 * (Math.cos(r.th) - 0.8)) / 0.2})`, 0);
          }
        }
        for (let i = n - 1; i >= 0; i--) {
          const id = line[i]!;
          const p = ctx.players.find((pl) => pl.id === id);
          const z = i * 1.5;
          const h = heightOf(id, now);
          const q = project(along(z), h, z);
          const gq = project(along(z), 0, z);
          const out = s.out[id] !== undefined;
          ellipse(gq.x, gq.y, 0.45 * gq.s * (1 - h * 0.4), 0.1 * gq.s, 'rgba(0,0,0,.25)', 0);
          actors.get(id)?.draw(q.x, q.y, 1.6 * q.s, { shadow: false, alpha: out ? 0.55 : 1, rot: out ? -0.3 : 0 });
          if (p) outlineText(p.isMe ? 'TOI' : p.nickname, gq.x, q.y - 1.6 * q.s - 8, Math.round(Math.min(30, q.s * 0.13 + 8)), p.color, 'center', 6);
          if (out) outlineText('OUT', gq.x + 0.5 * q.s, q.y - 0.9 * q.s, Math.round(q.s * 0.2 + 10), '#ff6b6b');
          const hitAt = outAt.get(id);
          if (hitAt !== undefined && t - hitAt < 500) star(q.x, project(along(z), 0.5, z).y, (t - hitAt) / 500);
        }
        if (front) drawRope();
        // Turn counter and rope speed.
        outlineText(`TOUR ${r.turn}`, 1180, 60, 34, '#fff', 'right', 7);
        const k = (PERIOD0 - r.p) / (PERIOD0 - MIN_PERIOD);
        box(1000, 80, 190, 18, INK, 0, 9);
        c.fillStyle = k > 0.8 ? '#ff4a4a' : k > 0.4 ? '#ff9f1c' : '#2fd07a';
        c.fillRect(1004, 84, 182 * k, 10);
        outlineText('VITESSE', 1095, 118, 18, '#fff', 'center', 4);
        if (s.winners) {
          const w = s.winners;
          const one = w.length === 1 ? ctx.players.find((pl) => pl.id === w[0]) : undefined;
          slam(one ? (one.isMe ? 'TU GAGNES !' : `${one.nickname} GAGNE !`) : 'ÉGALITÉ !', clock - resultAt, '#ffe04a', 640, 260, 80, 1000);
        } else if (now < s.start && t > 950) outlineText(s.start - now > 500 ? 'PRÊTS ?' : 'GO !', 640, 280, 76, s.start - now > 500 ? '#fff' : '#ffe04a', 'center', 9);
        else if (s.out[ctx.me.id] === undefined && ctx.players.some((pl) => pl.isMe)) outlineText(ctx.touch ? 'TAPE POUR SAUTER' : 'ESPACE / ↑ / CLIC : SAUTE', 640, 690, 24, '#fff', 'center', 5);
      },
    };
  },
});
