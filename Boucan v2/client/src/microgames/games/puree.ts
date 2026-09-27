import { clamp, g, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { cantineBg } from '../backdrops';
import { GY, hero } from '../common';
import { pureeBall, splat } from '../props';

/** ÉVITE LA PURÉE ! — dollops of mash rain on you: move away from the shadows (touch/drag, or ← →). */
export default defineMicrogame({
  id: 'puree',
  verb: 'ÉVITE LA PURÉE !',
  create(ctx) {
    const me = hero(ctx);
    const n = ctx.level === 1 ? 3 : ctx.level === 2 ? 4 : 5;
    const fallMs = ctx.level === 1 ? 900 : 780;
    const pots = Array.from({ length: n }, (_, i) => ({
      t0: ctx.duration * (0.08 + (i * 0.62) / n),
      off: ctx.rng.range(-40, 40),
      side: ctx.rng.chance(0.5) ? -1 : 1,
      x: 0,
      t: 0,
      state: 'wait' as 'wait' | 'fall' | 'done',
    }));
    let x = 640;
    let tx = 640;
    let face = 1;
    let hurt = false;
    const splats: number[] = [];
    const target = (px: number) => (tx = clamp(px, 110, 1170));
    return {
      input(e) {
        if (hurt) return;
        if ((e.type === 'down' || (e.type === 'move' && e.pressed)) && e.x !== null) target(e.x);
        if (e.type === 'key' && e.key === 'left') target(x - 300);
        if (e.type === 'key' && e.key === 'right') target(x + 300);
      },
      update(dt, t) {
        me.update(dt);
        if (!hurt) {
          const d = tx - x;
          if (Math.abs(d) > 8) {
            x += Math.sign(d) * Math.min(Math.abs(d), 1.05 * dt);
            face = Math.sign(d);
            if (me.pose === 'idle' || me.pose === 'stop') me.set('run');
          } else if (me.pose === 'run') me.set('stop');
        }
        for (const p of pots) {
          if (p.state === 'wait' && t >= p.t0) {
            p.state = 'fall';
            p.x = clamp(x + p.off, 130, 1150); // aimed at you
            p.t = 0;
          } else if (p.state === 'fall') {
            p.t += dt;
            if (p.t >= fallMs) {
              p.state = 'done';
              ctx.sfx('pop');
              if (!hurt && Math.abs(p.x - x) < 85) {
                hurt = true;
                me.force('hurt');
                ctx.shake(220);
                ctx.lose();
              } else splats.push(p.x);
            }
          }
        }
      },
      timeout: () => (hurt ? 'failure' : 'success'),
      draw(t) {
        cantineBg(t, GY);
        splats.forEach((sx) => splat(sx, GY - 2, 0.9));
        const c = g();
        for (const p of pots) {
          if (p.state !== 'fall') continue;
          const k = p.t / fallMs;
          c.fillStyle = `rgba(0,0,0,${0.15 + 0.3 * k})`;
          c.beginPath();
          c.ellipse(p.x, GY, 30 + 60 * k, 10, 0, 0, Math.PI * 2);
          c.fill();
        }
        me.draw(x, GY, undefined, { flip: face < 0 });
        if (hurt) {
          pureeBall(x + face * 10, GY - 300, 46);
          outlineText('SPLOTCH', x + 230, GY - 340, 56, '#fff');
        }
        for (const p of pots) {
          if (p.state !== 'fall') continue;
          const k = p.t / fallMs;
          pureeBall(p.x + p.side * (1 - k) * 260, -100 + (GY - 40 + 100) * k * k, 34, k * 8);
        }
      },
    };
  },
});
