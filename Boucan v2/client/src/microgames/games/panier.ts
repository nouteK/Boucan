import { clamp, ellipse, g, INK, outlineText, slam } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { byLevel, hero, isPress } from '../common';

/**
 * DANS LE PANIER ! — in the gym, seen from behind you: the hoop slides left
 * and right; shoot (one tap) so that it is on the dashed line when the ball
 * gets there. Metres in a 3D space, projected by a camera that follows the
 * ball.
 */
const A = 2.0; // hoop sway (m)
const FLIGHT_MS = 620;
const HOOP_Z = 5.5;
const RIM_H = 3.05;
const BALL_R = 0.24;
const FOCAL = 720;
const CAM_Y = 2.2;
const HORIZON = 250;
/** Throw animation: the ball leaves the hand after its first frame. */
const RELEASE_MS = 110;

type Vec = [number, number, number];

export default defineMicrogame({
  id: 'panier',
  verb: 'DANS LE PANIER !',
  create(ctx) {
    const me = hero(ctx);
    const phase = ctx.rng.range(0, Math.PI * 2);
    const speed = ctx.rng.range(0.0008, 0.0011) * byLevel(ctx, 1, 1.15, 1.3);
    const tolerance = byLevel(ctx, 0.7, 0.62, 0.55);
    const hoopX = (t: number) => A * Math.sin(phase + t * speed);
    let state: 'aim' | 'wind' | 'fly' | 'in' | 'miss' = 'aim';
    let clock = 0;
    let stateT = 0;
    let camZ = -3.5;
    let ball: Vec | null = null;
    let vel: Vec = [0, 0, 0];
    let inX = 0;
    const go = (s: typeof state) => {
      state = s;
      stateT = 0;
    };
    const project = (x: number, y: number, z: number) => {
      const d = Math.max(0.3, z - camZ);
      return { x: 640 + (FOCAL * x) / d, y: HORIZON - (FOCAL * (y - CAM_Y)) / d, s: FOCAL / d, d };
    };
    return {
      input(e) {
        if (!isPress(e) || state !== 'aim' || ctx.outcome) return;
        go('wind');
        me.force('throw');
        ctx.sfx('tap');
      },
      update(dt, t) {
        clock = t;
        stateT += dt;
        me.update(dt);
        if (state === 'wind' && stateT >= RELEASE_MS) {
          go('fly');
          ctx.sfx('jump');
        }
        if (state === 'fly') {
          const k = Math.min(1, stateT / FLIGHT_MS);
          ball = [-0.75 + 0.75 * k, 1.75 + (RIM_H + 0.15 - 1.75) * k + 1.2 * 4 * k * (1 - k), 0.6 + (HOOP_Z - 0.6) * k];
          camZ = -3.5 + 1.3 * k * k;
          if (k >= 1) {
            const d = hoopX(t);
            if (Math.abs(d) < tolerance) {
              inX = d;
              go('in');
              me.force('win');
              ctx.sfx('pop');
              ctx.shake(100);
              ctx.win();
            } else {
              go('miss');
              vel = [-Math.sign(d) * 0.0025, 0.004, -0.002];
              me.force('lose');
              ctx.sfx('block');
              ctx.lose();
            }
          }
        } else if (state === 'in') {
          ball = [inX * Math.min(1, stateT / 150), Math.max(BALL_R, RIM_H + 0.15 - stateT * 0.004), HOOP_Z];
        } else if (state === 'miss' && ball) {
          vel[1] -= 0.00002 * dt;
          ball = [ball[0] + vel[0] * dt, Math.max(BALL_R, ball[1] + vel[1] * dt), ball[2] + vel[2] * dt];
        }
        if (state === 'in' || state === 'miss') camZ += (-2.6 - camZ) * Math.min(1, dt / 300);
      },
      timeout: () => (state === 'in' ? 'success' : 'failure'),
      draw(t) {
        const c = g();
        const quad = (pts: Vec[], fill: string) => {
          c.beginPath();
          pts.forEach((p, i) => {
            const q = project(...p);
            if (i) c.lineTo(q.x, q.y);
            else c.moveTo(q.x, q.y);
          });
          c.closePath();
          c.fillStyle = fill;
          c.fill();
        };
        const line = (a: Vec, b: Vec, col: string, w: number) => {
          const p = project(...a);
          const q = project(...b);
          c.strokeStyle = col;
          c.lineWidth = w;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(q.x, q.y);
          c.stroke();
        };
        // Gym: back wall with lights, wooden floor in perspective.
        const wallZ = HOOP_Z + 3;
        const wallBottom = project(0, 0, wallZ).y;
        const wall = c.createLinearGradient(0, 0, 0, wallBottom);
        wall.addColorStop(0, '#1d2346');
        wall.addColorStop(1, '#3a4580');
        c.fillStyle = wall;
        c.fillRect(0, 0, 1280, wallBottom + 2);
        for (let i = -12; i <= 12; i++) {
          const q = project(i * 1.2, 4.6, wallZ);
          c.fillStyle = `rgba(255,240,180,${0.5 + 0.3 * Math.sin(t / 300 + i)})`;
          c.beginPath();
          c.arc(q.x, q.y, 5, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = '#d9a066';
        c.fillRect(0, wallBottom, 1280, 720 - wallBottom);
        for (let k = 0; k < 22; k++) {
          const z0 = camZ + 0.3 + k * 1.2;
          if (z0 > wallZ) break;
          quad([[-20, 0, z0], [20, 0, z0], [20, 0, Math.min(wallZ, z0 + 1.2)], [-20, 0, Math.min(wallZ, z0 + 1.2)]], k % 2 ? '#d9a066' : '#e6b27a');
        }
        for (let x = -20; x < 20; x += 0.8) line([x, 0, camZ + 0.3], [x, 0, wallZ], 'rgba(120,70,30,.25)', 1.5);
        const fog = c.createLinearGradient(0, wallBottom - 10, 0, wallBottom + 60);
        fog.addColorStop(0, 'rgba(30,35,70,.35)');
        fog.addColorStop(1, 'rgba(30,35,70,0)');
        c.fillStyle = fog;
        c.fillRect(0, wallBottom - 10, 1280, 70);
        // Painted key, lines, and the dashed line the ball follows.
        quad([[-2.45, 0, HOOP_Z + 1.2], [2.45, 0, HOOP_Z + 1.2], [2.45, 0, HOOP_Z - 4.6], [-2.45, 0, HOOP_Z - 4.6]], 'rgba(63,184,255,.45)');
        for (const [a, b] of [
          [[-2.45, 0, HOOP_Z + 1.2], [-2.45, 0, HOOP_Z - 4.6]],
          [[2.45, 0, HOOP_Z + 1.2], [2.45, 0, HOOP_Z - 4.6]],
          [[-2.45, 0, HOOP_Z - 4.6], [2.45, 0, HOOP_Z - 4.6]],
          [[-8, 0, HOOP_Z + 1.2], [8, 0, HOOP_Z + 1.2]],
        ] as [Vec, Vec][])
          line(a, b, '#fff', 3);
        c.setLineDash([14, 12]);
        line([0, 0, 0.8], [0, 0, HOOP_Z + 1.2], 'rgba(255,224,74,.9)', 4);
        c.setLineDash([]);
        // The hoop: pole, backboard, rim, net (frozen where the ball went in).
        const hx = state === 'in' ? inX : hoopX(clock);
        const bz = HOOP_Z + 0.45;
        const poleW = project(hx, 0, bz).s;
        line([hx, 0, bz + 0.6], [hx, 3.2, bz + 0.6], INK, Math.max(6, poleW * 0.22));
        line([hx, 0, bz + 0.6], [hx, 3.2, bz + 0.6], '#8e99a4', Math.max(3, poleW * 0.14));
        line([hx, 3.2, bz + 0.6], [hx, 3.3, bz], '#8e99a4', 6);
        quad([[hx - 0.95, 2.85, bz], [hx + 0.95, 2.85, bz], [hx + 0.95, 4, bz], [hx - 0.95, 4, bz]], '#fff');
        {
          const a = project(hx - 0.95, 4, bz);
          const b = project(hx + 0.95, 2.85, bz);
          c.strokeStyle = INK;
          c.lineWidth = 5;
          c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
          const p = project(hx - 0.3, 3.5, bz);
          const q = project(hx + 0.3, 3.08, bz);
          c.strokeStyle = '#ff5a1f';
          c.lineWidth = 4;
          c.strokeRect(p.x, p.y, q.x - p.x, q.y - p.y);
        }
        const rim = project(hx, RIM_H, HOOP_Z);
        const rr = 0.42 * rim.s;
        const rimHalf = (front: boolean) => {
          c.strokeStyle = INK;
          c.lineWidth = Math.max(6, rr * 0.22);
          c.beginPath();
          c.ellipse(rim.x, rim.y, rr, rr * 0.3, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
          c.stroke();
          c.strokeStyle = '#ff5a1f';
          c.lineWidth = Math.max(3, rr * 0.13);
          c.stroke();
        };
        const drawBall = (b: Vec, spin: number) => {
          const q = project(...b);
          const gq = project(b[0], 0, b[2]);
          const r = Math.max(6, BALL_R * q.s);
          ellipse(gq.x, gq.y, r, r * 0.3, 'rgba(0,0,0,.25)', 0);
          c.save();
          c.translate(q.x, q.y);
          c.rotate(spin);
          c.fillStyle = '#ff8a1f';
          c.strokeStyle = INK;
          c.lineWidth = Math.max(3, r * 0.14);
          c.beginPath();
          c.arc(0, 0, r, 0, Math.PI * 2);
          c.fill();
          c.stroke();
          c.lineWidth = Math.max(2, r * 0.1);
          c.beginPath();
          c.moveTo(-r, 0);
          c.lineTo(r, 0);
          c.moveTo(0, -r);
          c.lineTo(0, r);
          c.stroke();
          c.restore();
        };
        rimHalf(false);
        if (state === 'in' && ball) drawBall(ball, 0);
        c.strokeStyle = 'rgba(255,255,255,.9)';
        c.lineWidth = 2;
        for (let i = -4; i <= 4; i++) {
          c.beginPath();
          c.moveTo(rim.x + (i * rr) / 4, rim.y);
          c.lineTo(rim.x + (i * rr) / 7, rim.y + rr * 1.1);
          c.stroke();
        }
        c.beginPath();
        c.ellipse(rim.x, rim.y + rr * 1.1, rr * 0.55, rr * 0.12, 0, 0, Math.PI * 2);
        c.stroke();
        rimHalf(true);
        // You, in the foreground.
        const dq = project(-1.25, 0, 0.5);
        if (dq.d > 0.9) {
          ellipse(dq.x, dq.y, 0.5 * dq.s, 0.12 * dq.s, 'rgba(0,0,0,.25)', 0);
          me.draw(dq.x, dq.y, clamp(1.55 * dq.s, 120, 420), { shadow: false });
        }
        if (state === 'aim' || state === 'wind') drawBall(state === 'wind' && stateT < RELEASE_MS ? [-1.45, 2.0, 0.5] : [-0.85, 1.3, 0.5], 0);
        else if (state !== 'in' && ball) drawBall(ball, t * 0.02);
        if (state === 'aim') outlineText(hoopX(clock + 300) > hoopX(clock) ? '▶' : '◀', rim.x, rim.y - rr * 2.4, 30, '#fff', 'center', 5);
        if (state === 'in') slam('PANIER !', stateT, '#ffe04a', 640, 300, 110, 600);
        if (state === 'miss') outlineText('RATÉ LE CERCLE', 640, 300, 44, '#fff');
      },
    };
  },
});
