import { assets } from '../../engine/assets';
import { ellipse, g, INK, item, outlineText, slam } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { byLevel, hero, isPress } from '../common';

/**
 * DANS LE PANIER ! — in the gym, seen from behind you: the hoop slides left
 * and right; shoot (one tap) so that it is on the dashed line when the ball
 * gets there. Metres in a 3D space, projected by a fixed camera that matches
 * the gym picture.
 */
const A = 2.0; // hoop sway (m)
const FLIGHT_MS = 620;
const HOOP_Z = 5.5;
const RIM_H = 2.6;
const BALL_R = 0.24;
/** Camera of the gym picture (1280×793, drawn 40 px higher to leave room for the fuse). */
const FOCAL = 835;
const CAM_Y = 2.34;
const CAM_Z = -4.12;
const HORIZON = 249 - 40;
/** Throw animation: the ball leaves the hand after its first frame. */
const RELEASE_MS = 110;

type Vec = [number, number, number];

const project = (x: number, y: number, z: number) => {
  const d = Math.max(0.3, z - CAM_Z);
  return { x: 640 + (FOCAL * x) / d, y: HORIZON - (FOCAL * (y - CAM_Y)) / d, s: FOCAL / d, d };
};

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
    let ball: Vec | null = null;
    let vel: Vec = [0, 0, 0];
    let inX = 0;
    const go = (s: typeof state) => {
      state = s;
      stateT = 0;
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
      },
      timeout: () => (state === 'in' ? 'success' : 'failure'),
      draw(t) {
        const c = g();
        const gym = assets.image('gymnase');
        if (gym) {
          c.fillStyle = '#d9a066';
          c.fillRect(0, 0, 1280, 720);
          c.drawImage(gym, 0, -40, 1280, 793);
        } else {
          c.fillStyle = '#2a3570';
          c.fillRect(0, 0, 1280, project(0, 0, HOOP_Z + 3).y);
          c.fillStyle = '#d9a066';
          c.fillRect(0, project(0, 0, HOOP_Z + 3).y, 1280, 720);
        }
        // The line the ball follows.
        const a = project(0, 0, 0.8);
        const b = project(0, 0, HOOP_Z + 1.2);
        c.strokeStyle = 'rgba(255,224,74,.9)';
        c.lineWidth = 4;
        c.setLineDash([14, 12]);
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
        c.setLineDash([]);
        const drawBall = (p: Vec, spin: number) => {
          const q = project(...p);
          const gq = project(p[0], 0, p[2]);
          const r = Math.max(6, BALL_R * q.s);
          ellipse(gq.x, gq.y, r, r * 0.3, 'rgba(0,0,0,.25)', 0);
          if (item('basket', q.x, q.y, r * 2.25, spin)) return;
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
          c.restore();
        };
        // Hoop (frozen where the ball went in); the ball goes behind it when it scores.
        const hx = state === 'in' ? inX : hoopX(clock);
        const rim = project(hx, RIM_H, HOOP_Z);
        const rr = 0.42 * rim.s;
        if (state === 'in' && ball) drawBall(ball, 0);
        const hoop = assets.image('panier');
        if (hoop) {
          const k = (2 * rr) / 175;
          c.drawImage(hoop, rim.x - 221.5 * k, rim.y - 240 * k, 444 * k, 887 * k);
        } else {
          c.strokeStyle = '#ff5a1f';
          c.lineWidth = Math.max(4, rr * 0.2);
          c.beginPath();
          c.ellipse(rim.x, rim.y, rr, rr * 0.3, 0, 0, Math.PI * 2);
          c.stroke();
        }
        // You, in the foreground, with the ball in hand until the throw.
        const dq = project(-1.25, 0, 0.5);
        ellipse(dq.x, dq.y, 0.5 * dq.s, 0.12 * dq.s, 'rgba(0,0,0,.25)', 0);
        me.draw(dq.x, dq.y, 1.55 * dq.s, { shadow: false });
        if (state === 'aim' || state === 'wind') drawBall(state === 'wind' && stateT < RELEASE_MS ? [-1.45, 2.0, 0.5] : [-0.85, 1.3, 0.5], 0);
        else if (state !== 'in' && ball) drawBall(ball, t * 0.02);
        if (state === 'aim') outlineText(hoopX(clock + 300) > hoopX(clock) ? '▶' : '◀', rim.x, rim.y - rr * 2.4, 30, '#fff', 'center', 5);
        if (state === 'in') slam('PANIER !', stateT, '#ffe04a', 640, 260, 110, 600);
        if (state === 'miss') outlineText('RATÉ LE CERCLE', 640, 260, 44, '#fff');
      },
    };
  },
});
