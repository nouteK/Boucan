import { outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { classeBg } from '../backdrops';
import { byLevel, GY, hero } from '../common';
import { desk, sign, teacher } from '../props';

/**
 * LÈVE LA MAIN ! — wait for "QUI SAIT ?" then raise your hand at once.
 * Too early, or on the trick question "QUI A FAIT ÇA ?", and you are out.
 */
export default defineMicrogame({
  id: 'main',
  verb: 'LÈVE LA MAIN !',
  create(ctx) {
    const me = hero(ctx);
    const realAt = ctx.duration * ctx.rng.range(0.35, 0.62);
    const fakeAt = ctx.level >= 2 ? realAt - ctx.rng.range(900, 1300) : -1;
    const window = byLevel(ctx, 750, 600, 480);
    let clock = 0;
    let raised = false;
    let verdict: 'ok' | 'early' | 'trap' | 'late' | null = null;
    const current = (t: number) => (t >= realAt && t < realAt + 1400 ? 'real' : fakeAt > 0 && t >= fakeAt && t < fakeAt + 700 ? 'fake' : null);
    return {
      input(e) {
        if (e.type !== 'down' || raised) return;
        raised = true;
        me.force('win');
        const c = current(clock);
        if (c === 'real') verdict = clock - realAt <= window ? 'ok' : 'late';
        else verdict = c === 'fake' ? 'trap' : 'early';
        if (verdict === 'ok') {
          ctx.sfx('pop');
          ctx.win();
        } else {
          ctx.sfx('hurt');
          ctx.lose();
        }
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        if (!raised && !ctx.outcome && t > realAt + window) {
          verdict = 'late';
          ctx.lose();
        }
      },
      draw(t) {
        classeBg(t, GY);
        const c = current(clock);
        teacher(900, GY - 40, 400, 'front', t, verdict && verdict !== 'ok' ? 'angry' : 'calm');
        if (c === 'real') sign(640, 200, 'QUI SAIT ? ✋', '#2fd07a', 58);
        if (c === 'fake') sign(640, 200, 'QUI A FAIT ÇA ?!', '#ff5a4a', 58);
        me.draw(380, GY + 40, 300);
        desk(380, GY - 70, 320);
        if (verdict === 'early') outlineText('PAS ENCORE !', 640, 340, 56, '#fff');
        if (verdict === 'trap') outlineText('C’ÉTAIT TOI ?!', 640, 340, 56, '#fff');
        if (verdict === 'late') outlineText('TROP TARD…', 640, 340, 56, '#fff');
      },
    };
  },
});
