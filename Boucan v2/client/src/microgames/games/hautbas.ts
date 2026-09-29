import { ellipse, g, item, outlineText, shadow } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero } from '../common';
import { bomb, boom } from '../props';

/**
 * SAUTE ET BAISSE-TOI ! — five bombs come at you: jump over the rolling ones,
 * duck under the flying ones. Right half of the screen / ↑ / Space = jump,
 * left half / ↓ = duck.
 */
const X = 330;
const JUMP_MS = 640;
const JUMP_H = 330;
const DUCK_MS = 560;
const COUNT = 5;

export default defineMicrogame({
  id: 'hautbas',
  verb: 'SAUTE ET BAISSE-TOI !',
  create(ctx) {
    const me = hero(ctx);
    const v = byLevel(ctx, 0.72, 0.78, 0.84);
    const [gapMin, gapMax] = byLevel(ctx, [620, 950], [600, 910], [580, 870]);
    let at = ctx.rng.range(1300, 1600);
    const bombs = Array.from({ length: COUNT }, () => {
      const b = { at, low: ctx.rng.chance(0.5), wob: ctx.rng.range(0, 6) };
      at += ctx.rng.range(gapMin, gapMax);
      return b;
    });
    let clock = 0;
    let jumpT = -1;
    let h = 0;
    let duck = 0;
    let hit: { i: number; t: number } | null = null;
    let passed = 0;
    let doneT = 0;
    const jump = () => {
      if (jumpT >= 0 || duck > 0) return;
      jumpT = 0;
      me.force('start');
      ctx.sfx('jump');
    };
    const crouch = () => {
      if (jumpT >= 0) return;
      duck = DUCK_MS;
      me.force('duck');
      ctx.sfx('whoosh');
    };
    const xOf = (i: number) => X + v * (bombs[i]!.at - clock);
    return {
      input(e) {
        if (hit || ctx.outcome === 'success') return;
        if (e.type === 'down') {
          if (e.x === null || e.x >= 640) jump();
          else crouch();
        } else if (e.type === 'key' && !e.repeat) {
          if (e.key === 'up') jump();
          else if (e.key === 'down') crouch();
        }
      },
      update(dt, t) {
        clock = t;
        if (hit) {
          hit.t += dt;
          me.update(dt);
          return;
        }
        if (jumpT >= 0) {
          jumpT += dt;
          const k = Math.min(1, jumpT / JUMP_MS);
          h = JUMP_H * 4 * k * (1 - k);
          if (k >= 1) {
            jumpT = -1;
            h = 0;
            me.force('stop');
          }
        } else me.update(dt);
        if (duck > 0 && (duck -= dt) <= 0) me.force('idle');
        if (passed < COUNT) {
          const x = xOf(passed);
          if (Math.abs(x - X) < 60) {
            const safe = bombs[passed]!.low ? h > 110 : duck > 0 && jumpT < 0;
            if (!safe) {
              hit = { i: passed, t: 0 };
              jumpT = -1;
              h = 0;
              me.force('hurt');
              ctx.sfx('boom');
              ctx.shake(260);
              ctx.lose();
              return;
            }
          }
          if (x < X - 70) {
            passed += 1;
            ctx.sfx('pop');
          }
        } else if ((doneT += dt) > 300 && !ctx.outcome) ctx.win();
      },
      timeout: () => (!hit && passed >= COUNT ? 'success' : 'failure'),
      draw(t) {
        sceneBg('desert', GY, 0, false, 'hautbas');
        const c = g();
        bombs.forEach((b, i) => {
          if (hit?.i === i) return;
          const x = xOf(i);
          if (x > 1400 || x < -150) return;
          const close = x - X < 300;
          if (b.low) {
            shadow(x, GY, 70);
            bomb(x, GY, 190, close ? 2 : 1, true, Math.sin(t / 70 + b.wob) * 0.14);
          } else {
            const y = GY - 215 + Math.sin(t / 120 + b.wob) * 10;
            ellipse(x, GY, 50, 10, 'rgba(0,0,0,.18)', 0);
            if (!item('fbomb', x, y - 10, 150, Math.sin(t / 90) * 0.12, true)) {
              for (const s of [-1, 1]) ellipse(x + s * 62, y - 40 + Math.sin(t / 50) * 14, 46, 18, '#fff', 5, s * 0.5);
              bomb(x, y + 40, 150, close ? 2 : 1, true, 0);
            }
          }
          if (i === passed && x - X < 700) outlineText(b.low ? '▲' : '▼', x, b.low ? GY - 230 : GY - 330, 44, b.low ? '#7dff9b' : '#ffd23c', 'center', 7);
        });
        shadow(X, GY, Math.max(40, 100 - h / 4));
        me.draw(X, GY - h, undefined, { shadow: false, rot: jumpT >= 0 ? -0.08 : 0 });
        if (hit) boom(X + 40, GY - 160, 400 * (0.6 + Math.min(1, hit.t / 150) * 0.4));
        bombs.forEach((b, i) => {
          c.globalAlpha = i < passed ? 1 : 0.45;
          outlineText(b.low ? '▲' : '▼', 640 + (i - (COUNT - 1) / 2) * 60, 140, 36, i < passed ? '#7dff9b' : '#fff', 'center', 6);
          c.globalAlpha = 1;
        });
        if (ctx.touch && !hit && t > 900) {
          c.globalAlpha = 0.85;
          outlineText('▼ BAISSE', 40, 560, 34, '#ffd23c', 'left', 6);
          outlineText('SAUTE ▲', 1240, 560, 34, '#7dff9b', 'right', 6);
          c.globalAlpha = 1;
        }
      },
    };
  },
});
