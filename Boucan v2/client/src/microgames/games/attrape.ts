import { bone, clamp, ellipse } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { GY, hero } from '../common';

/**
 * ATTRAPE ! — a bone falls from the sky: get under it (touch the spot, drag,
 * or hold ← →). From level 2 the wind makes it sway.
 */
export default defineMicrogame({
  id: 'attrape',
  verb: 'ATTRAPE !',
  create(ctx) {
    const me = hero(ctx);
    let x = 640;
    let tx = 640;
    let face = 1;
    let keyDir = 0;
    let bx = ctx.rng.range(220, 1060);
    if (Math.abs(bx - 640) < 180) bx += bx < 640 ? -260 : 260;
    const baseX = bx;
    const fall = ctx.duration * (ctx.level === 1 ? 0.6 : ctx.level === 2 ? 0.56 : 0.5);
    const wind = ctx.level >= 2 ? ctx.rng.range(90, 170) * (ctx.rng.chance(0.5) ? 1 : -1) : 0;
    let by = -60;
    let rot = 0;
    let caught = false;
    return {
      input(e) {
        if (caught || ctx.outcome) return;
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
        if (caught) return;
        if (keyDir) tx = clamp(x + keyDir * 220, 120, 1160);
        const d = tx - x;
        if (Math.abs(d) > 8) {
          x += Math.sign(d) * Math.min(Math.abs(d), 0.95 * dt);
          face = Math.sign(d);
          if (me.pose === 'idle' || me.pose === 'stop') me.set('run');
        } else if (me.pose === 'run') me.set('stop');
        const p = Math.min(1, t / fall);
        by = -60 + (GY - 40 + 60) * p;
        bx = clamp(baseX + Math.sin(p * Math.PI * 1.5) * wind, 90, 1190);
        rot += dt * 0.004;
        if (!ctx.outcome && by > GY - 330 && by < GY - 120 && Math.abs(bx - x) < 115) {
          caught = true;
          me.force('catch');
          ctx.sfx('pop');
          ctx.win();
        }
        if (!ctx.outcome && by >= GY - 25) ctx.lose();
      },
      draw() {
        sceneBg('prairie', GY, 0, false, 'attrape');
        if (!caught) ellipse(bx, GY, 50, 10, 'rgba(0,0,0,.2)', 0);
        me.draw(x, GY, undefined, { flip: face < 0 });
        if (caught) bone(x + (face < 0 ? -40 : 40), GY - 190, 1.05, 0.2);
        else bone(bx, by, 1.1, rot);
      },
    };
  },
});
