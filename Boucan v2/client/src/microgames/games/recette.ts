import { box, ellipse, font, g, INK, outlineText, poly } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { cantineBg } from '../backdrops';
import { byLevel, fxRand, GY, hero } from '../common';
import { gauge, table } from '../props';

/**
 * RETIENS LA RECETTE ! — the order card shows a burger, bottom to top: learn
 * it, then rebuild it by tapping the ingredients in order (or ← → to choose
 * and Space / ↓ to add). One wrong layer and the whole thing collapses.
 */
const NAMES = ['PAIN', 'FROMAGE', 'NACHOS', 'SAUCE BBQ', 'OIGNONS', 'SALADE'];
const X = 230;
const PLATE_X = 760;
const PLATE_Y = GY - 142;
const CARD_Y = 250;
const cardX = (i: number) => 640 + (i - 2.5) * 172;
/** Layer thickness (index 0 = bread: bottom bun, or top bun when `top`). */
const thickness = (i: number, top: boolean) => (i === 0 ? (top ? 44 : 28) : [0, 16, 22, 12, 16, 18][i]!);

/** One burger layer centred at (x, y), `w` wide. */
function layer(i: number, x: number, y: number, w: number, top: boolean): void {
  const c = g();
  c.save();
  c.translate(x, y);
  if (i === 0 && top) {
    c.fillStyle = '#e7a24f';
    c.strokeStyle = INK;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(-w / 2, 0);
    c.quadraticCurveTo(-w / 2, -50, 0, -50);
    c.quadraticCurveTo(w / 2, -50, w / 2, 0);
    c.closePath();
    c.fill();
    c.stroke();
    for (const [a, b] of [[-30, -30], [0, -38], [28, -26], [-8, -20], [14, -40]] as const) ellipse((a * w) / 160, b, 5, 3, '#fff3d0', 0, 0.4);
  } else if (i === 0) box(-w / 2, -26, w, 26, '#e7a24f', 5, 12);
  else if (i === 1) {
    poly(
      [
        [-w / 2 - 8, -16], [w / 2 + 8, -16], [w / 2 + 8, -2], [w / 4, -2], [w / 4 - 10, 12], [w / 4 - 20, -2],
        [-w / 4, -2], [-w / 4 - 10, 10], [-w / 4 - 20, -2], [-w / 2 - 8, -2],
      ],
      '#ffd23c',
      5,
    );
  } else if (i === 2) {
    for (let k = 0; k < 5; k++) {
      const xx = -w / 2 + 10 + (k * (w - 20)) / 4;
      poly([[xx - 22, 0], [xx + 22, 0], [xx + (k % 2 ? 6 : -6), -24]], '#f5a623', 5);
    }
  } else if (i === 3) {
    const pts: [number, number][] = [[-w / 2, -4]];
    for (let k = 0; k <= 8; k++) pts.push([-w / 2 + (k * w) / 8, -12 + (k % 2) * 8]);
    pts.push([w / 2, 0]);
    for (let k = 8; k >= 0; k--) pts.push([-w / 2 + (k * w) / 8, 2 + (k % 2) * 6]);
    poly(pts, '#7a3b1d', 5);
  } else if (i === 4) {
    for (let k = 0; k < 4; k++) {
      const xx = -w / 2 + 22 + (k * (w - 44)) / 3;
      c.strokeStyle = INK;
      c.lineWidth = 11;
      c.beginPath();
      c.ellipse(xx, -8, 20, 8, 0, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = '#b36bd6';
      c.lineWidth = 5;
      c.stroke();
    }
  } else {
    const pts: [number, number][] = [[-w / 2 - 12, 0]];
    for (let k = 0; k <= 10; k++) pts.push([-w / 2 - 12 + (k * (w + 24)) / 10, -12 - (k % 2) * 10]);
    pts.push([w / 2 + 12, 0]);
    poly(pts, '#56c23c', 5);
  }
  c.restore();
}

export default defineMicrogame({
  id: 'recette',
  verb: 'RETIENS LA RECETTE !',
  create(ctx) {
    const me = hero(ctx);
    const n = byLevel(ctx, 4, 5, 6);
    const middle = ctx.rng.shuffle([1, 2, 3, 4, 5]).slice(0, n - 2);
    const recipe = [0, ...middle, 0];
    const showAt = 700;
    const showMs = 1500 + n * 120;
    let state: 'wait' | 'show' | 'build' | 'done' | 'fail' = 'wait';
    let clock = 0;
    let cursor = 0;
    let bad = -1;
    let stack: { i: number; t: number }[] = [];
    let falling: { i: number; top: boolean; x: number; y: number; vx: number; vy: number; r: number }[] = [];
    const pick = (i: number) => {
      if (state !== 'build') return;
      cursor = i;
      if (i !== recipe[stack.length]) {
        state = 'fail';
        bad = i;
        me.force('hurt');
        ctx.sfx('hurt');
        ctx.shake(240);
        let y = PLATE_Y - 10;
        falling = stack.map((s, j) => {
          const top = j > 0 && s.i === 0;
          const f = { i: s.i, top, x: PLATE_X, y, vx: fxRand(-0.5, 0.5), vy: fxRand(-1, -0.35), r: 0 };
          y -= thickness(s.i, top);
          return f;
        });
        ctx.lose();
        return;
      }
      stack.push({ i, t: 0 });
      ctx.sfx('pop');
      if (stack.length >= recipe.length) {
        state = 'done';
        me.force('win');
        ctx.win();
      }
    };
    return {
      input(e) {
        if (state !== 'build') return;
        if (e.type === 'key' && !e.repeat) {
          if (e.key === 'left') cursor = (cursor + 5) % 6;
          else if (e.key === 'right') cursor = (cursor + 1) % 6;
          else pick(cursor);
        } else if (e.type === 'down') {
          if (e.x === null || e.y === null) pick(cursor);
          else if (Math.abs(e.y - CARD_Y - 15) < 90) {
            const i = [0, 1, 2, 3, 4, 5].find((k) => Math.abs(e.x! - cardX(k)) < 82);
            if (i !== undefined) pick(i);
          }
        }
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        if (state === 'wait' && t >= showAt) state = 'show';
        if (state === 'show' && t >= showAt + showMs) state = 'build';
        for (const s of stack) s.t += dt;
        for (const f of falling) {
          f.vy += 0.003 * dt;
          f.x += f.vx * dt;
          f.y = Math.min(GY - 8, f.y + f.vy * dt);
          f.r += f.vx * dt * 0.01;
        }
      },
      timeout: () => (state === 'done' ? 'success' : 'failure'),
      draw() {
        cantineBg(clock, GY);
        const c = g();
        table(PLATE_X, GY - 137, 420, GY);
        ellipse(PLATE_X, PLATE_Y, 150, 20, '#fff', 6);
        me.draw(X, GY);
        if (state !== 'fail') {
          let y = PLATE_Y - 8;
          stack.forEach((s, j) => {
            const top = j > 0 && s.i === 0;
            const k = Math.min(1, s.t / 220);
            layer(s.i, PLATE_X, y - (1 - k) * 140, 230, top);
            y -= thickness(s.i, top);
          });
        }
        for (const f of falling) {
          c.save();
          c.translate(f.x, f.y);
          c.rotate(f.r);
          layer(f.i, 0, 0, 230, f.top);
          c.restore();
        }
        if (state === 'show') {
          // The order card, top to bottom, with its countdown.
          const h = 90 + n * 56;
          const k = Math.min(1, (clock - showAt) / 180);
          c.save();
          c.translate(640, 70 + (1 - k) * -300);
          c.rotate(-0.03);
          box(-222, 8, 460, h, INK, 0, 18);
          box(-230, 0, 460, h, '#fffaf0', 6, 18);
          outlineText('RECETTE', 0, 44, 40, '#ff4f7b', 'center', 6);
          [...recipe].reverse().forEach((i, r) => {
            const yy = 100 + r * 56;
            layer(i, -120, yy + 16, 90, r === 0);
            c.fillStyle = INK;
            c.font = font(28);
            c.textAlign = 'left';
            c.textBaseline = 'middle';
            c.fillText(NAMES[i]!, -50, yy + 2);
          });
          c.restore();
          gauge(440, 70 + h + 20, 400, 10, 1 - (clock - showAt) / showMs, '#ffc93c');
        }
        if (state === 'build' || state === 'done' || state === 'fail') {
          NAMES.forEach((name, i) => {
            const x = cardX(i);
            const sel = state === 'build' && i === cursor;
            box(x - 73, CARD_Y - 55, 156, 150, INK, 0, 16);
            box(x - 78, CARD_Y - 60 - (sel ? 6 : 0), 156, 150, state === 'fail' && bad === i ? '#ff6b6b' : sel ? '#fff1a8' : '#fffaf0', 5, 16);
            layer(i, x, CARD_Y + 18 - (sel ? 6 : 0), 100, i === 0);
            c.fillStyle = INK;
            c.font = font(18);
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(name, x, CARD_Y + 60 - (sel ? 6 : 0));
          });
          if (state === 'build') outlineText(`${recipe.length - stack.length} à poser`, PLATE_X + 290, GY - 230, 32, '#fff');
        }
        if (state === 'fail') outlineText("ÇA S'EFFONDRE !", PLATE_X, GY - 360, 52, '#fff');
        if (state === 'done') outlineText('MIAM !', PLATE_X, GY - 430, 64, '#7dff9b');
      },
    };
  },
});
