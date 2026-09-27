import { outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { recreBg } from '../backdrops';
import { GY, hero } from '../common';
import { bee, sign } from '../props';

/**
 * NE BOUGE PAS ! — a bee buzzes around you: don't touch anything until the end.
 * From level 2, a fake "TAPE !" sign tries to trick you.
 */
export default defineMicrogame({
  id: 'bouge',
  verb: 'NE BOUGE PAS !',
  create(ctx) {
    const me = hero(ctx);
    const X = 560;
    const traps = ctx.level >= 2 ? [ctx.duration * ctx.rng.range(0.25, 0.7)] : [];
    if (ctx.level >= 3) traps.push(ctx.duration * ctx.rng.range(0.1, 0.25));
    let stung = -1;
    let clock = 0;
    const phase = ctx.rng.range(0, 6);
    return {
      input(e) {
        if (e.type !== 'down' || stung >= 0) return;
        stung = 0;
        me.force('hurt');
        ctx.sfx('hurt');
        ctx.shake(220);
        ctx.lose();
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        if (stung >= 0) stung += dt;
      },
      timeout: () => (stung >= 0 ? 'failure' : 'success'),
      draw(t) {
        recreBg(t, GY, '#ffe7a8');
        me.draw(X, GY);
        const a = t / 260 + phase;
        const bx = stung >= 0 ? X + 20 : X + 30 + Math.cos(a) * 230 + Math.sin(a * 2.3) * 40;
        const by = stung >= 0 ? GY - 260 : GY - 230 + Math.sin(a * 1.7) * 130;
        bee(bx, by, t, Math.cos(a) > 0);
        for (const at of traps) {
          if (clock > at && clock < at + 700 && stung < 0) sign(960, 180 + Math.sin(clock / 40) * 6, 'TAPE !', '#ff5a4a', 60);
        }
        if (stung >= 0) outlineText('AÏE !', X + 250, GY - 330, 72, '#fff');
      },
    };
  },
});
