import { box, g, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { classeBg } from '../backdrops';
import { byLevel, GY } from '../common';

/**
 * EFFACE LE TABLEAU ! — rub the board clean: drag the sponge over the chalk.
 * Keyboard: mash Space / arrows (the sponge sweeps by itself).
 */
export default defineMicrogame({
  id: 'efface',
  verb: 'EFFACE LE TABLEAU !',
  create(ctx) {
    const board = { x: 316, y: 76, w: 648, h: 268 };
    const cols = 12;
    const rows = 5;
    const cw = board.w / cols;
    const ch = board.h / rows;
    const need = byLevel(ctx, 0.8, 0.88, 0.94);
    const cells = Array.from({ length: cols * rows }, () => ({
      dirty: ctx.rng.chance(0.85),
      strokes: Array.from({ length: 3 }, () => [ctx.rng.range(0.1, 0.9), ctx.rng.range(0.1, 0.9), ctx.rng.range(0.1, 0.9), ctx.rng.range(0.1, 0.9)]),
    }));
    const total = cells.filter((c) => c.dirty).length;
    let sponge = { x: 640, y: 420 };
    let sweep = 0;
    const rub = (x: number, y: number) => {
      sponge = { x, y };
      const r = 70;
      cells.forEach((cell, i) => {
        if (!cell.dirty) return;
        const cx = board.x + (i % cols) * cw + cw / 2;
        const cy = board.y + Math.floor(i / cols) * ch + ch / 2;
        if (Math.abs(cx - x) < r && Math.abs(cy - y) < r) cell.dirty = false;
      });
      if (!ctx.outcome && cells.filter((c) => c.dirty).length <= total * (1 - need)) ctx.win();
    };
    const ratio = () => 1 - cells.filter((c) => c.dirty).length / Math.max(1, total);
    /** Keyboard / Space: each press wipes the next column (mash to clean). */
    const keyRub = () => {
      const col = sweep++ % cols;
      for (let row = 0; row < rows; row++) rub(board.x + (col + 0.5) * cw, board.y + (row + 0.5) * ch);
    };
    return {
      input(e) {
        if (ctx.outcome) return;
        if ((e.type === 'move' && e.pressed) || e.type === 'down') {
          if (e.x !== null && e.y !== null) rub(e.x, e.y);
          else keyRub();
          if (Math.random() < 0.3) ctx.sfx('whoosh');
        }
        if (e.type === 'key' && !e.repeat) keyRub();
      },
      update() {},
      draw(t) {
        classeBg(t, GY);
        const c = g();
        c.strokeStyle = 'rgba(255,255,255,.9)';
        c.lineWidth = 7;
        c.lineCap = 'round';
        cells.forEach((cell, i) => {
          if (!cell.dirty) return;
          const x0 = board.x + (i % cols) * cw;
          const y0 = board.y + Math.floor(i / cols) * ch;
          for (const [a, b, d, e] of cell.strokes) {
            c.beginPath();
            c.moveTo(x0 + a! * cw, y0 + b! * ch);
            c.lineTo(x0 + d! * cw, y0 + e! * ch);
            c.stroke();
          }
        });
        box(sponge.x - 60, sponge.y - 32, 120, 64, '#ffd23c', 7, 12);
        box(sponge.x - 60, sponge.y + 8, 120, 24, '#3fa3ff', 0, 8);
        const k = ratio();
        box(390, 640, 500, 34, '#fff', 6, 17);
        box(394, 644, 492 * Math.min(1, k / need), 26, k >= need ? '#2fd07a' : '#3fb8ff', 0, 13);
        outlineText(`${Math.round(Math.min(1, k / need) * 100)} %`, 640, 600, 40, '#fff');
      },
    };
  },
});
