import { box, g, INK, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero, sideOf } from '../common';
import { gauge, keyCap } from '../props';

/**
 * GONFLE LA BULLE ! — pump left, right, left, right… (screen halves or ← →).
 * The same side twice does nothing: only alternating inflates the bubble.
 */
const X = 420;

export default defineMicrogame({
  id: 'bulle',
  verb: 'GONFLE LA BULLE !',
  create(ctx) {
    const me = hero(ctx, 'carry');
    const need = byLevel(ctx, 16, 20, 24);
    let n = 0;
    let last: -1 | 1 | null = null;
    let tilt = 0;
    let done = false;
    let flyT = 0;
    return {
      input(e) {
        const side = sideOf(e);
        if (side === null || done) return;
        if (side === last) {
          ctx.sfx('block');
          return;
        }
        last = side;
        n += 1;
        tilt = side;
        ctx.sfx('tap');
        if (n >= need) {
          done = true;
          me.force('win');
          ctx.sfx('pop');
          ctx.win();
        }
      },
      update(dt) {
        me.update(dt);
        tilt *= Math.exp(-dt / 120);
        if (done) flyT += dt;
      },
      timeout: () => (done ? 'success' : 'failure'),
      draw(t) {
        sceneBg('futur', GY);
        const c = g();
        me.draw(X, GY);
        const k = Math.min(1, n / need);
        const r = 30 + 130 * k;
        const bx = X + 250;
        const by = GY - 180 - r - flyT * 0.9;
        // Pump: the handle goes down on each stroke.
        c.save();
        c.translate(X + 100, GY - 128);
        c.rotate(tilt * 0.25);
        box(-18, -40, 36, 80, '#8e99a4', 6, 10);
        box(-4, -70 - tilt * 12, 8, 34, '#8e99a4', 5);
        box(-24, -78 - tilt * 12, 48, 10, '#8e99a4', 5);
        c.restore();
        // Hose, bubble, shine.
        c.strokeStyle = INK;
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(X + 118, GY - 138);
        c.quadraticCurveTo(X + 180, GY - 110, bx - r * 0.7, by + r * 0.6);
        c.stroke();
        c.fillStyle = 'rgba(170,230,255,.35)';
        c.strokeStyle = 'rgba(22,22,22,.9)';
        c.lineWidth = 6;
        c.beginPath();
        c.arc(bx, by, r, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.fillStyle = 'rgba(255,255,255,.8)';
        c.beginPath();
        c.ellipse(bx - r * 0.4, by - r * 0.4, r * 0.18, r * 0.1, -0.6, 0, Math.PI * 2);
        c.fill();
        if (done) outlineText("ELLE S'ENVOLE !", 640, 200, 54, '#fff');
        // Which side comes next.
        const next = last === -1 ? 1 : -1;
        keyCap(560, 130, 'left', !done && next === -1 ? 1.1 : 0.8, last === -1 ? 'ok' : !done && next === -1 ? 'next' : null);
        keyCap(720, 130, 'right', !done && next === 1 ? 1.1 : 0.8, last === 1 ? 'ok' : !done && next === 1 ? 'next' : null);
        gauge(440, 200, 400, 18, k, '#ff5e3a');
        if (!done && Math.floor(t / 400) % 2 === 0 && n === 0) {
          outlineText('◀', 60, 400, 60, '#fff');
          outlineText('▶', 1220, 400, 60, '#fff');
        }
      },
    };
  },
});
