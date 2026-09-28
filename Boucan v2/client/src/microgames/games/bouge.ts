import { outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { GY, hero, isPress } from '../common';
import { bee, sign } from '../props';

/**
 * NE BOUGE PAS ! — a bee buzzes around you: don't touch anything until the end.
 * From level 2, a fake "TAPE !" sign tries to trick you.
 */
const X = 560;

export default defineMicrogame({
  id: 'bouge',
  verb: 'NE BOUGE PAS !',
  create(ctx) {
    const me = hero(ctx);
    const traps = ctx.level >= 2 ? [ctx.duration * ctx.rng.range(0.25, 0.7)] : [];
    if (ctx.level >= 3) traps.push(ctx.duration * ctx.rng.range(0.1, 0.25));
    const phase = ctx.rng.range(0, 6);
    let stung = -1;
    return {
      input(e) {
        if (!isPress(e) || stung >= 0) return;
        stung = 0;
        me.force('punch');
      },
      update(dt) {
        me.update(dt);
        if (stung < 0) return;
        const before = stung;
        stung += dt;
        // The bee stings a moment after you moved.
        if (before < 200 && stung >= 200) {
          me.force('hurt');
          ctx.sfx('hurt');
          ctx.shake(220);
          ctx.lose();
        }
      },
      timeout: () => (stung >= 0 ? 'failure' : 'success'),
      draw(t) {
        sceneBg('foret', GY);
        me.draw(X, GY);
        const stingy = stung >= 200;
        const a = t / 260 + phase;
        const bx = stingy ? X + 30 : X + 30 + Math.cos(a) * 210 + Math.sin(a * 2.3) * 40;
        const by = stingy ? GY - 250 : GY - 230 + Math.sin(a * 1.7) * 120;
        bee(bx, by, t, Math.cos(a) > 0);
        for (const at of traps) {
          if (t > at && t < at + 700 && stung < 0) sign(960, 180 + Math.sin(t / 40) * 6, 'TAPE !', '#ff5a4a', 60);
        }
        if (stingy) outlineText('AÏE !', X + 230, GY - 330, 60, '#fff');
      },
    };
  },
});
