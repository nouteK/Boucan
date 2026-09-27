import { ellipse, g, INK, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { cantineBg } from '../backdrops';
import { byLevel, GY, hero, isPress } from '../common';
import { table } from '../props';

/** DÉVORE ! — gobble up the whole plate: mash as fast as you can. */
export default defineMicrogame({
  id: 'devore',
  verb: 'DÉVORE !',
  create(ctx) {
    const me = hero(ctx);
    const X = 460;
    const max = byLevel(ctx, 10, 13, 16);
    let left = max;
    let crumbs: { x: number; y: number; vx: number; vy: number }[] = [];
    let miam: number[] = [];
    return {
      input(e) {
        if (!isPress(e) || ctx.outcome) return;
        left -= 1;
        me.force('catch');
        ctx.sfx('tap');
        for (let i = 0; i < 4; i++) crumbs.push({ x: X + 150, y: GY - 190, vx: ctx.rng.range(-0.3, 0.5), vy: ctx.rng.range(-0.6, -0.2) });
        miam.push(0);
        if (left <= 0) {
          me.force('win');
          ctx.win();
        }
      },
      update(dt) {
        me.update(dt);
        if (me.pose === 'catch' && me.t > 140) me.set('idle');
        for (const c of crumbs) {
          c.vy += 0.003 * dt;
          c.x += c.vx * dt;
          c.y = Math.min(GY - 5, c.y + c.vy * dt);
        }
        if (crumbs.length > 80) crumbs = crumbs.slice(-80);
        miam = miam.map((m) => m + dt).filter((m) => m < 320);
      },
      draw(t) {
        cantineBg(t, GY);
        me.draw(X, GY);
        table(X + 170, GY - 150, 400, GY);
        ellipse(X + 170, GY - 156, 120, 22, '#fff', 6);
        const k = Math.max(0, left) / max;
        const c = g();
        if (k > 0) {
          c.fillStyle = '#f3dfa0';
          c.strokeStyle = INK;
          c.lineWidth = 6;
          c.beginPath();
          c.ellipse(X + 170, GY - 162, 86 * Math.sqrt(k) + 6, 74 * k + 4, 0, Math.PI, 0);
          c.fill();
          c.stroke();
          c.fillStyle = '#e9b44c';
          for (let i = 0; i < Math.ceil(k * 5); i++) c.fillRect(X + 128 + i * 16, GY - 172 - 70 * k + (i % 2) * 12, 10, 34);
        }
        c.fillStyle = '#e9b44c';
        for (const cr of crumbs) c.fillRect(cr.x, cr.y, 8, 8);
        for (const m of miam) {
          c.save();
          c.globalAlpha = 1 - m / 320;
          outlineText('MIAM', X + 60 + m * 0.2, GY - 360 - m * 0.2, 48, '#fff');
          c.restore();
        }
        if (left > 0) outlineText(`×${left}`, X + 170, GY - 310, 58, '#fff');
      },
    };
  },
});
