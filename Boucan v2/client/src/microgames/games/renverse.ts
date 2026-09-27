import { g, INK, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { cantineBg } from '../backdrops';
import { GY, hero } from '../common';
import { pureeBall, splat, tray } from '../props';

/** NE RENVERSE RIEN ! — carry the tray: it tilts, tap to straighten it before everything falls. */
export default defineMicrogame({
  id: 'renverse',
  verb: 'NE RENVERSE RIEN !',
  create(ctx) {
    const me = hero(ctx, 'carry');
    const X = 560;
    const hx = X + 80;
    const hy = GY - 118;
    const force = 1.25e-6 * (ctx.level === 1 ? 1 : ctx.level === 2 ? 1.3 : 1.6);
    let th = 0;
    let w = 0;
    let s = ctx.rng.chance(0.5) ? -1 : 1;
    let flip = ctx.rng.range(500, 1100);
    let fell = false;
    let cooldown = 0;
    let walk = 0;
    let items: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    return {
      input(e) {
        if (e.type !== 'down' || fell || cooldown > 0) return;
        w = -th * 0.0045;
        s = ctx.rng.chance(0.5) ? -1 : 1;
        cooldown = 110;
        ctx.sfx('select');
      },
      update(dt) {
        me.update(dt);
        cooldown = Math.max(0, cooldown - dt);
        walk += dt * 0.35;
        if (fell) {
          for (const b of items) {
            b.vy += 0.003 * dt;
            b.x += b.vx * dt;
            b.y = Math.min(GY - 8, b.y + b.vy * dt);
            b.r += dt * 0.01;
          }
          return;
        }
        if ((flip -= dt) <= 0) {
          flip = ctx.rng.range(500, 1100);
          s = -s;
        }
        w += s * force * dt;
        w *= Math.exp(-dt / 1600);
        th += w * dt;
        if (Math.abs(th) > 0.55) {
          fell = true;
          me.force('hurt');
          ctx.sfx('hurt');
          ctx.shake(240);
          ctx.lose();
          items = [0, 1, 2].map((i) => ({ x: hx - 40 + i * 50, y: hy - 30, vx: ctx.rng.range(-0.4, 0.6) + Math.sign(th) * 0.3, vy: ctx.rng.range(-0.8, -0.3), r: 0 }));
        }
      },
      timeout: () => (fell ? 'failure' : 'success'),
      draw(t) {
        cantineBg(t, GY);
        const bob = Math.abs(Math.sin(walk / 40)) * 6;
        me.draw(X, GY - bob);
        if (!fell) tray(hx + 4, hy + 6 - bob, th, 0.9);
        else {
          tray(hx + 60, GY - 6, 0.3, 0.9, []);
          items.forEach((b, i) => (i === 1 ? splat(b.x, b.y, 0.6) : pureeBall(b.x, b.y, 18, b.r)));
          outlineText('OUPS', X + 240, GY - 330, 64, '#fff');
        }
        // Balance gauge.
        const c = g();
        c.save();
        c.translate(640, 110);
        c.lineWidth = 16;
        c.strokeStyle = INK;
        c.beginPath();
        c.arc(0, 90, 150, Math.PI * 1.25, Math.PI * 1.75);
        c.stroke();
        c.lineWidth = 10;
        c.strokeStyle = '#2fd07a';
        c.beginPath();
        c.arc(0, 90, 150, Math.PI * 1.4, Math.PI * 1.6);
        c.stroke();
        c.strokeStyle = '#ff5a4a';
        c.beginPath();
        c.arc(0, 90, 150, Math.PI * 1.25, Math.PI * 1.4);
        c.stroke();
        c.beginPath();
        c.arc(0, 90, 150, Math.PI * 1.6, Math.PI * 1.75);
        c.stroke();
        c.rotate(Math.max(-0.8, Math.min(0.8, th * 1.45)));
        c.fillStyle = INK;
        c.fillRect(-5, -70, 10, 160);
        c.beginPath();
        c.arc(0, 90, 14, 0, Math.PI * 2);
        c.fill();
        c.restore();
      },
    };
  },
});
