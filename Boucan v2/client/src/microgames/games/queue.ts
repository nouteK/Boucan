import { box, drawPuffs, outlineText, type Puff } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { cantineBg } from '../backdrops';
import { Actor, byLevel, GY, hero } from '../common';

/** FAIS LA QUEUE ! — you rush to the canteen line: tap to stop right behind the last kid (no bumping!). */
export default defineMicrogame({
  id: 'queue',
  verb: 'FAIS LA QUEUE !',
  create(ctx) {
    const me = hero(ctx, 'run');
    const kidsX = [990, 1110, 1230];
    const kids = kidsX.map((_, i) => new Actor({ characterId: ctx.players[(i + 1) % ctx.players.length]?.characterId ?? 'renard', color: '#888' }));
    const zone = byLevel(ctx, 110, 85, 65);
    const z1 = kidsX[0]! - 185;
    const z0 = z1 - zone;
    let x = 110;
    let v = byLevel(ctx, 0.37, 0.42, 0.47);
    let stopping = false;
    let bump = 0;
    let puffT = 0;
    let puffs: Puff[] = [];
    return {
      input(e) {
        if (e.type !== 'down' || stopping || bump) return;
        stopping = true;
        me.set('stop');
        ctx.sfx('tap');
      },
      update(dt) {
        me.update(dt);
        kids.forEach((k) => k.update(dt));
        if (bump) {
          bump += dt;
          kidsX[0] = Math.min(kidsX[0]! + dt * 0.3, 1060);
          return;
        }
        if (stopping) {
          v = Math.max(0, v - 0.0026 * dt);
          x += v * dt;
          if (v === 0 && !ctx.outcome) {
            if (x >= z0) {
              me.force('win');
              ctx.win();
            } else {
              ctx.lose();
              me.force('lose');
            }
          }
        } else {
          x += v * dt;
          if ((puffT -= dt) <= 0) {
            puffT = 120;
            puffs.push({ x: x - 90, y: GY, t: 0 });
          }
        }
        if (x > z1 + 15 && !bump) {
          bump = 1;
          v = 0;
          me.force('hurt');
          kids[0]!.force('hurt');
          ctx.sfx('hurt');
          ctx.shake(200);
          ctx.lose();
        }
      },
      draw(t, dt) {
        cantineBg(t, GY);
        box(1180, GY - 230, 140, 230, '#c9d3dc', 7);
        box(z0, GY - 6, z1 - z0 + 20, 12, '#ffe04a', 4);
        outlineText('ICI', (z0 + z1) / 2 + 10, GY + 50, 38, '#b8860b');
        [...kids].reverse().forEach((k, i) => k.draw(kidsX[kids.length - 1 - i]!, GY, 260, { flip: false }));
        puffs = drawPuffs(puffs, dt);
        me.draw(x, GY);
        if (bump) outlineText('HÉ !', kidsX[0]! + 40, GY - 320, 64, '#fff');
      },
    };
  },
});
