import { box, g, INK, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { cantineBg } from '../backdrops';
import { byLevel, GY, hero } from '../common';
import { splat } from '../props';

/** VERSE LA SOUPE ! — the ladle swings above: tap when it is right over your bowl. */
export default defineMicrogame({
  id: 'soupe',
  verb: 'VERSE LA SOUPE !',
  create(ctx) {
    const me = hero(ctx, 'hold');
    const X = 430;
    const bx = X + 80;
    const by = GY - 118;
    const ph = ctx.rng.range(0, 6.28);
    const sp = byLevel(ctx, 0.0026, 0.0033, 0.004) * ctx.rng.range(0.9, 1.1);
    const tolerance = byLevel(ctx, 70, 55, 45);
    let clock = 0;
    let pour: { x: number; t: number } | null = null;
    let result: 'win' | 'lose' | null = null;
    const lx = () => 700 + 380 * Math.sin(ph + clock * sp);
    return {
      input(e) {
        if (e.type !== 'down' || pour) return;
        pour = { x: lx(), t: 0 };
        ctx.sfx('whoosh');
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        if (!pour) return;
        pour.t += dt;
        if (pour.t >= 350 && !result) {
          result = Math.abs(pour.x - bx) < tolerance ? 'win' : 'lose';
          if (result === 'win') {
            me.force('catch');
            ctx.sfx('pop');
            ctx.win();
          } else {
            me.force('hurt');
            ctx.shake(200);
            ctx.lose();
          }
        }
      },
      draw(t) {
        cantineBg(t, GY);
        box(-10, GY - 240, 1300, 26, '#c9d3dc', 7);
        me.draw(X, GY);
        const c = g();
        c.save();
        c.translate(bx + 8, by - 2);
        c.fillStyle = '#fff';
        c.strokeStyle = INK;
        c.lineWidth = 6;
        c.beginPath();
        c.ellipse(0, 0, 56, 34, 0, 0, Math.PI);
        c.fill();
        c.stroke();
        c.fillStyle = result === 'win' ? '#f08a2a' : '#fff';
        c.beginPath();
        c.ellipse(0, 0, 52, 10, 0, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.restore();
        const x = pour ? pour.x : lx();
        c.strokeStyle = '#8e99a4';
        c.lineWidth = 16;
        c.beginPath();
        c.moveTo(x + 60, -20);
        c.lineTo(x + 10, 150);
        c.stroke();
        c.save();
        c.translate(x, 190);
        c.rotate(pour ? -0.6 : 0);
        c.fillStyle = '#8e99a4';
        c.strokeStyle = INK;
        c.lineWidth = 6;
        c.beginPath();
        c.arc(0, 0, 48, 0, Math.PI);
        c.closePath();
        c.fill();
        c.stroke();
        if (!pour) {
          c.fillStyle = '#f08a2a';
          c.beginPath();
          c.ellipse(0, 2, 44, 10, 0, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
        if (pour && pour.t < 360) {
          const y2 = 210 + Math.min(1, pour.t / 350) * (by - 210);
          c.strokeStyle = '#f08a2a';
          c.lineWidth = 18;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(x - 30, 210);
          c.lineTo(pour.x - 30, y2);
          c.stroke();
        }
        if (result === 'lose' && pour) {
          splat(pour.x - 30, GY - 4, 1, '#f08a2a');
          outlineText('À CÔTÉ !', pour.x, GY - 330, 56, '#fff');
        }
        c.strokeStyle = 'rgba(255,255,255,.7)';
        c.lineWidth = 4;
        c.setLineDash([10, 12]);
        c.beginPath();
        c.moveTo(bx, 260);
        c.lineTo(bx, by - 40);
        c.stroke();
        c.setLineDash([]);
      },
    };
  },
});
