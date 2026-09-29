import { assets } from '../../engine/assets';
import { box, circle, clamp, ellipse, g, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero } from '../common';
import { gauge } from '../props';

/**
 * TIENS LES ASSIETTES ! — a tall stack of plates wobbles in your arms: lean
 * the other way (hold a side of the screen, or ← →) to keep it standing
 * until the end.
 */
const PLATES = 9;
const MAX_TILT = 0.7;
const P = { drift: 1.6e-6, grow: 3200, unstable: 1.4e-6, lean: 4.2e-6, damp: 420 };

export default defineMicrogame({
  id: 'assiettes',
  verb: 'TIENS LES ASSIETTES !',
  create(ctx) {
    const me = hero(ctx, 'carry');
    const strength = byLevel(ctx, 0.85, 1, 1.15);
    // The same pushes for everyone: when the drift changes side.
    const flips: [number, number][] = [];
    let side = ctx.rng.chance(0.5) ? -1 : 1;
    for (let t = ctx.rng.range(500, 1100); t < ctx.duration + 2000; t += ctx.rng.range(500, 1200)) {
      if (ctx.rng.chance(0.7)) side = -side;
      flips.push([t, side]);
    }
    let push = ctx.rng.chance(0.5) ? -1 : 1;
    let next = 0;
    let tilt = ctx.rng.range(-0.05, 0.05);
    let w = 0;
    let dir = 0;
    let x = 640;
    let fell: { t: number } | null = null;
    return {
      input(e) {
        if (fell) return;
        if (e.type === 'down' && e.x !== null) dir = e.x < 640 ? -1 : 1;
        else if (e.type === 'move' && e.pressed) dir = e.x < 640 ? -1 : 1;
        else if (e.type === 'up') dir = 0;
        else if (e.type === 'key' && (e.key === 'left' || e.key === 'right')) dir = e.key === 'left' ? -1 : 1;
        else if (e.type === 'keyup' && (e.key === 'left' || e.key === 'right') && dir === (e.key === 'left' ? -1 : 1)) dir = 0;
      },
      update(dt, t) {
        me.update(dt);
        if (fell) {
          fell.t += dt;
          return;
        }
        while (flips[next] && flips[next]![0] <= t) push = flips[next++]![1];
        w += (push * P.drift * strength * (1 + t / P.grow) + tilt * P.unstable + dir * P.lean) * dt;
        w *= Math.exp(-dt / P.damp);
        tilt += w * dt;
        x = clamp(x + dir * 0.25 * dt, 300, 980);
        if (Math.abs(tilt) > MAX_TILT && !ctx.outcome) {
          fell = { t: 0 };
          me.force('hurt');
          ctx.sfx('boom');
          ctx.shake(260);
          ctx.lose();
        }
      },
      timeout: () => (fell ? 'failure' : 'success'),
      draw() {
        sceneBg('desert', GY, 0, false, 'assiettes');
        const c = g();
        me.draw(x, GY);
        const hx = x + 40;
        const hy = GY - 186;
        const plate = (i: number) => assets.image(i % 2 ? 'plate2' : 'plate1');
        for (let i = 0; i < PLATES; i++) {
          let px: number;
          let py: number;
          let rot: number;
          if (!fell) {
            rot = tilt * (i / PLATES) * 1.6;
            px = hx + Math.sin(tilt) * i * 28 * (i / PLATES) * 1.4;
            py = hy - i * 24;
          } else {
            const k = Math.min(1, fell.t / 500);
            rot = i + k * 4;
            px = hx + Math.sign(tilt) * (60 + i * 50) * k;
            py = hy - i * 24 + k * k * (GY - hy + i * 24 - 20);
          }
          const img = plate(i);
          c.save();
          c.translate(px, py);
          c.rotate(rot);
          if (img) c.drawImage(img, -95, -24, 190, 48);
          else ellipse(0, 0, 90, 14, '#fff', 5);
          c.restore();
        }
        if (fell) outlineText('CRASH !', 640, 270, 70, '#fff');
        // Balance gauge.
        outlineText('ÉQUILIBRE', 640, 96, 22, '#fff');
        gauge(490, 118, 300, 14, 1, '#2fd07a');
        box(476, 114, 22, 22, '#ff5a4a', 4, 4);
        box(782, 114, 22, 22, '#ff5a4a', 4, 4);
        circle(640 + clamp(tilt / MAX_TILT, -1.1, 1.1) * 150, 125, 15, '#fff', 4);
      },
    };
  },
});
