import { outlineText, shadow } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { recreBg } from '../backdrops';
import { GY, hero } from '../common';
import { bomb, boom } from '../props';

/** SAUTE ! — a bomb rolls in: jump over it at the right moment (one tap). */
export default defineMicrogame({
  id: 'saute',
  verb: 'SAUTE !',
  create(ctx) {
    const me = hero(ctx);
    const X = 330;
    const count = ctx.level >= 3 ? 2 : 1;
    const bombs = Array.from({ length: count }, (_, i) => {
      const arrive = ctx.duration * (count === 1 ? ctx.rng.range(ctx.level === 1 ? 0.5 : 0.4, 0.68) : [0.36, 0.72][i]!);
      const start = 1400 + i * 40;
      return { x: start, v: (start - X) / arrive, passed: false };
    });
    let jumpT = -1;
    let h = 0;
    let hit = false;
    let boomT = -1;
    return {
      input(e) {
        if (e.type !== 'down' || jumpT >= 0 || hit) return;
        jumpT = 0;
        ctx.sfx('jump');
        me.force('start');
      },
      update(dt) {
        me.update(dt);
        if (boomT >= 0) boomT += dt;
        if (hit) return;
        for (const b of bombs) b.x -= b.v * dt;
        if (jumpT >= 0) {
          jumpT += dt;
          const p = Math.min(1, jumpT / 820);
          h = 380 * 4 * p * (1 - p);
          if (p >= 1) {
            jumpT = -1;
            h = 0;
            me.force('stop');
          }
        }
        for (const b of bombs) {
          if (!b.passed && Math.abs(b.x - X) < 70 && h < 130) {
            hit = true;
            boomT = 0;
            me.force('hurt');
            ctx.sfx('boom');
            ctx.shake(260);
            ctx.lose();
          }
          if (b.x < X - 130) b.passed = true;
        }
        if (!ctx.outcome && bombs.every((b) => b.passed)) ctx.win();
      },
      timeout: () => (hit ? 'failure' : 'success'),
      draw(t) {
        recreBg(t, GY);
        for (const b of bombs) {
          if (hit && boomT > 0 && Math.abs(b.x - X) < 90) continue;
          const d = b.x - X;
          shadow(b.x, GY, 60);
          bomb(b.x, GY, 200, d > 600 ? 0 : d > 280 ? 1 : 2, true, Math.sin(t / 60) * 0.14);
        }
        shadow(X, GY, Math.max(40, 100 - h / 4));
        me.draw(X, GY - h, undefined, { shadow: false, rot: jumpT >= 0 ? -0.08 : 0 });
        if (boomT >= 0 && boomT < 700) {
          boom(X + 30, GY - 170, 420 * (0.6 + Math.min(1, boomT / 150) * 0.4));
          outlineText('BOUM !', X + 260, GY - 360, 70, '#ffe04a');
        }
      },
    };
  },
});
