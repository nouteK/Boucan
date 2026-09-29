import { clamp, ellipse, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero } from '../common';
import { snowBall, snowSplat } from '../props';

/**
 * ÉVITE LA NEIGE ! — snowballs are lobbed at you: move away from
 * their shadow before they land (touch / drag, or hold ← →).
 */
export default defineMicrogame({
  id: 'puree',
  verb: 'ÉVITE LA NEIGE !',
  create(ctx) {
    const me = hero(ctx);
    const n = byLevel(ctx, 3, 4, 5);
    const fallMs = byLevel(ctx, 900, 840, 780);
    const balls = Array.from({ length: n }, (_, i) => ({
      at: ctx.duration * (0.1 + (i * 0.52) / (n - 1)),
      off: ctx.rng.range(-30, 30),
      side: ctx.rng.chance(0.5) ? -1 : 1,
      x: 0,
      t: 0,
      state: 'wait' as 'wait' | 'fall' | 'done',
    }));
    let x = 640;
    let tx = 640;
    let face = 1;
    let keyDir = 0;
    let hurt = false;
    const splats: number[] = [];
    return {
      input(e) {
        if (hurt) return;
        if ((e.type === 'down' || (e.type === 'move' && e.pressed)) && e.x !== null) {
          tx = clamp(e.x, 120, 1160);
          keyDir = 0;
        }
        if (e.type === 'key' && (e.key === 'left' || e.key === 'right')) keyDir = e.key === 'left' ? -1 : 1;
        if (e.type === 'keyup' && (e.key === 'left' || e.key === 'right') && keyDir === (e.key === 'left' ? -1 : 1)) {
          keyDir = 0;
          tx = x;
        }
      },
      update(dt, t) {
        me.update(dt);
        if (!hurt) {
          if (keyDir) tx = clamp(x + keyDir * 220, 120, 1160);
          const d = tx - x;
          if (Math.abs(d) > 8) {
            x += Math.sign(d) * Math.min(Math.abs(d), dt);
            face = Math.sign(d);
            if (me.pose === 'idle' || me.pose === 'stop') me.set('run');
          } else if (me.pose === 'run') me.set('stop');
        }
        for (const b of balls) {
          if (b.state === 'wait' && t >= b.at) {
            b.state = 'fall';
            b.x = clamp(x + b.off, 140, 1140); // aimed at you
            b.t = 0;
          } else if (b.state === 'fall' && (b.t += dt) >= fallMs) {
            b.state = 'done';
            ctx.sfx('splash');
            if (!hurt && Math.abs(b.x - x) < 85) {
              hurt = true;
              face = b.x < x ? -1 : 1;
              me.force('hurt');
              ctx.shake(220);
              ctx.lose();
            } else splats.push(b.x);
          }
        }
      },
      timeout: () => (hurt ? 'failure' : 'success'),
      draw() {
        sceneBg('prairie', GY, 0, false, 'puree');
        for (const sx of splats) snowSplat(sx, GY - 2, 0.9);
        for (const b of balls) {
          if (b.state !== 'fall') continue;
          const k = b.t / fallMs;
          ellipse(b.x, GY, 30 + 60 * k, 10, `rgba(0,0,0,${0.15 + 0.3 * k})`, 0);
        }
        me.draw(x, GY, undefined, { flip: face < 0 });
        if (hurt) {
          snowSplat(x + face * 10, GY - 290, 0.8);
          outlineText('PAF !', x + 230, GY - 330, 50, '#fff');
        }
        for (const b of balls) {
          if (b.state !== 'fall') continue;
          const k = b.t / fallMs;
          snowBall(b.x + b.side * (1 - k) * 260, -100 + (GY - 40 + 100) * k * k, 35, k * 8);
        }
      },
    };
  },
});
