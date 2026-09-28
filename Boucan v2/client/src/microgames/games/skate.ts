import { drawSprite } from '../../engine/assets';
import { box, circle, ellipse, g, INK, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { byLevel, hero } from '../common';
import { gauge } from '../props';
import { drawRoad, enterRoad, roadAngle, roadPoint } from '../road';

/**
 * RESTE SUR LA RAMPE ! — skating down the road while the wind keeps pushing you
 * sideways: lean the other way (hold a side of the screen, or ← →) to stay
 * on it until the end. Off the edge = gamelle. (Drawn in road space, see road.ts.)
 */
/** Distance of the skater along the road (constant: the road scrolls). */
const RIDER_D = 40;
/** calm = time for the push to build up (the instruction is still on screen). */
const P = { drift: 1.8e-6, grow: 3000, calm: 1200, unstable: 1.4e-6, lean: 4e-6, damp: 420, speed: 0.62 };

export default defineMicrogame({
  id: 'skate',
  verb: 'RESTE SUR LA RAMPE !',
  create(ctx) {
    const me = hero(ctx, 'duck');
    const strength = byLevel(ctx, 0.75, 0.9, 1.05);
    // The same pushes for everyone, drawn in advance: [time, direction] and [time, kick].
    const flips: [number, number][] = [];
    let side = ctx.rng.chance(0.5) ? -1 : 1;
    for (let t = ctx.rng.range(600, 1300); t < ctx.duration + 2000; t += ctx.rng.range(600, 1400)) {
      if (ctx.rng.chance(0.7)) side = -side;
      flips.push([t, side]);
    }
    const bumps: [number, number][] = [];
    for (let t = ctx.rng.range(900, 1600); t < ctx.duration + 2000; t += ctx.rng.range(700, 1500)) {
      bumps.push([t, (ctx.rng.chance(0.5) ? -1 : 1) * ctx.rng.range(0.0005, 0.0009) * strength]);
    }
    let push = ctx.rng.chance(0.5) ? -1 : 1;
    let u = ctx.rng.range(-0.15, 0.15);
    let w = 0;
    let dir = 0;
    let clock = 0;
    let nextFlip = 0;
    let nextBump = 0;
    let gustT = 0;
    let fell: { t: number; x: number; y: number; vx: number; vy: number; r: number } | null = null;
    return {
      input(e) {
        if (fell) return;
        if (e.type === 'down' && e.x !== null) {
          dir = e.x < 640 ? -1 : 1;
          w += dir * 0.0006;
          ctx.sfx('tap');
        } else if (e.type === 'up') dir = 0;
        else if (e.type === 'key' && (e.key === 'left' || e.key === 'right')) dir = e.key === 'left' ? -1 : 1;
        else if (e.type === 'keyup' && (e.key === 'left' || e.key === 'right') && dir === (e.key === 'left' ? -1 : 1)) dir = 0;
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        if (fell) {
          fell.t += dt;
          fell.x += fell.vx * dt;
          fell.vy += 0.003 * dt;
          fell.y += fell.vy * dt;
          fell.r += dt * 0.012 * Math.sign(fell.vx);
          return;
        }
        while (flips[nextFlip] && flips[nextFlip]![0] <= t) push = flips[nextFlip++]![1];
        while (bumps[nextBump] && bumps[nextBump]![0] <= t) {
          w += bumps[nextBump++]![1];
          gustT = 300;
        }
        gustT -= dt;
        const grow = Math.min(1, t / P.calm) * (1 + t / P.grow);
        w += (push * P.drift * strength * grow + u * P.unstable + dir * P.lean) * dt;
        w *= Math.exp(-dt / P.damp);
        u += w * dt;
        if (Math.abs(u) > 1 && !ctx.outcome) {
          const q = roadPoint(RIDER_D, u);
          fell = { t: 0, x: q.x, y: q.y, vx: Math.sign(u) * 0.45, vy: -0.6, r: 0 };
          me.force('hurt');
          ctx.sfx('hurt');
          ctx.shake(260);
          ctx.lose();
        }
      },
      timeout: () => (fell ? 'failure' : 'success'),
      draw() {
        const c = g();
        drawRoad(clock * P.speed);
        c.save();
        enterRoad();
        const board = (x: number, y: number, r: number) => {
          if (drawSprite('skate', 'skateboard', 0, x, y, 38, false, r)) return;
          box(x - 95, y - 14, 190, 18, '#ff4f7b', 5, 9);
          circle(x - 60, y + 10, 9, INK, 0);
          circle(x + 60, y + 10, 9, INK, 0);
        };
        if (fell) {
          board(fell.x + fell.vx * 80, fell.y + 40, fell.r * 1.5);
          me.draw(fell.x, fell.y, 238, { rot: fell.r, shadow: false });
        } else {
          const q = roadPoint(RIDER_D, u);
          const ang = roadAngle(q) * 0.35;
          const lean = Math.max(-0.5, Math.min(0.5, w * 260));
          ellipse(q.x, q.y + 4, 95 * q.p, 16 * q.p, 'rgba(0,0,0,.28)', 0, ang);
          c.save();
          c.translate(q.x, q.y - 16);
          c.rotate(ang);
          board(0, 0, 0);
          me.draw(0, -18, 244, { rot: lean, shadow: false });
          c.restore();
          if (Math.abs(u) > 0.7) {
            c.save();
            c.globalAlpha = 0.5 + 0.5 * Math.sin(clock / 60);
            outlineText('!', q.x, q.y - 250, 70, '#ff5a4a');
            c.restore();
          }
          if (gustT > 0) outlineText(w > 0 ? '→' : '←', q.x + (w > 0 ? 150 : -150), q.y - 160, 64, '#fff');
        }
        c.restore();
        if (fell) outlineText('GAMELLE !', 640, 250, 64, '#fff');
        // Where you are on the ramp.
        outlineText('POSITION', 640, 96, 22, '#fff');
        gauge(490, 118, 300, 14, 1, '#2fd07a');
        box(476, 114, 22, 22, '#ff5a4a', 4, 4);
        box(782, 114, 22, 22, '#ff5a4a', 4, 4);
        circle(640 + Math.max(-1.1, Math.min(1.1, u)) * 150, 125, 15, '#fff', 4);
      },
    };
  },
});
