import { box, g, INK, outlineText, star } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero, sideOf } from '../common';
import { keyCap, ringTimer } from '../props';

/**
 * SUIS LE COMBO ! — punching bag: hit left / right exactly as shown (screen
 * halves or ← →), each within its little time window. One slip and the bag
 * swings back into your face.
 */
const X = 470;
const PIVOT = { x: 680, y: GY - 420 };

export default defineMicrogame({
  id: 'combo',
  verb: 'SUIS LE COMBO !',
  create(ctx) {
    const me = hero(ctx, 'box');
    const len = byLevel(ctx, 4, 5, 6);
    const window = byLevel(ctx, 900, 800, 720);
    /** The first key also has to wait for the instruction to clear. */
    const limit = () => (i === 0 ? window + 700 : window);
    const seq = Array.from({ length: len }, () => (ctx.rng.chance(0.5) ? -1 : 1) as -1 | 1);
    let i = 0;
    let since = 0;
    let state: 'play' | 'done' | 'fail' = 'play';
    let bad = -1;
    let angle = 0;
    let spin = 0;
    let impactIn = -1;
    let hurt = false;
    let pows: { t: number; y: number }[] = [];
    const fail = (at: number) => {
      state = 'fail';
      bad = at;
      spin = -0.0045;
      ctx.sfx('hurt');
      ctx.lose();
    };
    return {
      input(e) {
        const side = sideOf(e);
        if (side === null || state !== 'play') return;
        if (side !== seq[i]) {
          fail(i);
          return;
        }
        me.force('box_punch');
        impactIn = 70;
        i += 1;
        since = 0;
        if (i >= len) {
          state = 'done';
          ctx.win();
        }
      },
      update(dt) {
        me.update(dt);
        since += dt;
        if (impactIn >= 0 && (impactIn -= dt) < 0) {
          spin += 0.004;
          pows.push({ t: 0, y: GY - 210 + (pows.length % 2) * 30 });
          ctx.sfx('hit');
        }
        // Damped spring on the bag.
        spin += -angle * 0.00005 * dt;
        spin *= Math.exp(-dt / 700);
        angle += spin * dt;
        pows = pows.filter((p) => (p.t += dt) < 220);
        if (state === 'play' && since > limit()) fail(i);
        if (state === 'fail' && angle < -0.12 && !hurt) {
          hurt = true;
          me.force('box_hurt');
          ctx.shake(200);
        }
        if (me.pose === 'box_punch' && me.t > 300) me.set(state === 'done' ? 'box_win' : 'box');
      },
      timeout: () => (state === 'done' ? 'success' : 'failure'),
      draw() {
        sceneBg('ville', GY);
        const c = g();
        c.save();
        c.translate(PIVOT.x, PIVOT.y);
        c.rotate(angle);
        c.strokeStyle = INK;
        c.lineWidth = 8;
        c.beginPath();
        c.moveTo(0, -PIVOT.y);
        c.lineTo(0, 28);
        c.stroke();
        box(-56, 28, 112, 272, '#d9362b', 8, 38);
        c.fillStyle = INK;
        c.fillRect(-56, 100, 112, 13);
        c.fillRect(-56, 218, 112, 13);
        c.restore();
        me.draw(X, GY);
        for (const p of pows) star(X + 170, p.y, p.t / 220);
        // The combo to follow, the current key growing with its time ring.
        seq.forEach((side, k) => {
          const x = 640 + (k - (len - 1) / 2) * 110;
          const current = k === i && state === 'play';
          const st = k < i ? 'ok' : state === 'fail' && k === bad ? 'bad' : current ? 'next' : null;
          keyCap(x, 120, side < 0 ? 'left' : 'right', current ? 1.1 : 0.8, st);
          if (current) ringTimer(x, 118, 64, 1 - since / limit());
        });
        if (state === 'done') outlineText('K.O. !', PIVOT.x + 60, GY - 470, 64, '#ffe04a');
      },
    };
  },
});
