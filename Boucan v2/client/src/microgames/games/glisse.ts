import { box, drawPuffs, ellipse, g, outlineText, type Puff } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero } from '../common';

/**
 * GLISSE SOUS LES TRONCS ! — you run through the forest: tap to slide under
 * each log hanging across the path. A slide lasts less than a second.
 */
const LOG_BOTTOM = GY - 229;
const LOG_W = 200;
const SLIDE_MS = 880;
/** The slide animation needs this long before the body is really low. */
const LOW_AFTER = 70;
const START_X = 90;

export default defineMicrogame({
  id: 'glisse',
  verb: 'GLISSE SOUS LES TRONCS !',
  create(ctx) {
    const me = hero(ctx, 'run');
    const runSpeed = byLevel(ctx, 0.55, 0.6, 0.66);
    const logs = [900, 1680, 2460].map((x) => {
      const j = ctx.rng.range(-40, 40);
      return { x0: x + j, x1: x + j + LOG_W };
    });
    let x = START_X;
    let v = runSpeed;
    let state: 'run' | 'slide' | 'up' | 'bonk' = 'run';
    let slideT = 0;
    let upT = 0;
    let passed = 0;
    let okT = 0;
    let puffT = 0;
    let puffs: Puff[] = [];
    const cam = () => Math.max(0, x - 360);
    return {
      input(e) {
        const pressed = e.type === 'down' || (e.type === 'key' && !e.repeat && e.key === 'down');
        if (!pressed || state !== 'run' || ctx.outcome) return;
        state = 'slide';
        slideT = 0;
        v = runSpeed + 0.07;
        me.force('slide');
        ctx.sfx('whoosh');
      },
      update(dt) {
        me.update(dt);
        okT -= dt;
        if (state === 'bonk') return;
        if (state === 'slide') {
          slideT += dt;
          v = Math.max(0.3, v - 0.00012 * dt);
          if ((puffT -= dt) <= 0) {
            puffT = 60;
            puffs.push({ x: x - 60, y: GY, t: 0 });
          }
          if (slideT > SLIDE_MS) {
            state = 'up';
            upT = 0;
            v = 0.42;
            me.force('stop');
          }
        } else {
          if (state === 'up' && (upT += dt) > 160) {
            state = 'run';
            v = runSpeed;
            me.force('run');
          }
          if ((puffT -= dt) <= 0) {
            puffT = 120;
            puffs.push({ x: x - 100, y: GY, t: 0 });
          }
        }
        x += v * dt;
        const low = state === 'slide' && slideT >= LOW_AFTER;
        const hit = logs.find((l) => x + 60 > l.x0 && x < l.x1);
        if (hit && !low && !ctx.outcome) {
          state = 'bonk';
          v = 0;
          me.force('hurt');
          ctx.sfx('hit');
          ctx.shake(240);
          ctx.lose();
          return;
        }
        while (logs[passed] && x > logs[passed]!.x1) {
          passed += 1;
          okT = 420;
          ctx.sfx('jump');
        }
        if (passed >= logs.length && !ctx.outcome) {
          ctx.win();
        }
      },
      timeout: () => (passed >= logs.length && state !== 'bonk' ? 'success' : 'failure'),
      draw(_t, dt) {
        const c = g();
        const cx = cam();
        sceneBg('prairie', GY, cx * 0.35);
        c.save();
        c.translate(-cx, 0);
        for (const l of logs) for (const px of [l.x0 + 10, l.x1 - 10]) box(px - 32, LOG_BOTTOM + 20, 64, GY - LOG_BOTTOM - 20, '#6d6a86', 7, 20);
        puffs = drawPuffs(puffs, dt);
        me.draw(x, GY);
        for (const l of logs) {
          box(l.x0 - 20, LOG_BOTTOM - 70, l.x1 - l.x0 + 40, 70, '#8a5a2b', 7, 34);
          ellipse(l.x1 + 14, LOG_BOTTOM - 35, 20, 33, '#c98a4b', 7);
          c.strokeStyle = 'rgba(22,22,22,.5)';
          c.lineWidth = 4;
          for (let k = l.x0 + 20; k < l.x1; k += 70) {
            c.beginPath();
            c.moveTo(k, LOG_BOTTOM - 52);
            c.lineTo(k + 40, LOG_BOTTOM - 52);
            c.stroke();
          }
        }
        if (state === 'bonk') outlineText('BONK', x + 160, GY - 360, 56, '#fff');
        else if (okT > 0) outlineText(passed >= logs.length ? 'YES !' : 'OK !', x + 40, GY - 380, 56, '#7dff9b');
        c.restore();
        logs.forEach((_, i) => box(640 + (i - 1) * 90 - 34, 110, 68, 26, i < passed ? '#7dff9b' : 'rgba(255,255,255,.35)', 5, 13));
      },
    };
  },
});
