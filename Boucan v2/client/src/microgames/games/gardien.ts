import type { TypedPayload } from '@boucan/shared';
import { assets, drawCharacter } from '../../engine/assets';
import { circle, g, INK, item, outlineText, slam } from '../../engine/draw';
import { defineMicrogame, type MgPlayer } from '../api';
import { Actor } from '../common';
import { keyCap } from '../props';

/**
 * DUEL — TIRS AU BUT : one keeper against up to three shooters (the others
 * watch from the stands). Shooter: tap the left / middle / right of the
 * screen (or ← ↑ →) to shoot there — when the power bar is on the yellow
 * mark. Keeper: tap where you dive (the view is from behind your goal).
 * Server-judged.
 */
type Dir = 'L' | 'C' | 'R';
type Tier = 'weak' | 'normal' | 'strong' | 'perfect' | 'over';
interface State {
  keeper: string;
  shooters: string[];
  k: number;
  phase: 'aim' | 'fly' | 'result' | 'end';
  phaseAt: number;
  aim: Dir;
  shot: { dir: Dir; power: number; tier: Tier; over: boolean; at: number; arrive: number } | null;
  dive: { dir: Dir; at: number; early: boolean } | null;
  outcomes: Record<string, 'goal' | 'saved' | 'miss'>;
}

/** Same values as the server module. */
const BAR_MS = 900;
const PERFECT = 0.84;
const DIVE_MS = 190;
/** World (metres): target of each direction [x, height], goal line depth, ball radius. */
const TARGET: Record<Dir, [number, number]> = { L: [-2.55, 0.95], C: [0, 2.0], R: [2.55, 0.95] };
const GOAL_Z = 11;
const BALL_R = 0.22;
const GOAL_W = 3.66;
const GOAL_H = 2.44;
const DEPTH = 1.8;

type Projector = (x: number, y: number, z: number) => { x: number; y: number; s: number; Z: number };

const barAt = (from: number, t: number) => 0.5 - 0.5 * Math.cos((Math.max(0, t - from) / BAR_MS) * Math.PI * 2);

export default defineMicrogame({
  id: 'gardien',
  verb: 'TIRS AU BUT !',
  create(ctx) {
    const actors = new Map(ctx.players.map((p) => [p.id, new Actor(p, 'idle')]));
    let state: State | null = null;
    let cz = -7;
    let cx = 0;
    let trail: [number, number, number][] = [];
    let lastShot: number | null = null;
    const pick = (x: number | null, keeperView: boolean): Dir | null => {
      if (x === null) return null;
      const third: Dir = x < 427 ? 'L' : x > 853 ? 'R' : 'C';
      // Behind the goal, the keeper sees the field mirrored.
      return keeperView ? (third === 'L' ? 'R' : third === 'R' ? 'L' : 'C') : third;
    };
    const keyDir = (key: string, keeperView: boolean): Dir | null => {
      const d: Dir | null = key === 'left' ? 'L' : key === 'right' ? 'R' : key === 'up' ? 'C' : null;
      return d && keeperView ? (d === 'L' ? 'R' : d === 'R' ? 'L' : 'C') : d;
    };

    /** Ball position (metres) now. */
    const ball = (now: number): [number, number, number] => {
      const s = state?.shot;
      if (!state || !s) return [0, BALL_R, 0];
      const t = TARGET[s.dir];
      const k = Math.min(1, (now - s.at) / Math.max(1, s.arrive - s.at));
      const ty = s.over ? 3.6 : t[1];
      let x = t[0] * k;
      let y = BALL_R + (ty - BALL_R) * k + (s.tier === 'perfect' ? 0.3 : 0.9) * 4 * k * (1 - k);
      let z = (GOAL_Z + 0.2) * k;
      if (state.phase === 'result' || state.phase === 'end') {
        const u = Math.min(1, (now - state.phaseAt) / 400);
        const saved = state.outcomes[state.shooters[state.k] ?? ''] === 'saved';
        if (saved) {
          x = t[0] * (1 + 0.6 * u);
          z = GOAL_Z + 0.2 - 3 * u;
          y = Math.max(BALL_R, t[1] + 1.2 * 4 * u * (1 - u));
        } else if (!s.over) {
          z = GOAL_Z + 0.2 + 1.2 * u;
          y = Math.max(BALL_R, y - 0.6 * u);
        } else {
          z = GOAL_Z + 0.2 + 4 * u;
        }
      }
      return [x, y, z];
    };

    const keeperPose = (now: number) => {
      const d = state?.dive;
      if (!d) return { x: 0, lift: 0, rot: 0 };
      const t = TARGET[d.dir];
      const k = Math.min(1, (now - d.at) / DIVE_MS) * (d.early && state?.phase === 'aim' ? 0.35 : 1);
      return { x: t[0] * 0.85 * k, lift: (d.dir === 'C' ? 0.9 : 0.35) * k, rot: Math.sign(t[0]) * 1.25 * k };
    };

    return {
      input(e) {
        if (!state || state.phase === 'end') return;
        const isKeeper = state.keeper === ctx.me.id;
        const dir = e.type === 'down' ? pick(e.x, isKeeper) : e.type === 'key' && !e.repeat ? keyDir(e.key, isKeeper) : null;
        if (isKeeper) {
          if (dir && !state.dive && (state.phase === 'aim' || state.phase === 'fly')) {
            ctx.send({ type: 'dive', dir });
            ctx.sfx('whoosh');
          }
          return;
        }
        if (state.phase !== 'aim' || state.shooters[state.k] !== ctx.me.id || ctx.serverNow() < state.phaseAt) return;
        if (dir) ctx.send({ type: 'aim', dir });
        if (dir || (e.type === 'down' && e.x === null)) {
          ctx.send({ type: 'shoot' });
          ctx.sfx('hit');
        }
      },
      onState(s) {
        state = s as State;
        if (state.shot && state.shot.at !== lastShot) {
          lastShot = state.shot.at;
          trail = [];
          const shooter = state.shooters[state.k];
          if (shooter) actors.get(shooter)?.force('kick');
        }
      },
      onEvent(e: TypedPayload) {
        const mineShot = e.shooter === ctx.me.id;
        const keeperMe = state?.keeper === ctx.me.id;
        if (e.type === 'shot' && e.tier === 'perfect') ctx.shake(200);
        if (e.type === 'goal') ctx.sfx(mineShot ? 'win' : keeperMe ? 'hurt' : 'pop');
        if (e.type === 'saved' || e.type === 'miss') ctx.sfx(keeperMe ? 'pop' : mineShot ? 'hurt' : 'block');
      },
      update(dt) {
        actors.forEach((a) => a.update(dt));
        if (!state) return;
        const now = ctx.serverNow();
        let tz = -7;
        let tx = 0;
        if (state.phase === 'fly' && state.shot) {
          const k = Math.min(1, (now - state.shot.at) / Math.max(1, state.shot.arrive - state.shot.at));
          const b = ball(now);
          trail.push(b);
          if (trail.length > 14) trail.shift();
          tz = -7 + 6.5 * k * k;
          tx = b[0] * 0.35;
        } else if (state.phase === 'result' && state.shot) {
          tz = -0.5;
          tx = TARGET[state.shot.dir][0] * 0.35;
        }
        const kk = state.phase === 'fly' ? 1 : Math.min(1, dt / 220);
        cz += (tz - cz) * kk;
        cx += (tx - cx) * Math.min(1, dt / 200);
      },
      draw(t) {
        const c = g();
        if (!state) {
          c.fillStyle = '#3fae5f';
          c.fillRect(0, 0, 1280, 720);
          return;
        }
        const now = ctx.serverNow();
        const s = state;
        const keeperView = s.keeper === ctx.me.id;
        const current = s.phase === 'end' ? undefined : s.shooters[s.k];
        const pr: Projector = keeperView
          ? (x, y, z) => {
              // High camera behind the goal, matching the keeper-view stadium picture.
              const Z = Math.max(0.25, 15.3 - z);
              return { x: 640 - (733 * x) / Z, y: 36 - (733 * (y - 3.68)) / Z, s: 733 / Z, Z };
            }
          : (x, y, z) => {
              const Z = Math.max(0.25, z - cz);
              return { x: 640 + (1250 * (x - cx)) / Z, y: 170 - (1250 * (y - 1.8)) / Z, s: 1250 / Z, Z };
            };
        const quad = (pts: [number, number, number][], fill: string) => {
          c.fillStyle = fill;
          c.beginPath();
          pts.forEach((p, i) => {
            const q = pr(...p);
            if (i) c.lineTo(q.x, q.y);
            else c.moveTo(q.x, q.y);
          });
          c.closePath();
          c.fill();
        };
        const line = (a: [number, number, number], b: [number, number, number], col: string, w: number) => {
          const q1 = pr(...a);
          const q2 = pr(...b);
          if (q1.Z < 0.3 && q2.Z < 0.3) return;
          c.strokeStyle = col;
          c.lineWidth = w;
          c.beginPath();
          c.moveTo(q1.x, q1.y);
          c.lineTo(q2.x, q2.y);
          c.stroke();
        };
        // Stadium picture of the view; drawn crowd and pitch when it is missing.
        const stadium = assets.image(keeperView ? 'stade-gardien' : 'stade-tireur');
        if (stadium) {
          c.fillStyle = '#2f9a52';
          c.fillRect(0, 0, 1280, 720);
          if (keeperView) c.drawImage(stadium, -128, 0, 1536, 722);
          else {
            const k = (GOAL_Z + 7) / (GOAL_Z - cz);
            const goal = pr(0, 1.22, GOAL_Z);
            c.drawImage(stadium, goal.x - 640 * k, goal.y - 190.3 * k, 1280 * k, 602 * k);
          }
        } else if (!keeperView) {
          const hz = pr(0, 0, 400).y;
          const sky = c.createLinearGradient(0, 0, 0, hz);
          sky.addColorStop(0, '#141028');
          sky.addColorStop(1, '#3b2f63');
          c.fillStyle = sky;
          c.fillRect(0, 0, 1280, hz + 2);
          const cols = ['#ff4f7b', '#3fb8ff', '#ffd23c', '#2fd07a', '#fff', '#b04fff'];
          for (let r = 0; r < 9; r++) {
            for (let i = -30; i <= 30; i++) {
              const q = pr(i * 1.3 + (r % 2) * 0.65, 0.6 + r * 0.9, 24 + r * 0.8);
              if (q.x < -10 || q.x > 1290 || q.y > hz) continue;
              circle(q.x, q.y + Math.sin(t / 170 + i + r) * q.s * 0.05, Math.max(1.5, q.s * 0.28), cols[((i + 40) * 7 + r * 3) % 6]!, 0);
            }
          }
          for (let k = 0; k < 26; k++) {
            const z0 = cz + 0.3 + k * 2;
            if (z0 > 60) break;
            quad([[-45, 0, z0], [45, 0, z0], [45, 0, z0 + 2], [-45, 0, z0 + 2]], k % 2 ? '#3fae5f' : '#4cc06d');
          }
        } else {
          c.fillStyle = '#3fae5f';
          c.fillRect(0, 0, 1280, 720);
          for (let k = 0; k < 30; k++) {
            const z0 = 17 - k * 3;
            quad([[-40, 0, z0], [40, 0, z0], [40, 0, z0 - 3], [-40, 0, z0 - 3]], k % 2 ? '#3aa85c' : '#5bd07e');
          }
        }
        if (!stadium) {
          const W = 'rgba(255,255,255,.9)';
          const lw = (p: [number, number, number]) => Math.max(2, pr(...p).s * 0.1);
          const L = (a: [number, number, number], b: [number, number, number]) => line(a, b, W, lw(a));
          L([-40, 0, GOAL_Z], [40, 0, GOAL_Z]);
          L([-9.16, 0, GOAL_Z], [-9.16, 0, GOAL_Z - 5.5]);
          L([9.16, 0, GOAL_Z], [9.16, 0, GOAL_Z - 5.5]);
          L([-9.16, 0, GOAL_Z - 5.5], [9.16, 0, GOAL_Z - 5.5]);
          L([-20.16, 0, GOAL_Z], [-20.16, 0, GOAL_Z - 16.5]);
          L([20.16, 0, GOAL_Z], [20.16, 0, GOAL_Z - 16.5]);
          L([-20.16, 0, GOAL_Z - 16.5], [20.16, 0, GOAL_Z - 16.5]);
        }
        // Net (back), then the players, then the posts in front (all in the pictures).
        if (!keeperView && !stadium) {
          quad([[-GOAL_W, 0, GOAL_Z + DEPTH], [GOAL_W, 0, GOAL_Z + DEPTH], [GOAL_W, GOAL_H * 0.8, GOAL_Z + DEPTH], [-GOAL_W, GOAL_H * 0.8, GOAL_Z + DEPTH]], 'rgba(255,255,255,.12)');
          for (let x = -GOAL_W; x <= GOAL_W + 0.01; x += 0.4) line([x, 0, GOAL_Z + DEPTH], [x, GOAL_H * 0.8, GOAL_Z + DEPTH], 'rgba(255,255,255,.35)', 1.5);
          for (let y = 0; y <= GOAL_H * 0.8; y += 0.4) line([-GOAL_W, y, GOAL_Z + DEPTH], [GOAL_W, y, GOAL_Z + DEPTH], 'rgba(255,255,255,.35)', 1.5);
        }
        const person = (p: MgPlayer | undefined, x: number, z: number, hm: number, flip: boolean, lift = 0, rot = 0) => {
          if (!p) return;
          const q = pr(x, lift, z);
          if (q.Z < 0.7) return;
          const gq = pr(x, 0, z);
          c.fillStyle = 'rgba(0,0,0,.25)';
          c.beginPath();
          c.ellipse(gq.x, gq.y, q.s * 0.45, q.s * 0.1, 0, 0, Math.PI * 2);
          c.fill();
          const a = actors.get(p.id);
          if (a) a.draw(q.x, q.y, hm * q.s, { flip, rot, shadow: false });
          else drawCharacter(p.characterId, 'idle', t, q.x, q.y, hm * q.s, { flip, rot, color: p.color });
          outlineText(p.isMe ? 'TOI' : p.nickname, q.x, q.y - hm * q.s - 8, Math.round(Math.min(28, q.s * 0.12 + 10)), p.isMe ? '#ffe04a' : p.color, 'center', 5);
        };
        const players = (id: string | undefined) => ctx.players.find((p) => p.id === id);
        const kp = keeperPose(now);
        const keeperActor = actors.get(s.keeper);
        if (keeperActor) keeperActor.set(s.dive ? 'catch' : 'idle');
        // Waiting shooters on the side.
        s.shooters.forEach((id, i) => {
          if (id === current) return;
          const left = i % 2 === 0;
          const o = s.outcomes[id];
          person(players(id), left ? -8 - i * 0.8 : 8 + i * 0.8, 3 + i * 0.6, 1.5, !left);
          if (o) {
            const q = pr(left ? -8 - i * 0.8 : 8 + i * 0.8, 0, 3 + i * 0.6);
            if (q.Z > 0.7) outlineText(o === 'goal' ? '✔' : '✘', q.x, q.y + 22, 22, o === 'goal' ? '#7dff9b' : '#ff6b6b', 'center', 4);
          }
        });
        person(players(s.keeper), kp.x, GOAL_Z + (keeperView ? -0.3 : 0.15), 1.55, keeperView, kp.lift, keeperView ? -kp.rot : kp.rot);
        const b = ball(now);
        const drawBall = (big: number) => {
          const q = pr(...b);
          if (q.Z < 0.5) return;
          const gq = pr(b[0], 0, b[2]);
          const r = Math.max(6, BALL_R * q.s * big);
          c.fillStyle = `rgba(0,0,0,${0.3 - 0.04 * Math.min(5, b[1])})`;
          c.beginPath();
          c.ellipse(gq.x, gq.y, r * 1.1, r * 0.3, 0, 0, Math.PI * 2);
          c.fill();
          if (s.phase === 'fly' && s.shot && s.shot.tier !== 'weak') {
            trail.forEach((p, i) => {
              const tq = pr(...p);
              if (tq.Z < 0.5) return;
              const k = i / trail.length;
              const hot = s.shot!.tier === 'perfect';
              c.fillStyle = hot ? `hsla(${20 + k * 30},100%,${50 + k * 20}%,${k * 0.9})` : `rgba(255,255,255,${k * 0.45})`;
              c.beginPath();
              c.arc(tq.x, tq.y, Math.max(3, BALL_R * tq.s * (hot ? 1.3 : 1) * k), 0, Math.PI * 2);
              c.fill();
            });
          }
          if (item('foot', q.x, q.y, r * 2.2, t / 80)) return;
          c.save();
          c.translate(q.x, q.y);
          c.rotate(t / 80);
          circle(0, 0, r, '#fff', Math.max(2, r * 0.18));
          c.fillStyle = INK;
          c.beginPath();
          for (let i = 0; i < 5; i++) c.lineTo(Math.cos((i / 5) * Math.PI * 2) * r * 0.38, Math.sin((i / 5) * Math.PI * 2) * r * 0.38);
          c.fill();
          c.restore();
        };
        const inNet = b[2] > GOAL_Z + 0.2;
        if (inNet && !keeperView) drawBall(1);
        // Posts.
        const post = pr(0, GOAL_H, GOAL_Z);
        const pw = Math.max(6, post.s * 0.14);
        if (!stadium) for (const [a, bb] of [
          [[-GOAL_W, 0, GOAL_Z], [-GOAL_W, GOAL_H, GOAL_Z]],
          [[GOAL_W, 0, GOAL_Z], [GOAL_W, GOAL_H, GOAL_Z]],
          [[-GOAL_W, GOAL_H, GOAL_Z], [GOAL_W, GOAL_H, GOAL_Z]],
        ] as [number, number, number][][]) {
          line(a!, bb!, INK, pw + 8);
          line(a!, bb!, '#fff', pw);
        }
        if (current && !keeperView) person(players(current), -0.95, -1.1, 1.6, false);
        if (current && keeperView) person(players(current), 1.1, -1.2, 1.7, true);
        if (s.phase !== 'end' && (!inNet || keeperView)) drawBall(keeperView ? 1.8 : 1);
        // Where the ball goes (keeper view): a target as soon as it is shot.
        if (keeperView && s.phase === 'fly' && s.shot && !s.shot.over) {
          const tq = pr(TARGET[s.shot.dir][0], TARGET[s.shot.dir][1], GOAL_Z);
          const pu = 1 + 0.12 * Math.sin(t / 50);
          c.strokeStyle = '#ff3b3b';
          c.lineWidth = 8;
          c.beginPath();
          c.arc(tq.x, tq.y, 70 * pu, 0, Math.PI * 2);
          c.stroke();
        }
        // Aim marker for the shooter.
        if (s.phase === 'aim' && current === ctx.me.id) {
          const tq = pr(TARGET[s.aim][0], TARGET[s.aim][1], GOAL_Z);
          c.strokeStyle = '#ffe04a';
          c.lineWidth = 5;
          c.setLineDash([9, 7]);
          c.beginPath();
          c.arc(tq.x, tq.y, BALL_R * tq.s * 2.2, 0, Math.PI * 2);
          c.stroke();
          c.setLineDash([]);
        }
        // Power bar.
        const value = s.phase === 'aim' ? barAt(s.phaseAt, now) : (s.shot?.power ?? 0);
        const bx = keeperView ? 60 : 1215;
        const by = keeperView ? 170 : 180;
        const bh = keeperView ? 170 : 320;
        const bw = keeperView ? 20 : 32;
        const Y = (u: number) => by + bh * (1 - u);
        c.fillStyle = INK;
        c.beginPath();
        c.roundRect(bx - bw / 2 - 8, by - 6, bw + 16, bh + 12, 12);
        c.fill();
        for (const [a, bb, col] of [[0, 0.45, '#7a7a7a'], [0.45, 0.74, '#2fd07a'], [0.74, 0.94, '#ff9f1c'], [0.94, 1, '#ff4a4a'], [PERFECT - 0.025, PERFECT + 0.025, '#ffe04a']] as const) {
          c.fillStyle = col;
          c.fillRect(bx - bw / 2, Y(bb), bw, Y(a) - Y(bb));
        }
        c.fillStyle = '#fff';
        c.fillRect(bx - bw / 2 - 12, Y(value) - 4, bw + 24, 8);
        if (!keeperView) outlineText('TIR', bx, by - 24, 24, '#fff');
        // Messages.
        if (s.shot && (s.phase === 'fly' || (s.phase === 'result' && now - s.phaseAt < 300))) {
          const label = { perfect: 'PERFECT !!', strong: 'PUISSANT !', normal: '', weak: 'TROP MOU…', over: '' }[s.shot.tier];
          if (label) slam(label, now - s.shot.at, s.shot.tier === 'perfect' ? '#ffe04a' : s.shot.tier === 'weak' ? '#bbb' : '#ff9f1c', 640, keeperView ? 560 : 130, s.shot.tier === 'perfect' ? 90 : 70);
        }
        if (s.phase === 'result' || s.phase === 'end') {
          const o = s.outcomes[s.shooters[Math.min(s.k, s.shooters.length - 1)] ?? ''];
          const msg = o === 'goal' ? 'BUT !' : o === 'saved' ? 'ARRÊT !' : 'À CÔTÉ !';
          const good = keeperView ? o !== 'goal' : o === 'goal';
          slam(msg, s.phase === 'result' ? now - s.phaseAt : 900, good ? '#7dff9b' : '#ffe04a', 640, 300, 120);
        }
        if (s.phase === 'aim' && now < s.phaseAt && current) {
          outlineText(current === ctx.me.id ? 'À TOI DE TIRER !' : `${players(current)?.nickname ?? ''} TIRE`, 640, 400, 42, '#fff', 'center', 7);
        }
        if (s.phase === 'end') {
          const stopped = Object.values(s.outcomes).filter((o) => o !== 'goal').length;
          outlineText(`ARRÊTS : ${stopped} / ${Object.keys(s.outcomes).length}`, 640, 440, 40, '#fff', 'center', 7);
        }
        // Controls.
        if (keeperView && !s.dive && s.phase !== 'end' && s.phase !== 'result') {
          keyCap(1040, 640, 'left', 0.85);
          keyCap(1135, 640, 'up', 0.85);
          keyCap(1230, 640, 'right', 0.85);
          outlineText('plonge !', 1135, 590, 22, '#fff', 'center', 4);
        }
        if (!keeperView && current === ctx.me.id && s.phase === 'aim') {
          keyCap(820, 650, 'left', s.aim === 'L' ? 1 : 0.75, s.aim === 'L' ? 'ok' : null);
          keyCap(912, 650, 'up', s.aim === 'C' ? 1 : 0.75, s.aim === 'C' ? 'ok' : null);
          keyCap(1004, 650, 'right', s.aim === 'R' ? 1 : 0.75, s.aim === 'R' ? 'ok' : null);
          outlineText('tape où tu tires, sur le jaune !', 912, 596, 22, '#fff', 'center', 5);
        }
        if (!keeperView && !s.shooters.includes(ctx.me.id)) outlineText('TU REGARDES DEPUIS LES TRIBUNES', 640, 700, 22, '#fff', 'center', 5);
      },
    };
  },
});
