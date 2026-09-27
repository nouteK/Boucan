import { bone, clamp, g } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { recreBg } from '../backdrops';
import { GY, hero } from '../common';

/** ATTRAPE ! — a bone falls from the sky: move under it (touch the spot, drag, or ← →). */
export default defineMicrogame({
  id: 'attrape',
  verb: 'ATTRAPE !',
  create(ctx) {
    const me = hero(ctx);
    let x = 640;
    let tx = 640;
    let face = 1;
    let bx = ctx.rng.range(200, 1080);
    if (Math.abs(bx - 640) < 220) bx += bx < 640 ? -300 : 300;
    const baseX = bx;
    const fall = ctx.duration * (ctx.level === 1 ? 0.8 : ctx.level === 2 ? 0.66 : 0.58);
    const wind = ctx.level >= 2 ? ctx.rng.range(90, 170) * (ctx.rng.chance(0.5) ? 1 : -1) : 0;
    let by = -60;
    let rot = 0;
    let caught = false;
    const target = (px: number) => (tx = clamp(px, 110, 1170));
    return {
      input(e) {
        if (caught || ctx.outcome) return;
        if ((e.type === 'down' || (e.type === 'move' && e.pressed)) && e.x !== null) target(e.x);
        if (e.type === 'key' && e.key === 'left') target(x - 260);
        if (e.type === 'key' && e.key === 'right') target(x + 260);
      },
      update(dt, t) {
        me.update(dt);
        if (caught) return;
        const d = tx - x;
        if (Math.abs(d) > 8) {
          x += Math.sign(d) * Math.min(Math.abs(d), 1.05 * dt);
          face = Math.sign(d);
          if (me.pose === 'idle' || me.pose === 'stop') me.set('run');
        } else if (me.pose === 'run') me.set('stop');
        const p = Math.min(1, t / fall);
        by = -60 + (GY - 20) * p;
        bx = clamp(baseX + Math.sin(p * Math.PI * 1.5) * wind, 90, 1190);
        rot += dt * 0.005;
        if (!ctx.outcome && by > GY - 330 && by < GY - 110 && Math.abs(bx - x) < 115) {
          caught = true;
          me.force('catch');
          ctx.sfx('pop');
          ctx.win();
        }
        if (!ctx.outcome && by >= GY - 25) ctx.lose();
      },
      draw(t) {
        recreBg(t, GY);
        if (!caught) {
          const c = g();
          c.fillStyle = 'rgba(0,0,0,.18)';
          c.beginPath();
          c.ellipse(bx, GY, 50, 10, 0, 0, Math.PI * 2);
          c.fill();
        }
        me.draw(x, GY, undefined, { flip: face < 0 });
        if (caught) bone(x + (face < 0 ? -40 : 40), GY - 200, 1.05, 0.2);
        else bone(bx, by, 1.1, rot);
      },
    };
  },
});
