import { box, drawPuffs, outlineText, type Puff } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { recreBg } from '../backdrops';
import { byLevel, GY, hero } from '../common';

/** STOP AU BORD ! — you are running: tap to brake and stop inside the yellow zone, not in the pond. */
export default defineMicrogame({
  id: 'stop',
  verb: 'STOP AU BORD !',
  create(ctx) {
    const me = hero(ctx, 'run');
    const edge = 1045;
    const zone = byLevel(ctx, 180, 140, 110);
    const z0 = edge - zone - 10;
    let x = 110;
    let v = byLevel(ctx, 0.36, 0.41, 0.46) * ctx.rng.range(0.95, 1.05);
    let stopping = false;
    let fall = 0;
    let puffT = 0;
    let puffs: Puff[] = [];
    return {
      input(e) {
        if (e.type !== 'down' || stopping || fall) return;
        stopping = true;
        me.set('stop');
        ctx.sfx('tap');
      },
      update(dt) {
        me.update(dt);
        if (fall) {
          fall += dt * 0.9;
          x += v * dt * 0.5;
          return;
        }
        if (stopping) {
          v = Math.max(0, v - 0.0026 * dt);
          x += v * dt;
          if ((puffT -= dt) <= 0 && v > 0.05) {
            puffT = 60;
            puffs.push({ x: x + 40, y: GY, t: 0 });
          }
          if (v === 0 && !ctx.outcome) {
            if (x >= z0) {
              me.force('win');
              ctx.win();
            } else {
              me.force('lose');
              ctx.lose();
            }
          }
        } else {
          x += v * dt;
          if ((puffT -= dt) <= 0) {
            puffT = 120;
            puffs.push({ x: x - 90, y: GY, t: 0 });
          }
        }
        if (x > edge && !fall) {
          fall = 1;
          me.force('hurt');
          ctx.sfx('whoosh');
          ctx.lose();
        }
      },
      draw(t, dt) {
        recreBg(t, GY);
        box(edge, GY, 400, 200, '#2f8fd0', 0);
        for (let i = 0; i < 4; i++) box(edge + 30 + i * 60 + Math.sin(t / 300 + i) * 10, GY + 40 + (i % 2) * 40, 40, 8, '#bfe8ff', 0);
        box(z0, GY - 6, edge - z0, 12, '#ffe04a', 4);
        outlineText('ICI', (z0 + edge) / 2, GY + 50, 40, '#ffe04a');
        puffs = drawPuffs(puffs, dt);
        me.draw(x, GY + fall, undefined, { shadow: !fall, rot: fall ? Math.min(1.2, fall / 200) : 0 });
        if (fall > 30) outlineText('PLOUF !', edge + 80, GY - 300, 64, '#8fd3ff');
      },
    };
  },
});
