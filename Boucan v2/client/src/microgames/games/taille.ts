import { box, g, INK, outlineText, poly } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { byLevel, isPress } from '../common';
import { dots } from '../../engine/draw';

/** TAILLE TON CRAYON ! — mash to turn the pencil in the sharpener until the tip is perfect. */
export default defineMicrogame({
  id: 'taille',
  verb: 'TAILLE TON CRAYON !',
  create(ctx) {
    const need = byLevel(ctx, 12, 15, 18);
    const color = ['#ff4f7b', '#3fb8ff', '#2fd07a', '#ffb020'][ctx.rng.int(0, 3)]!;
    let turns = 0;
    let spin = 0;
    let shavings: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    return {
      input(e) {
        if (!isPress(e) || ctx.outcome) return;
        turns += 1;
        spin += 0.9;
        ctx.sfx('tap');
        for (let i = 0; i < 3; i++) shavings.push({ x: 700, y: 360, vx: ctx.rng.range(-0.1, 0.5), vy: ctx.rng.range(-0.5, -0.1), r: ctx.rng.range(0, 6) });
        if (turns >= need) {
          ctx.sfx('pop');
          ctx.win();
        }
      },
      update(dt) {
        for (const s of shavings) {
          s.vy += 0.002 * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.r += dt * 0.01;
        }
        shavings = shavings.filter((s) => s.y < 760);
      },
      draw(t) {
        dots('#ffd166', 'rgba(255,255,255,.35)', t);
        const c = g();
        const k = Math.min(1, turns / need);
        // Pencil (horizontal), tip into the sharpener at x≈700.
        c.save();
        c.translate(0, 360);
        const wob = Math.sin(spin) * 4;
        box(160, -40 + wob, 460, 80, color, 8, 6);
        c.fillStyle = 'rgba(0,0,0,.12)';
        c.fillRect(160, -40 + wob + 50, 460, 30);
        box(120, -40 + wob, 50, 80, '#ff9bb3', 7, 8);
        const tip = 60 + k * 90;
        poly([[620, -40 + wob], [620 + tip, wob], [620, 40 + wob]], '#f3cf9a', 7);
        poly([[620 + tip - 26, -8 + wob], [620 + tip, wob], [620 + tip - 26, 8 + wob]], INK, 0);
        c.restore();
        // Sharpener.
        box(650, 290, 170, 140, '#8e99a4', 8, 10);
        box(660, 300, 40, 120, '#b9c3cc', 0, 6);
        c.fillStyle = '#c98a4c';
        for (const s of shavings) {
          c.save();
          c.translate(s.x, s.y);
          c.rotate(s.r);
          c.fillRect(-10, -4, 20, 8);
          c.restore();
        }
        box(390, 600, 500, 30, '#fff', 6, 15);
        box(394, 604, 492 * k, 22, k >= 1 ? '#2fd07a' : '#3fb8ff', 0, 11);
        if (k >= 1) outlineText('POINTU !', 640, 160, 80, '#fff');
      },
    };
  },
});
