import { drawPuffs, g, outlineText, shadow, type Puff } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero, isPress } from '../common';
import { bomb, boom } from '../props';

/** SAUTE PAR-DESSUS ! — three bombs roll in at their own speed: jump over each one (one tap per jump). */
const X = 330;
const JUMP_MS = 760;
const JUMP_H = 380;

export default defineMicrogame({
  id: 'saute',
  verb: 'SAUTE PAR-DESSUS !',
  create(ctx) {
    const me = hero(ctx);
    const [vMin, vMax] = byLevel(ctx, [0.6, 0.95], [0.68, 1], [0.76, 1.06]);
    let at = ctx.rng.range(1300, 1800);
    const bombs = [0, 1, 2].map((i) => {
      if (i) at += ctx.rng.range(880, 1500);
      return { at, v: ctx.rng.range(vMin, vMax), x: 9999, wob: ctx.rng.range(0, 6) };
    });
    let jumpT = -1;
    let h = 0;
    let hit = false;
    let boomT = -1;
    let passed = 0;
    let doneT = 0;
    let puffs: Puff[] = [];
    return {
      input(e) {
        if (!isPress(e) || jumpT >= 0 || hit) return;
        jumpT = 0;
        ctx.sfx('jump');
        me.force('start');
      },
      update(dt, t) {
        if (boomT >= 0) boomT += dt;
        if (!hit) for (const b of bombs) b.x = X + b.v * (b.at - t);
        if (jumpT >= 0) {
          jumpT += dt;
          const p = Math.min(1, jumpT / JUMP_MS);
          h = JUMP_H * 4 * p * (1 - p);
          if (p >= 1) {
            jumpT = -1;
            h = 0;
            me.force('stop');
            puffs.push({ x: X - 40, y: GY, t: 0 }, { x: X + 60, y: GY, t: 0 });
          }
        } else me.update(dt);
        if (hit) return;
        if (bombs.some((b) => Math.abs(b.x - X) < 70) && h < 140) {
          hit = true;
          jumpT = -1;
          h = 0;
          boomT = 0;
          me.force('hurt');
          ctx.sfx('boom');
          ctx.shake(260);
          ctx.lose();
          return;
        }
        while (bombs[passed] && bombs[passed]!.x < X - 90) {
          passed += 1;
          ctx.sfx('pop');
        }
        if (passed >= 3 && (doneT += dt) > 350 && !ctx.outcome) {
          ctx.win();
          me.force('win');
        }
      },
      timeout: () => (!hit && passed >= 3 ? 'success' : 'failure'),
      draw(t, dt) {
        sceneBg('tresor', GY, 0, false, 'saute');
        puffs = drawPuffs(puffs, dt);
        for (let i = 2; i >= 0; i--) {
          const b = bombs[i]!;
          if (b.x > 1400 || b.x < -150 || (hit && Math.abs(b.x - X) < 70)) continue;
          const d = b.x - X;
          shadow(b.x, GY, 70);
          bomb(b.x, GY, 200, d > 600 ? 0 : d > 300 ? 1 : 2, true, Math.sin(t / 70 + b.wob) * 0.12 + (b.v > 0.85 ? -0.12 : 0));
        }
        shadow(X, GY, Math.max(40, 100 - h / 4));
        me.draw(X, GY - h, undefined, { shadow: false, rot: jumpT >= 0 ? -0.08 : 0 });
        if (boomT >= 0 && boomT < 600) boom(X + 40, GY - 150, 400 * (0.6 + Math.min(1, boomT / 150) * 0.4));
        // Bombs to clear.
        const c = g();
        for (let i = 0; i < 3; i++) {
          const x = 640 + (i - 1) * 70;
          c.globalAlpha = i < passed ? 1 : 0.4;
          bomb(x, 130, 56, 0, false, 0);
          c.globalAlpha = 1;
          if (i < passed) outlineText('✔', x + 18, 128, 30, '#7dff9b', 'center', 5);
        }
      },
    };
  },
});
