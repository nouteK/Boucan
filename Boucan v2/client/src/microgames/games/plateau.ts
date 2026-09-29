import { ellipse, g, item, outlineText, poly } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, fxRand, GY, hero, isPress } from '../common';
import { egg } from '../props';

/**
 * RATTRAPE LES ŒUFS ! — two eggs are thrown at you, one after the other: tap
 * to raise your arms just before each one lands (arms drop again quickly).
 */
const X = 520;
const HX = X + 80;
const HY = GY - 118;
const EGGS = 2;

export default defineMicrogame({
  id: 'plateau',
  verb: 'RATTRAPE LES ŒUFS !',
  create(ctx) {
    const me = hero(ctx);
    const hold = byLevel(ctx, 280, 240, 210);
    let state: 'wait' | 'fly' | 'got' | 'caught' | 'crash' = 'wait';
    let wait = ctx.rng.range(400, 1300);
    let flight = ctx.rng.range(620, 900);
    let t = 0;
    let got = 0;
    let gotT = 0;
    let raised = -1;
    let cooldown = 0;
    let px = 1340;
    let py = 200;
    let rot = 0;
    let bits: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    const armsUp = () => raised >= 0;
    return {
      input(e) {
        if (!isPress(e) || (state !== 'fly' && state !== 'wait') || cooldown > 0 || armsUp()) return;
        raised = 0;
        me.force('ready');
        ctx.sfx('select');
      },
      update(dt) {
        me.update(dt);
        cooldown = Math.max(0, cooldown - dt);
        if (armsUp() && (state === 'fly' || state === 'wait') && (raised += dt) > hold) {
          raised = -1;
          cooldown = 160;
          me.force('idle');
        }
        if (state === 'wait') {
          if ((wait -= dt) <= 0) {
            state = 'fly';
            t = 0;
            ctx.sfx('whoosh');
          }
        } else if (state === 'fly') {
          t += dt;
          const p = Math.min(1, t / flight);
          px = 1340 + (HX - 1340) * p;
          py = 200 + (HY - 10 - 200) * p - 280 * 4 * p * (1 - p);
          rot = Math.sin(p * 9) * 0.3 * (1 - p);
          if (p < 1) return;
          if (armsUp()) {
            got += 1;
            raised = -1;
            me.force('catch');
            ctx.sfx('pop');
            ctx.shake(90);
            if (got >= EGGS) {
              state = 'caught';
              ctx.win();
            } else {
              state = 'got';
              gotT = 0;
            }
          } else {
            state = 'crash';
            me.force('hurt');
            ctx.sfx('hurt');
            ctx.shake(240);
            ctx.lose();
            bits = [0, 1, 2].map(() => ({ x: px, y: py, vx: fxRand(-0.4, 0.5), vy: fxRand(-0.9, -0.4), r: 0 }));
          }
        } else if (state === 'got') {
          if ((gotT += dt) > 300) {
            me.force('idle');
            state = 'wait';
            wait = ctx.rng.range(250, 700);
            flight = ctx.rng.range(560, 820);
          }
        } else if (state === 'crash') {
          for (const b of bits) {
            b.vy += 0.003 * dt;
            b.x += b.vx * dt;
            b.y = Math.min(GY - 10, b.y + b.vy * dt);
            b.r += dt * 0.01;
          }
        }
      },
      timeout: () => (state === 'caught' ? 'success' : 'failure'),
      draw(time) {
        sceneBg('prairie', GY, 0, false, 'plateau');
        if (state === 'fly') {
          const k = Math.min(1, t / flight);
          ellipse(px, GY, 40 + 50 * k, 10, `rgba(0,0,0,${0.1 + 0.2 * k})`, 0);
        }
        me.draw(X, GY);
        const c = g();
        if (state === 'caught' || state === 'got') egg(HX + 4, HY + 10, 0.9);
        else if (state === 'fly') egg(px, py + 40, 0.9, rot * 2);
        else if (state === 'wait') outlineText('!', 1220, 150, Math.round(60 * (1 + 0.12 * Math.sin(time / 60))), '#fff', 'center', 7);
        else {
          // The broken egg picture, or a drawn yolk with flying shell bits.
          if (!item('egg-x', X + 150, GY - 50, 110)) {
            ellipse(X + 150, GY - 6, 70, 16, '#ffd23c', 6);
            ellipse(X + 150, GY - 10, 14, 14, '#ff9f1c', 0);
            for (const b of bits) {
              c.save();
              c.translate(b.x, b.y);
              c.rotate(b.r);
              poly([[-22, 0], [-10, -18], [0, -6], [12, -20], [22, 0]], '#fff3d6', 5);
              c.restore();
            }
          }
          outlineText('CRAC !', X + 200, GY - 330, 56, '#fff');
        }
        for (let i = 0; i < EGGS; i++) {
          c.globalAlpha = i < got ? 1 : 0.4;
          egg(640 + (i - 0.5) * 80, 150, 0.55);
          c.globalAlpha = 1;
        }
      },
    };
  },
});
