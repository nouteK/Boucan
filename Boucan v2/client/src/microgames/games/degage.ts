import { outlineText, shadow } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { recreBg } from '../backdrops';
import { GY, hero } from '../common';
import { bomb, boom } from '../props';

/** DÉGAGE LA BOMBE ! — punch the walking bomb right when it is at fist range. */
export default defineMicrogame({
  id: 'degage',
  verb: 'DÉGAGE LA BOMBE !',
  create(ctx) {
    const me = hero(ctx);
    const X = 380;
    const fist = X + 150;
    let bx = 1380;
    const arrive = ctx.duration * ctx.rng.range(ctx.level === 1 ? 0.5 : 0.38, 0.7);
    const v0 = (1380 - fist) / arrive;
    let state: 'walk' | 'fly' | 'boom' = 'walk';
    let punchT = -1;
    let cooldown = 0;
    let fx = 0;
    let fy = 0;
    let vy = 0;
    let spin = 0;
    let boomT = 0;
    return {
      input(e) {
        if (e.type !== 'down' || state !== 'walk' || cooldown > 0) return;
        punchT = 0;
        cooldown = 380;
        me.force('punch');
        ctx.sfx('whoosh');
      },
      update(dt, t) {
        me.update(dt);
        cooldown = Math.max(0, cooldown - dt);
        if (punchT >= 0) punchT += dt;
        if (state === 'walk') {
          // Level 3: the bomb hesitates, then dashes.
          const speed = ctx.level >= 3 ? v0 * (1 + 0.6 * Math.sin(t / 240)) : v0;
          bx -= speed * dt;
          const hitting = punchT >= 50 && punchT <= 200;
          if (hitting && bx - fist > -60 && bx - fist < 90) {
            state = 'fly';
            fx = bx;
            fy = GY;
            vy = -1.1;
            ctx.sfx('pop');
            ctx.shake(140);
            ctx.win();
          } else if (bx < X + 70) {
            state = 'boom';
            me.force('hurt');
            ctx.sfx('boom');
            ctx.shake(300);
            ctx.lose();
          }
        } else if (state === 'fly') {
          fx += 2.2 * dt;
          vy += 0.0022 * dt;
          fy += vy * dt;
          spin += dt * 0.03;
        } else boomT += dt;
      },
      timeout: () => (state === 'fly' ? 'success' : 'failure'),
      draw(t) {
        recreBg(t, GY);
        if (state === 'walk') {
          const d = bx - fist;
          shadow(bx, GY, 60);
          bomb(bx, GY, 210, d > 480 ? 0 : d > 200 ? 1 : 2, true, Math.sin(t / 60) * 0.14);
        }
        me.draw(X, GY);
        if (state === 'fly') {
          bomb(fx, fy, 180, 2, true, spin);
          outlineText('POW !', fist + 60, GY - 300, 72, '#ffe04a');
        }
        if (state === 'boom' && boomT < 600) boom(X + 60, GY - 170, 460 * (0.65 + Math.min(1, boomT / 120) * 0.35));
      },
    };
  },
});
