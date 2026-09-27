import { box, g, INK, outlineText, star } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, fxRand, GY, hero, isPress } from '../common';

/** CASSE LA CAISSE ! — mash to punch the crate to pieces before the fuse burns out. */
const X = 430;
const CRATE_X = X + 238;
const SIZE = 190;

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
}

export default defineMicrogame({
  id: 'caisse',
  verb: 'CASSE LA CAISSE !',
  create(ctx) {
    const me = hero(ctx);
    const max = byLevel(ctx, 14, 16, 18);
    let hp = max;
    let shake = 0;
    let bits: Bit[] = [];
    let pows: { x: number; y: number; t: number }[] = [];
    return {
      input(e) {
        if (!isPress(e) || hp <= 0) return;
        me.force('punch');
        hp -= 1;
        shake = 120;
        ctx.sfx('hit');
        pows.push({ x: X + 140 + fxRand(0, 30), y: GY - 170 + fxRand(-20, 20), t: 0 });
        if (hp <= 0) {
          ctx.sfx('boom');
          ctx.shake(200);
          bits = Array.from({ length: 16 }, () => ({
            x: CRATE_X,
            y: GY - SIZE / 2,
            vx: fxRand(-0.2, 0.7),
            vy: -fxRand(0.3, 1.4),
            r: fxRand(0, 6),
            vr: fxRand(-0.01, 0.01),
          }));
          ctx.win();
        }
      },
      update(dt) {
        me.update(dt);
        if (hp <= 0 && me.pose === 'idle') me.force('win');
        shake = Math.max(0, shake - dt);
        pows = pows.filter((p) => (p.t += dt) < 220);
        for (const b of bits) {
          b.vy += 0.0028 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.r += b.vr * dt;
        }
      },
      timeout: () => (hp <= 0 ? 'success' : 'failure'),
      draw(t) {
        sceneBg('foret', GY);
        const c = g();
        if (hp > 0) {
          const s = shake > 0 ? Math.sin(t * 1.7) * 7 : 0;
          c.save();
          c.translate(CRATE_X + s, GY - SIZE / 2);
          box(-SIZE / 2, -SIZE / 2, SIZE, SIZE, '#c98a3c', 9);
          c.strokeStyle = INK;
          c.lineWidth = 7;
          c.beginPath();
          c.moveTo(-SIZE / 2, -SIZE / 2);
          c.lineTo(SIZE / 2, SIZE / 2);
          c.moveTo(SIZE / 2, -SIZE / 2);
          c.lineTo(-SIZE / 2, SIZE / 2);
          c.stroke();
          c.strokeRect(-SIZE / 2 + 14, -SIZE / 2 + 14, SIZE - 28, SIZE - 28);
          // Cracks: one more per hit.
          c.lineWidth = 5;
          for (let i = 0; i < max - hp; i++) {
            const a = i * 2.4;
            const r = 26 + i * 8;
            const sx = -55 + i * 11;
            const sy = -36 + ((i * 37) % 72);
            c.beginPath();
            c.moveTo(sx, sy);
            c.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
            c.stroke();
          }
          c.restore();
          outlineText(`×${hp}`, CRATE_X, GY - SIZE - 60, 56, '#fff');
        }
        for (const b of bits) {
          c.save();
          c.translate(b.x, b.y);
          c.rotate(b.r);
          box(-28, -9, 56, 18, '#c98a3c', 6);
          c.restore();
        }
        me.draw(X, GY);
        for (const p of pows) star(p.x, p.y, p.t / 220);
      },
    };
  },
});
