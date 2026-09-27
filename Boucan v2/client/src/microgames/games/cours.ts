import { drawPuffs, type Puff } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { recreBg } from '../backdrops';
import { byLevel, GY, hero, isPress } from '../common';
import { flag } from '../props';

/** COURS ! — mash to sprint to the flag before the fuse burns out. */
export default defineMicrogame({
  id: 'cours',
  verb: 'COURS !',
  create(ctx) {
    const me = hero(ctx);
    const finish = byLevel(ctx, 960, 1010, 1050);
    const gain = byLevel(ctx, 0.17, 0.155, 0.145);
    let x = 170;
    let v = 0;
    let puffT = 0;
    let puffs: Puff[] = [];
    const tap = () => {
      if (ctx.outcome) return;
      v = Math.min(0.95, v + gain);
      ctx.sfx('tap');
      if (me.pose === 'idle' || me.pose === 'stop') me.set('start');
    };
    return {
      input(e) {
        if (isPress(e)) tap();
      },
      update(dt) {
        v *= Math.exp((-dt / 1000) * 2.3);
        x += v * dt;
        if ((me.pose === 'run' || me.pose === 'start') && v < 0.08) me.set('stop');
        me.update(dt * (me.pose === 'run' ? Math.max(0.8, Math.min(1.7, v / 0.5)) : 1));
        if (me.pose === 'start' && me.t > 220) me.set('run');
        if (v > 0.15 && (puffT -= dt) <= 0) {
          puffT = 110;
          puffs.push({ x: x - 90, y: GY, t: 0 });
        }
        if (x >= finish && !ctx.outcome) {
          ctx.win();
          me.force('win');
        }
      },
      draw(t, dt) {
        recreBg(t, GY);
        flag(finish + 60, GY);
        puffs = drawPuffs(puffs, dt);
        me.draw(x, GY);
      },
    };
  },
});
