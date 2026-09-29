import type { TypedPayload } from '@boucan/shared';
import { assets, drawSprite } from '../../engine/assets';
import { box, circle, ellipse, g, INK, outlineText, slam } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { skyline } from '../backdrops';
import { Actor, sideOf } from '../common';
import { gauge, keyCap } from '../props';

/**
 * DUEL — RAME ! Two random teams, one raft each, down a river. Press left,
 * right, left… to paddle, but ease off before the rapids: entering one too
 * fast capsizes you. First raft past the buoys wins. Server-simulated.
 */
interface RaftState {
  team: string[];
  x: number;
  speed: number;
  capsized: boolean;
  splashAt: number | null;
}
interface State {
  length: number;
  rapids: [number, number][];
  rafts: RaftState[];
  winner: number | null;
}

/** River perspective: far bank at FAR, near edge at NEAR; K = world → screen scale. */
const FAR = 360;
const NEAR = 700;
const K = 3.2;
const BACK_Y = 460;
const FRONT_Y = 640;

function at(cam: number, wx: number, y: number): { x: number; s: number } {
  const t = Math.max(0, Math.min(1, (y - FAR) / (NEAR - FAR)));
  const par = 0.4 + 0.75 * t;
  return { x: 820 - 490 * t + (wx - cam) * K * par, s: 0.4 + 0.75 * t };
}

export default defineMicrogame({
  id: 'radeau',
  verb: 'RAME !',
  create(ctx) {
    const actors = new Map(ctx.players.map((p) => [p.id, new Actor(p, 'paddle')]));
    const strokeAt = new Map<string, number>();
    let state: State | null = null;
    const shown = [0, 0];
    let cam = 0;
    let last: -1 | 1 | null = null;
    let clock = 0;
    let arrivedAt = -1;
    const mine = () => (state ? Math.max(0, state.rafts.findIndex((r) => r.team.includes(ctx.me.id))) : 0);
    return {
      input(e) {
        const side = sideOf(e);
        if (side === null || side === last || !state || state.winner !== null) return;
        const raft = state.rafts[mine()];
        if (!raft?.team.includes(ctx.me.id) || raft.capsized) return;
        last = side;
        ctx.send({ type: 'paddle', side });
        actors.get(ctx.me.id)!.force('paddle');
        strokeAt.set(ctx.me.id, clock);
        ctx.sfx('tap');
      },
      onState(s) {
        state = s as State;
      },
      onEvent(e: TypedPayload) {
        if (e.type === 'capsize' && state?.rafts[Number(e.raft)]?.team.includes(ctx.me.id)) {
          ctx.sfx('splash');
          ctx.shake(220);
        }
        if (e.type === 'arrived') {
          arrivedAt = clock;
          ctx.sfx(Number(e.raft) === mine() ? 'pop' : 'hurt');
        }
      },
      update(dt, t) {
        clock = t;
        if (!state) return;
        state.rafts.forEach((r, i) => {
          shown[i] = shown[i]! + (r.x - shown[i]!) * Math.min(1, dt / 100);
          r.team.forEach((id, k) => {
            const a = actors.get(id);
            if (!a) return;
            if (r.capsized || (state!.winner !== null && state!.winner !== i)) a.set('paddle_hurt');
            else if (id !== ctx.me.id && r.speed > 0.05) {
              // Others: stroke rhythm from the raft speed (individual strokes are not sent).
              const every = Math.max(200, 600 - r.speed * 380);
              if (t - (strokeAt.get(id) ?? -1e9) > every + k * 40) {
                strokeAt.set(id, t);
                a.force('paddle');
              }
            } else if (a.pose === 'paddle_hurt') a.force('paddle');
            a.update(dt);
          });
        });
        cam += (shown[mine()]! - cam) * Math.min(1, dt / 140);
      },
      draw(t) {
        const c = g();
        if (!state) {
          c.fillStyle = '#2a1f5c';
          c.fillRect(0, 0, 1280, 720);
          return;
        }
        const len = state.length;
        skyline(FAR - 14, Math.min(1, cam / len) * 140, 'radeau');
        // Far bank.
        c.fillStyle = '#1d1440';
        c.beginPath();
        c.moveTo(0, FAR + 6);
        for (let x = 0; x <= 1280; x += 40) c.lineTo(x, FAR - 26 + Math.sin((x + cam * 1.3) / 53) * 7);
        c.lineTo(1280, FAR + 6);
        c.closePath();
        c.fill();
        // River and moving streaks.
        const grd = c.createLinearGradient(0, FAR - 10, 0, NEAR);
        grd.addColorStop(0, '#1f4f9e');
        grd.addColorStop(1, '#3fa6ff');
        c.fillStyle = grd;
        c.fillRect(0, FAR - 12, 1280, 720 - FAR + 12);
        c.fillStyle = INK;
        c.fillRect(0, FAR - 14, 1280, 5);
        for (let r = 0; r < 13; r++) {
          const y = FAR + 12 + r * r * 2;
          c.fillStyle = `rgba(255,255,255,${0.18 + 0.22 * ((y - FAR) / (NEAR - FAR))})`;
          for (let wx = Math.floor((cam - 400) / 70) * 70; wx < cam + 500; wx += 70) {
            const q = at(cam, wx + ((r * 37) % 70) - t * 0.012, y);
            c.fillRect(q.x, y, 34 * q.s, 4 * q.s + 1);
          }
        }
        // Rapids.
        state.rapids.forEach(([a, b], ri) => {
          const a0 = at(cam, a, FAR);
          const b1 = at(cam, b, NEAR);
          if (b1.x < -40 && at(cam, b, FAR).x < -40) return;
          if (a0.x > 1320 && at(cam, a, NEAR).x > 1320) return;
          c.fillStyle = 'rgba(255,255,255,.22)';
          c.beginPath();
          c.moveTo(a0.x, FAR);
          c.lineTo(at(cam, b, FAR).x, FAR);
          c.lineTo(b1.x, NEAR);
          c.lineTo(at(cam, a, NEAR).x, NEAR);
          c.closePath();
          c.fill();
          for (let k = 0; k < 40; k++) {
            const u = (k * 0.618 + ri * 0.3) % 1;
            const v = (k * 0.382) % 1;
            const y = FAR + 8 + v * (NEAR - FAR - 12);
            const q = at(cam, a + u * (b - a), y);
            ellipse(q.x, y + Math.sin(t / 120 + k) * 3 * q.s, (12 + (k % 4) * 5) * q.s, 6 * q.s, 'rgba(255,255,255,.85)', 0);
          }
          for (const [u, v] of [[0.2, 0.15], [0.55, 0.62], [0.85, 0.3], [0.35, 0.9]] as const) {
            const y = FAR + v * (NEAR - FAR);
            const q = at(cam, a + u * (b - a), y);
            c.fillStyle = '#5b5470';
            c.strokeStyle = INK;
            c.lineWidth = 4 * q.s + 1;
            c.beginPath();
            c.ellipse(q.x, y, 34 * q.s, 16 * q.s, 0, Math.PI, 0);
            c.closePath();
            c.fill();
            c.stroke();
          }
          const lm = at(cam, (a + b) / 2, 520);
          if (lm.x > 80 && lm.x < 1200) outlineText('⚠ RAPIDE', lm.x, 520, Math.round(30 * lm.s), '#ffe04a', 'center', 6);
        });
        // Finish: buoys across the river and a flag.
        const f0 = at(cam, len, FAR);
        if (f0.x < 1320) {
          for (let k = 0; k <= 12; k++) {
            const y = FAR + 6 + (k / 12) * (NEAR - FAR - 6);
            const q = at(cam, len, y);
            circle(q.x, y + Math.sin(t / 200 + k) * 2, 11 * q.s + 3, k % 2 ? '#fff' : '#ff3b5c', 3);
          }
          c.fillStyle = INK;
          c.fillRect(f0.x - 5, FAR - 190, 10, 180);
          for (let k = 0; k < 6; k++) for (let j = 0; j < 3; j++) {
            c.fillStyle = (k + j) % 2 ? INK : '#fff';
            c.fillRect(f0.x + 5 + k * 18, FAR - 190 + j * 18, 18, 18);
          }
        }
        // Rafts: the other team behind, yours in front.
        const me = mine();
        const order = state.rafts.map((_, i) => i).sort((a, b) => (a === me ? 1 : b === me ? -1 : 0));
        for (const i of order) {
          const r = state.rafts[i]!;
          if (r.team.length === 0) continue;
          const y = i === me ? FRONT_Y : BACK_Y;
          const q = at(cam, shown[i]!, y);
          const s = q.s;
          const n = r.team.length;
          const rw = (n > 1 ? 640 : 540) * s;
          const rh = (rw * 110) / 900;
          const bob = Math.sin(t / 260 + i * 2) * 4 * s;
          const tilt = r.capsized ? Math.sin(t / 70) * 0.14 : Math.sin(t / 420 + i) * 0.02;
          c.save();
          c.translate(q.x, y + bob);
          c.rotate(tilt);
          ellipse(0, rh * 0.45, rw * 0.52, rh * 0.45, 'rgba(10,30,70,.35)', 0);
          if (!drawSprite('radeau', 'raft', 0, 0, 0, rh)) box(-rw / 2, -rh / 2, rw, rh, '#a8662e', 6, 12);
          r.team.forEach((id, k) => {
            const ox = (k - (n - 1) / 2) * 155 * s;
            const a = actors.get(id);
            const p = ctx.players.find((pp) => pp.id === id);
            if (!a || !p) return;
            const hh = 190 * s;
            a.draw(ox, -rh * 0.18, hh, { shadow: false });
            if (!assets.hasPoseArt(p.characterId, 'paddle')) {
              // Drawn paddle for characters without their own paddling art.
              const swing = r.capsized ? -0.9 : -0.55 + 1.25 * Math.sin(Math.min(1, (clock - (strokeAt.get(id) ?? -1e9)) / 320) * Math.PI * 0.5);
              c.save();
              c.translate(ox + 26 * s, -rh * 0.18 - 86 * s);
              c.rotate(swing);
              c.strokeStyle = INK;
              c.lineWidth = 13 * s;
              c.lineCap = 'round';
              c.beginPath();
              c.moveTo(0, -18 * s);
              c.lineTo(0, 135 * s);
              c.stroke();
              c.strokeStyle = '#a8662e';
              c.lineWidth = 7 * s;
              c.stroke();
              ellipse(0, 163 * s, 15 * s, 34 * s, '#b8793f', 5 * s);
              c.restore();
            }
            outlineText(p.isMe ? 'TOI' : p.nickname, ox, -rh * 0.18 - hh - 16, Math.round(26 * s + 6), p.isMe ? '#ffe04a' : p.color, 'center', 6);
          });
          c.restore();
          if (r.splashAt !== null && ctx.serverNow() - r.splashAt < 500) {
            const u = (ctx.serverNow() - r.splashAt) / 500;
            for (let k = 0; k < 9; k++) {
              const a = (k / 9) * Math.PI * 2;
              circle(q.x + Math.cos(a) * (rw * 0.3 + u * 160 * s), y - 20 * s + Math.sin(a) * 40 * s - u * 80 * s, 14 * s, '#e6f6ff', 3);
            }
            outlineText('PLOUF !', q.x, y - 260 * s, Math.round(64 * s), '#fff', 'center', 8);
          }
        }
        // Minimap and, near a rapid, your speed.
        const X0 = 330;
        const X1 = 950;
        const my = 80;
        const mx = (w: number) => X0 + (w / len) * (X1 - X0);
        box(X0 - 14, my - 12, X1 - X0 + 28, 24, INK, 0, 12);
        c.fillStyle = '#2f86d6';
        c.fillRect(X0, my - 5, X1 - X0, 10);
        c.fillStyle = '#fff';
        for (const [a, b] of state.rapids) c.fillRect(mx(a), my - 5, mx(b) - mx(a), 10);
        state.rafts.forEach((r, i) => {
          if (r.team.length === 0) return;
          const col = ctx.players.find((p) => p.id === r.team[0])?.color ?? '#fff';
          circle(mx(shown[i]!), my, i === me ? 11 : 8, i === me && r.team.includes(ctx.me.id) ? '#fff' : col, 4);
        });
        const mineRaft = state.rafts[me];
        if (mineRaft && state.winner === null && mineRaft.team.includes(ctx.me.id)) {
          const near = state.rapids.find(([a, b]) => mineRaft.x > a - 220 && mineRaft.x < b);
          if (near) {
            const ok = mineRaft.speed <= 1;
            gauge(510, 170, 260, 16, mineRaft.speed / 1.3, ok ? '#7dff9b' : '#ff5a4a');
            c.fillStyle = '#fff';
            c.fillRect(510 + 260 / 1.3 - 2, 162, 4, 32);
            outlineText(ok ? (mineRaft.x > near[0] ? 'TIENS BON' : 'DOUCEMENT…') : 'TROP VITE !', 640, 216, 26, ok ? '#fff' : '#ff5a4a', 'center', 6);
          } else if (!mineRaft.capsized) {
            const next = last === -1 ? 1 : -1;
            keyCap(580, 160, 'left', next === -1 ? 1 : 0.75, next === -1 ? 'next' : null);
            keyCap(700, 160, 'right', next === 1 ? 1 : 0.75, next === 1 ? 'next' : null);
          }
        }
        if (state.winner !== null) slam(state.rafts[state.winner]?.team.includes(ctx.me.id) ? 'GAGNÉ !' : 'ARRIVÉE !', t - arrivedAt, '#ffe04a', 640, 250, 100);
      },
    };
  },
});
