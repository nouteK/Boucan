import { box, circle, g, outlineText, poly } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { classeBg } from '../backdrops';
import { GY } from '../common';
import { teacher } from '../props';

/**
 * BOSS — L'INTERRO SURPRISE : memorise the sequence shown on the board, then
 * reproduce it by tapping the 4 buttons (or ← ↑ → ↓). One mistake = failed.
 */
const BUTTONS = [
  { col: '#ff4f7b', key: 'left', shape: 'circle' },
  { col: '#3fb8ff', key: 'up', shape: 'square' },
  { col: '#2fd07a', key: 'right', shape: 'triangle' },
  { col: '#ffb020', key: 'down', shape: 'star' },
] as const;

function symbol(i: number, x: number, y: number, r: number, lit = true): void {
  const b = BUTTONS[i]!;
  const col = lit ? b.col : '#6b6b6b';
  if (b.shape === 'circle') circle(x, y, r, col, 7);
  else if (b.shape === 'square') box(x - r, y - r, r * 2, r * 2, col, 7, 8);
  else if (b.shape === 'triangle') poly([[x, y - r * 1.1], [x + r * 1.1, y + r * 0.9], [x - r * 1.1, y + r * 0.9]], col, 7);
  else
    poly(
      Array.from({ length: 10 }, (_, k) => {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = k % 2 ? r * 0.5 : r * 1.15;
        return [x + Math.cos(a) * rr, y + Math.sin(a) * rr] as [number, number];
      }),
      col,
      7,
    );
}

export default defineMicrogame({
  id: 'boss-classe',
  verb: 'RETIENS ET RÉPÈTE !',
  create(ctx) {
    const len = ctx.level === 1 ? 4 : ctx.level === 2 ? 5 : 6;
    const seq = Array.from({ length: len }, () => ctx.rng.int(0, 3));
    const show = 620;
    const start = 700;
    const inputFrom = start + len * show + 200;
    const slots = [250, 510, 770, 1030];
    let typed: number[] = [];
    let flash: { i: number; t: number } | null = null;
    let clock = 0;
    let wrong = false;
    const press = (i: number) => {
      if (ctx.outcome || clock < inputFrom) return;
      flash = { i, t: 0 };
      typed.push(i);
      if (seq[typed.length - 1] !== i) {
        wrong = true;
        ctx.sfx('hurt');
        ctx.shake(220);
        ctx.lose();
      } else {
        ctx.sfx('select');
        if (typed.length === len) ctx.win();
      }
    };
    return {
      input(e) {
        if (e.type === 'key' && !e.repeat) press(BUTTONS.findIndex((b) => b.key === e.key));
        if (e.type === 'down' && e.x !== null && e.y !== null && e.y > 520) {
          const i = slots.findIndex((x) => Math.abs(e.x! - x) < 115);
          if (i >= 0) press(i);
        }
      },
      update(dt, t) {
        clock = t;
        if (flash) flash.t += dt;
        if (flash && flash.t > 220) flash = null;
      },
      timeout: () => (typed.length === len && !wrong ? 'success' : 'failure'),
      draw(t) {
        classeBg(t, GY + 120, true);
        teacher(1150, GY + 100, 360, 'front', t, wrong ? 'angry' : 'calm');
        const showing = clock >= start && clock < inputFrom - 200;
        if (showing) {
          const k = Math.floor((clock - start) / show);
          const within = (clock - start) % show;
          if (k < len && within < show - 150) symbol(seq[k]!, 640, 210, 80);
          outlineText(`${Math.min(len, k + 1)} / ${len}`, 640, 330, 36, '#fff');
        } else if (clock >= inputFrom) {
          outlineText(ctx.outcome === 'success' ? '20 / 20 !' : wrong ? 'FAUX !' : 'À TOI !', 640, 210, 90, wrong ? '#ff5a4a' : '#ffe04a');
          for (let i = 0; i < len; i++) {
            const done = i < typed.length;
            const x = 640 + (i - (len - 1) / 2) * 70;
            if (done) symbol(typed[i]!, x, 310, 22);
            else circle(x, 310, 10, 'rgba(255,255,255,.4)', 0);
          }
        } else outlineText('REGARDE BIEN…', 640, 210, 60, '#fff');
        // Buttons.
        const c = g();
        slots.forEach((x, i) => {
          const lit = clock >= inputFrom && !ctx.outcome;
          c.save();
          const pressed = flash?.i === i;
          c.translate(0, pressed ? 8 : 0);
          box(x - 105, 540, 210, 150, pressed ? '#fff' : '#fff8e8', 8, 20);
          symbol(i, x, 615, 44, lit || pressed);
          c.restore();
        });
      },
    };
  },
});
