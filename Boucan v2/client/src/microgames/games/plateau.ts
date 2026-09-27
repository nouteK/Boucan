import { box, g, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { cantineBg } from '../backdrops';
import { byLevel, GY, hero } from '../common';
import { pureeBall, splat, tray } from '../props';

/** RATTRAPE LE PLATEAU ! — a tray flies at you: tap to raise your arms just before it lands. */
export default defineMicrogame({
  id: 'plateau',
  verb: 'RATTRAPE LE PLATEAU !',
  create(ctx) {
    const me = hero(ctx);
    const X = 520;
    const hx = X + 80;
    const hy = GY - 118;
    const T = ctx.duration * ctx.rng.range(0.48, 0.68);
    const hold = byLevel(ctx, 480, 380, 300);
    let raisedAt = -1;
    let cooldown = 0;
    let state: 'fly' | 'caught' | 'crash' = 'fly';
    let px = 1340;
    let py = 200;
    let rot = 0;
    let bits: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    let clock = 0;
    const raised = () => raisedAt >= 0 && clock - raisedAt <= hold;
    return {
      input(e) {
        if (e.type !== 'down' || state !== 'fly' || cooldown > 0 || raised()) return;
        raisedAt = clock;
        me.force('ready');
        ctx.sfx('select');
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        cooldown = Math.max(0, cooldown - dt);
        if (raisedAt >= 0 && !raised() && state === 'fly') {
          raisedAt = -1;
          cooldown = 160;
          me.force('idle');
        }
        if (state === 'fly') {
          const p = Math.min(1, t / T);
          px = 1340 + (hx - 1340) * p;
          py = 200 + (hy - 10 - 200) * p - 280 * 4 * p * (1 - p);
          rot = Math.sin(p * 9) * 0.3 * (1 - p);
          if (p >= 1) {
            if (raised()) {
              state = 'caught';
              me.force('carry');
              ctx.sfx('pop');
              ctx.win();
            } else {
              state = 'crash';
              me.force('hurt');
              ctx.sfx('hurt');
              ctx.shake(240);
              ctx.lose();
              bits = [0, 1, 2].map(() => ({ x: px, y: py, vx: ctx.rng.range(-0.4, 0.5), vy: ctx.rng.range(-0.9, -0.4), r: 0 }));
            }
          }
        } else if (state === 'crash') {
          for (const b of bits) {
            b.vy += 0.003 * dt;
            b.x += b.vx * dt;
            b.y = Math.min(GY - 10, b.y + b.vy * dt);
            b.r += dt * 0.01;
          }
        }
      },
      draw(t) {
        cantineBg(t, GY);
        box(1060, GY - 250, 240, 250, '#c9d3dc', 7);
        if (state === 'fly') {
          const k = Math.min(1, t / T);
          const c = g();
          c.fillStyle = `rgba(0,0,0,${0.1 + 0.2 * k})`;
          c.beginPath();
          c.ellipse(px, GY, 40 + 50 * k, 10, 0, 0, Math.PI * 2);
          c.fill();
        }
        me.draw(X, GY);
        if (state === 'caught') tray(hx + 4, hy - 10, 0, 0.9);
        else if (state === 'fly') tray(px, py, rot, 0.9);
        else {
          tray(X + 130, GY - 6, 0.4, 0.9, []);
          bits.forEach((b, i) => (i === 0 ? splat(b.x, Math.max(b.y, GY - 4), 0.7) : pureeBall(b.x, b.y, 16, b.r)));
          outlineText('CRAC !', X + 220, GY - 330, 64, '#fff');
        }
      },
    };
  },
});
