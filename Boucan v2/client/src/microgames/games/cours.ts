import { clamp, drawPuffs, type Puff } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero, isPress } from '../common';
import { flag } from '../props';

/**
 * COURS ! — mash to sprint to the flag before the fuse burns out. The faster
 * the game (tempo), the less each tap gives and the sooner you slow down.
 */
export default defineMicrogame({
  id: 'cours',
  verb: 'COURS !',
  create(ctx) {
    const me = hero(ctx);
    const finish = byLevel(ctx, 980, 1000, 1030);
    const k = clamp((ctx.tempo - 1) / 0.8, 0, 1);
    const gain = 0.165 - 0.045 * k;
    const drag = 2 + 0.6 * k;
    let x = 170;
    let v = 0;
    let puffT = 0;
    let puffs: Puff[] = [];
    return {
      input(e) {
        if (!isPress(e) || ctx.outcome) return;
        v = Math.min(0.95, v + gain);
        ctx.sfx('tap');
        if (me.pose === 'idle' || me.pose === 'stop') me.set('start');
      },
      update(dt) {
        v *= Math.exp((-dt / 1000) * drag);
        x += v * dt;
        if ((me.pose === 'run' || me.pose === 'start') && v < 0.09) me.set('stop');
        me.update(dt * (me.pose === 'run' ? clamp(v / 0.5, 0.8, 1.6) : 1));
        if (me.pose === 'start' && me.t > 220) me.set('run');
        if (me.pose === 'run' && (puffT -= dt) <= 0) {
          puffT = 120;
          puffs.push({ x: x - 100, y: GY, t: 0 });
        }
        if (x >= finish && !ctx.outcome) {
          ctx.win();
          me.force('win');
        }
      },
      draw(_t, dt) {
        sceneBg('desert', GY, 0, false, 'cours');
        flag(finish + 60, GY);
        puffs = drawPuffs(puffs, dt);
        me.draw(x, GY);
      },
    };
  },
});
