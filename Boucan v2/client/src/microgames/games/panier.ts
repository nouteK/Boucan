import { box, circle, ellipse, g, INK, outlineText, slam } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { between, byLevel, GY, hero, isPress } from '../common';

/**
 * DANS LE PANIER ! — the hoop slides up and down: tap to shoot so that the
 * ball reaches the dashed line when the hoop crosses it (anticipate!).
 */
const X = 330;
const HOOP_X = 1070;
/** The ball always flies to this height: the hoop must be there on arrival. */
const TARGET_Y = GY - 355;
const AMPLITUDE = 155;
/** Wind-up before the ball leaves the hand, then flight time. */
const RELEASE_MS = 110;
const FLIGHT_MS = 650;

export default defineMicrogame({
  id: 'panier',
  verb: 'DANS LE PANIER !',
  create(ctx) {
    const me = hero(ctx);
    const phase = between(ctx, 0, Math.PI * 2);
    const speed = byLevel(ctx, between(ctx, 0.0017, 0.0021), between(ctx, 0.002, 0.0025), between(ctx, 0.0024, 0.0029));
    const tolerance = byLevel(ctx, 72, 64, 56);
    const hoopY = (t: number) => TARGET_Y + AMPLITUDE * Math.sin(phase + t * speed);
    const from = { x: X + 127, y: GY - 213 };
    let state: 'aim' | 'wind' | 'fly' | 'in' | 'miss' = 'aim';
    let clock = 0;
    let stateT = 0;
    let bx = 0;
    let by = 0;
    let spin = 0;
    let vx = 0;
    let vy = 0;
    let hoopIn = TARGET_Y;
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
          bx = from.x + (HOOP_X - from.x) * k;
          by = from.y + (TARGET_Y - from.y) * k - 260 * 4 * k * (1 - k);
          spin += dt * 0.02;
          if (k >= 1) {
            if (Math.abs(hoopY(t) - TARGET_Y) < tolerance) {
              hoopIn = hoopY(t);
              go('in');
              me.force('win');
              ctx.sfx('pop');
              ctx.shake(100);
              ctx.win();
            } else {
              go('miss');
              vx = -0.35;
              vy = -0.5;
              me.force('lose');
              ctx.sfx('hurt');
              ctx.lose();
            }
          }
        } else if (state === 'in') {
          bx = HOOP_X;
          by += dt * 0.5;
        } else if (state === 'miss') {
          vy += 0.003 * dt;
          bx += vx * dt;
          by = Math.min(GY - 30, by + vy * dt);
        }
      },
      timeout: () => (state === 'in' ? 'success' : 'failure'),
      draw() {
        sceneBg('futur', GY);
        const c = g();
        const hy = state === 'in' ? hoopIn : hoopY(clock);
        // Pole, backboard, net, rim.
        box(HOOP_X + 66, hy - 150, 14, GY - hy + 150, '#8e99a4', 5);
        box(HOOP_X + 30, hy - 150, 26, 140, '#fff', 7);
        c.strokeStyle = 'rgba(255,255,255,.9)';
        c.lineWidth = 3;
        for (let i = -3; i <= 3; i++) {
          c.beginPath();
          c.moveTo(HOOP_X + i * 14, hy);
          c.lineTo(HOOP_X + i * 8, hy + 64);
          c.stroke();
        }
        c.lineWidth = 12;
        c.strokeStyle = INK;
        c.beginPath();
        c.ellipse(HOOP_X, hy, 52, 14, 0, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = '#ff5a1f';
        c.lineWidth = 7;
        c.stroke();
        // The height the ball will reach.
        c.strokeStyle = 'rgba(255,255,255,.6)';
        c.setLineDash([12, 12]);
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(HOOP_X - 120, TARGET_Y);
        c.lineTo(HOOP_X + 60, TARGET_Y);
        c.stroke();
        c.setLineDash([]);
        me.draw(X, GY);
        const ball = (x: number, y: number, r: number) => {
          c.save();
          c.translate(x, y);
          c.rotate(r);
          circle(0, 0, 27, '#ff8a1f', 6);
          c.strokeStyle = INK;
          c.lineWidth = 4;
          c.beginPath();
          c.moveTo(-27, 0);
          c.lineTo(27, 0);
          c.moveTo(0, -27);
          c.lineTo(0, 27);
          c.stroke();
          c.restore();
        };
        if (state === 'aim') ball(X + 110, GY - 140, 0);
        else if (state === 'wind') ball(X - 36, GY - 275, 0);
        else {
          if (state === 'fly') ellipse(bx, GY, 26, 7, 'rgba(0,0,0,.2)', 0);
          ball(bx, by, spin);
        }
        if (state === 'in') slam('PANIER !', stateT, '#ffe04a', 760, GY - 450, 100);
        if (state === 'miss') outlineText('RATÉ !', HOOP_X - 120, GY - 500, 44, '#fff');
      },
    };
  },
});
