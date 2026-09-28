import type { TypedPayload } from '@boucan/shared';
import { assets, drawCharacter, drawSprite } from '../../engine/assets';
import { circle, ellipse, g, outlineText, slam } from '../../engine/draw';
import { defineMicrogame, type MgPlayer } from '../api';
import { Actor } from '../common';
import { Pad, PAD_LEFT, PAD_RIGHT, PAD_Y } from '../pad';
import { bomb } from '../props';

/**
 * DUEL — PING-PONG ! One-on-one matches side by side (the odd one out plays
 * the house bomb). Move your paddle (◀ ▶), swing when the ball reaches you
 * (hold ◀ or ▶ while swinging to aim); perfect timing = smash. First to 2.
 * Server-judged (server ping.ts); your paddle and your returns are predicted
 * locally so they answer at once. You always play from the near side.
 */
interface Ball {
  from: 0 | 1;
  x0: number;
  x1: number;
  t0: number;
  d: number;
  smash: boolean;
}
interface MatchState {
  ids: [string, string | null];
  sc: [number, number];
  px: [number, number];
  ball: Ball | null;
  serveAt: number;
  winner: 0 | 1 | null;
}
interface State {
  matches: MatchState[];
}

/** Mirror of the server's PING constants. */
const BALL_R = 0.07;
const REACH = 0.36;
const PADDLE_SPEED = 2.3;
const HIT_FROM = 0.8;
const HIT_TO = 1.12;
const SMASH_AT = 0.97;
const SMASH_TOL = 0.045;
const AIM_X = 0.56;
const COOLDOWN = 260;
const SWING_MS = 220;
/** Ping-pong poses (dedicated art): horizontal offset of the paddle from the feet, as a fraction of the height. */
const PADDLE_DX = { ping: -0.033, ping_ready: 0.264, ping_hit: 0.461 } as const;

/** Camera (metres): behind the near end of the table. */
const F = 1625;
const CAM_Z = -3.644;
const CAM_Y = 2.218;
const HY = 22;
const project = (x: number, y: number, z: number) => {
  const d = Math.max(0.3, z - CAM_Z);
  return { x: 640 + (F * x) / d, y: HY - (F * (y - CAM_Y)) / d, s: F / d };
};
const plane = (side: 0 | 1) => (side === 0 ? -0.3 : 3.04);

/** Ball position (x, height, depth, flight fraction) in the viewer's frame (side 0 = near). */
function ballAt(b: Ball, now: number): [number, number, number, number] {
  const k = (now - b.t0) / b.d;
  const to = b.from === 0 ? 1 : 0;
  const x = b.x0 + (b.x1 - b.x0) * Math.min(1.3, Math.max(0, k));
  const bounce = to === 0 ? 0.62 : 2.12;
  const kb = 0.62;
  if (k < kb) {
    const u = Math.max(0, k) / kb;
    const ys = b.from === 0 ? 1.0 : 0.85;
    return [x, ys + (0.76 + BALL_R - ys) * u + 0.28 * 4 * u * (1 - u), plane(b.from) + (bounce - plane(b.from)) * u, k];
  }
  const u = (k - kb) / (1 - kb);
  const ye = to === 0 ? 1.0 : 0.85;
  const cu = Math.min(u, 1);
  return [x, 0.76 + BALL_R + (ye - 0.76 - BALL_R) * u + 0.22 * 4 * cu * (1 - cu) - (u > 1 ? (u - 1) * 0.6 : 0), bounce + (plane(to) - bounce) * u, k];
}

export default defineMicrogame({
  id: 'ping',
  verb: 'PING-PONG !',
  create(ctx) {
    const actors = new Map(ctx.players.map((p) => [p.id, new Actor(p)]));
    const pad = new Pad(
      ctx,
      [
        { action: 'left', label: '◀', x: PAD_LEFT[0]!, y: PAD_Y, keys: ['left'] },
        { action: 'right', label: '▶', x: PAD_LEFT[1]!, y: PAD_Y, keys: ['right'] },
        { action: 'swing', label: 'FRAPPE', x: PAD_RIGHT[0]!, y: PAD_Y, keys: ['up'], big: true },
      ],
      { tap: 'swing' },
    );
    let state: State | null = null;
    let px = 0;
    let sentPx = 0;
    let sentAt = -1e9;
    let readyAt = 0;
    /** Swing animations (ms since the swing) by "match:side", in server sides. */
    const swings = new Map<string, number>();
    const shownPx = new Map<string, number>();
    let predicted: Ball | null = null;
    let msg: { text: string; col: string; t: number } | null = null;
    let smashT = 1e9;
    let overAt = -1;
    let clock = 0;
    const where = () => {
      const i = state ? state.matches.findIndex((m) => m.ids.includes(ctx.me.id)) : -1;
      return { m: Math.max(0, i), side: (i >= 0 ? state!.matches[i]!.ids.indexOf(ctx.me.id) : 0) as 0 | 1, playing: i >= 0 };
    };
    /** Server match → viewer frame (my side near, x mirrored for the far player). */
    const view = (m: MatchState, mySide: 0 | 1) => {
      const sgn = mySide === 0 ? 1 : -1;
      const flip = (s: 0 | 1) => (mySide === 0 ? s : ((1 - s) as 0 | 1));
      const b = m.ball && { ...m.ball, from: flip(m.ball.from), x0: m.ball.x0 * sgn, x1: m.ball.x1 * sgn };
      return { b, sgn, flip };
    };
    const playerOf = (id: string | null): MgPlayer | undefined => (id ? ctx.players.find((p) => p.id === id) : undefined);
    return {
      input(e) {
        if (!state || overAt >= 0) return;
        const w = where();
        if (!w.playing) return;
        for (const ev of pad.input(e)) {
          if (!ev.down || ev.action !== 'swing') continue;
          const now = ctx.serverNow();
          if (now < readyAt) continue;
          readyAt = now + COOLDOWN;
          swings.set(`${w.m}:${w.side}`, 0);
          const m = state.matches[w.m]!;
          const { b, sgn } = view(m, w.side);
          const aim = pad.axis('left', 'right');
          const x1 = aim ? aim * AIM_X : (Math.random() - 0.5) * 0.5;
          ctx.send({ type: 'swing', px: px * sgn, x1: x1 * sgn });
          ctx.sfx('whoosh');
          // Predict the return when it is a hit (the server state confirms it a moment later).
          if (!b || b.from === 0 || m.winner !== null) continue;
          const [bx, , , k] = ballAt(b, now);
          if (k < HIT_FROM || k > HIT_TO || Math.abs(px - bx) > REACH) continue;
          const smash = Math.abs(k - SMASH_AT) < SMASH_TOL;
          predicted = { from: 0, x0: bx, x1, t0: now, d: Math.max(430, b.d * 0.9) * (smash ? 0.78 : 1), smash };
          if (smash) smashT = 0;
          ctx.sfx('hit');
        }
      },
      onState(s) {
        state = s as State;
        if (overAt < 0 && state.matches.every((m) => m.winner !== null)) overAt = clock;
      },
      onEvent(e: TypedPayload) {
        const w = where();
        const mi = Number(e.m);
        if (e.type === 'swing') swings.set(`${mi}:${e.side}`, 0);
        if (mi !== w.m) return;
        if (e.type === 'hit') {
          if (e.side !== w.side) ctx.sfx('hit');
          if (e.smash) smashT = 0;
        } else if (e.type === 'point' || e.type === 'won') {
          predicted = null;
          const scorer = playerOf(state?.matches[mi]?.ids[Number(e.side)] ?? null);
          msg = { text: e.type === 'won' ? 'VICTOIRE !' : 'POINT !', col: scorer?.color ?? '#ff6b6b', t: 0 };
          ctx.sfx(e.side === w.side ? 'pop' : 'hurt');
          if (e.side !== w.side && w.playing) ctx.shake(160);
        }
      },
      update(dt, t) {
        clock = t;
        for (const [k, v] of swings) swings.set(k, v + dt);
        smashT += dt;
        if (msg && (msg.t += dt) > 900) msg = null;
        for (const a of actors.values()) a.update(dt);
        if (!state) return;
        const w = where();
        if (w.playing && overAt < 0) {
          px = Math.max(-1, Math.min(1, px + (pad.axis('left', 'right') * PADDLE_SPEED * dt) / 1000));
          const now = ctx.serverNow();
          if (px !== sentPx && now - sentAt > 66) {
            sentPx = px;
            sentAt = now;
            ctx.send({ type: 'pos', px: px * (w.side === 0 ? 1 : -1) });
          }
        }
        for (const [i, m] of state.matches.entries()) {
          for (const side of [0, 1] as const) {
            const key = `${i}:${side}`;
            const target = m.px[side];
            shownPx.set(key, (shownPx.get(key) ?? target) + (target - (shownPx.get(key) ?? target)) * Math.min(1, dt / 80));
          }
        }
        // Drop the prediction once the server knows about the return (or after a while).
        const mine = state.matches[w.m];
        if (predicted && mine?.ball && (mine.ball.t0 >= predicted.t0 - 200 || ctx.serverNow() - predicted.t0 > 400)) predicted = null;
      },
      draw(t) {
        const c = g();
        const now = ctx.serverNow();
        // Room: back wall with lights, wooden floor.
        const wallY = project(0, 0, 9).y;
        const wall = c.createLinearGradient(0, 0, 0, wallY);
        wall.addColorStop(0, '#1a1d3a');
        wall.addColorStop(1, '#3a4580');
        c.fillStyle = wall;
        c.fillRect(0, 0, 1280, wallY);
        for (let i = -8; i <= 8; i++) {
          const q = project(i * 1.1, 3.2, 9);
          circle(q.x, q.y, 4, 'rgba(255,240,180,.6)', 0);
        }
        const floor = c.createLinearGradient(0, wallY, 0, 720);
        floor.addColorStop(0, '#9c5f33');
        floor.addColorStop(1, '#d18c55');
        c.fillStyle = floor;
        c.fillRect(0, wallY, 1280, 720 - wallY);
        c.fillStyle = '#161616';
        c.fillRect(0, wallY - 2, 1280, 4);
        const line = (a: [number, number, number], b: [number, number, number], col: string) => {
          const p = project(...a);
          const q = project(...b);
          c.strokeStyle = col;
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(q.x, q.y);
          c.stroke();
        };
        for (let x = -8; x <= 8; x += 0.55) line([x, 0, -3], [x, 0, 9], 'rgba(90,50,20,.3)');
        for (let z = -2; z < 9; z += 1.2) line([-12, 0, z], [12, 0, z], 'rgba(90,50,20,.18)');
        if (!state) return;
        const w = where();
        const drawTable = (ox: number, oz: number) => {
          const l = project(ox - 0.76, 0.76, oz);
          const r = project(ox + 0.76, 0.76, oz);
          const sc = (r.x - l.x) / 1130;
          drawSprite('table-ping', 'table', 0, l.x - 205 * sc, l.y - 580 * sc, 1024 * sc);
        };
        const drawBall = (b: Ball, ox: number, oz: number) => {
          const [x, y, z] = ballAt(b, now);
          const q = project(x + ox, y, z + oz);
          const onTable = Math.abs(x) < 0.76 && z > 0 && z < 2.74;
          const sq = project(x + ox, onTable ? 0.76 : 0, z + oz);
          const r = Math.max(3, BALL_R * q.s);
          ellipse(sq.x, sq.y, r * 1.1, r * 0.35, 'rgba(0,0,0,.35)', 0);
          if (b.smash && now - b.t0 < 400) circle(q.x, q.y, r * 2.2, 'rgba(255,200,60,.45)', 0);
          circle(q.x, q.y, r, '#fff6e0', Math.max(2, r * 0.22));
        };
        const far = (id: string | null, x: number, ox: number, oz: number, swing: number, k: number) => {
          const q = project(x + ox + 0.3, 0, 3.3 + oz);
          const h = 1.55 * q.s * k;
          if (id) actors.get(id)?.draw(q.x, q.y, h, { flip: true, shadow: false, rot: swing > 0 ? -0.12 : 0 });
          else bomb(q.x, q.y, 1.1 * q.s * k, 0, true, 0);
          const sw = swing > 0 ? Math.sin(swing * Math.PI) : 0;
          const pq = project(x + ox, 0.85 + sw * 0.1, 3.04 + oz - sw * 0.1);
          circle(pq.x, pq.y, 0.13 * pq.s + 3, '#161616', 0);
          circle(pq.x, pq.y, 0.13 * pq.s, '#2d6bff', 0);
          const p = playerOf(id);
          outlineText(p ? p.nickname : 'BOMBE', q.x, q.y - h - 6, Math.round(Math.min(26, q.s * 0.08 + 10)), p?.color ?? '#ff6b6b', 'center', 5);
        };
        const near = (id: string | null, x: number, ox: number, oz: number, swing: number, coming: number, mine: boolean) => {
          const pq = project(x + ox, 1.0, -0.3 + oz);
          const p = playerOf(id);
          const sw = swing > 0 ? Math.sin(swing * Math.PI) : 0;
          if (mine && id && p) {
            // Big, from behind: the paddle in the hand is where the paddle is.
            const pose = swing > 0 ? 'ping_hit' : coming > 0.45 ? 'ping_ready' : 'ping';
            const h = 408;
            let x0 = pq.x - PADDLE_DX[pose] * h;
            if (assets.hasPoseArt(p.characterId, pose)) drawCharacter(p.characterId, pose, swing * SWING_MS, x0, pq.y + 0.47 * h, h, { color: p.color });
            else {
              x0 = pq.x - 144;
              drawCharacter(p.characterId, swing > 0 ? 'punch' : 'idle', swing * SWING_MS, x0, 720, 432, { color: p.color });
              circle(pq.x, pq.y - sw * 20, 0.13 * pq.s + 3, '#161616', 0);
              circle(pq.x, pq.y - sw * 20, 0.13 * pq.s, '#ff3b3b', 0);
            }
            outlineText('TOI', x0, pq.y + 0.47 * h - h * 0.95, 30, p.color, 'center', 6);
            return;
          }
          const q = project(x + ox - 0.35, 0, -0.55 + oz);
          const h = 1.3 * q.s;
          if (id) actors.get(id)?.draw(q.x, q.y, h, { shadow: false });
          else bomb(q.x, q.y, 1.1 * q.s, 0, false, 0);
          circle(pq.x, pq.y - sw * 20, 0.13 * pq.s + 3, '#161616', 0);
          circle(pq.x, pq.y - sw * 20, 0.13 * pq.s, '#ff3b3b', 0);
          outlineText(p ? p.nickname : 'BOMBE', q.x, q.y - h - 6, 16, p?.color ?? '#ff6b6b', 'center', 5);
        };
        const matchView = (mi: number, mySide: 0 | 1, ox: number, oz: number, mine: boolean) => {
          const m = state!.matches[mi]!;
          const { b: sb, sgn, flip } = view(m, mySide);
          const b = mine && predicted ? predicted : sb;
          const nearSide = flip(0);
          const farSide = flip(1);
          const pxOf = (side: 0 | 1) => (mine && side === mySide ? px : (shownPx.get(`${mi}:${side}`) ?? m.px[side]) * sgn);
          const swingOf = (side: 0 | 1) => {
            const s = swings.get(`${mi}:${side}`);
            return s !== undefined && s < SWING_MS ? s / SWING_MS : 0;
          };
          far(m.ids[farSide], pxOf(farSide), ox, oz, swingOf(farSide), mine ? 0.92 : 1);
          const behind = b !== null && ballAt(b, now)[2] > 1.37;
          if (b && behind) drawBall(b, ox, oz);
          drawTable(ox, oz);
          if (b && !behind) drawBall(b, ox, oz);
          if (mine && b && b.from === 1 && m.winner === null) {
            const q = project(b.x1, 0.77, 0.15);
            const pu = 1 + 0.1 * Math.sin(t / 60);
            c.strokeStyle = '#ffe04a';
            c.lineWidth = 5;
            c.beginPath();
            c.ellipse(q.x, q.y, 0.16 * q.s * pu, 0.05 * q.s * pu, 0, 0, Math.PI * 2);
            c.stroke();
          }
          const coming = b && b.from === 1 ? (now - b.t0) / b.d : 0;
          near(m.ids[nearSide], pxOf(nearSide), ox, oz, swingOf(nearSide), coming, mine);
        };
        // Another match in the back, then yours.
        const other = state.matches.findIndex((_, i) => i !== w.m);
        if (other >= 0) {
          c.save();
          c.globalAlpha = 0.8;
          matchView(other, 0, 2.7, 7.2, false);
          c.restore();
        }
        matchView(w.m, w.side, 0, 0, w.playing);
        const m = state.matches[w.m]!;
        const me = playerOf(m.ids[w.side]);
        const them = playerOf(m.ids[w.side === 0 ? 1 : 0]);
        const mySc = m.sc[w.side];
        const theirSc = m.sc[w.side === 0 ? 1 : 0];
        outlineText(`${me?.isMe ? 'TOI' : (me?.nickname ?? 'BOMBE')}  ${mySc} - ${theirSc}  ${them?.nickname ?? 'BOMBE'}`, 640, 96, 40, '#fff', 'center', 7);
        if (smashT < 500) outlineText('SMASH !', 640, 150, 44, '#ffe04a', 'center', 6);
        if (msg) outlineText(msg.text, 640, 230, 64, msg.col, 'center', 8);
        if (overAt >= 0) {
          const won = w.playing && m.winner === w.side;
          slam(w.playing ? (won ? 'TU GAGNES !' : 'PERDU…') : 'FIN DU MATCH', clock - overAt, '#ffe04a', 640, 220, 90, 900);
        } else if (w.playing) {
          pad.draw();
          if (!ctx.touch && t > 950) outlineText('◀ ▶ pendant la frappe = tu vises', 1240, 700, 18, '#fff', 'right', 4);
        }
      },
    };
  },
});
