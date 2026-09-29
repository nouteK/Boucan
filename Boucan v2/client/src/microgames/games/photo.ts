import { circle, ellipse, g, item, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { byLevel, isPress } from '../common';

/**
 * PRENDS LA PHOTO ! — a flying saucer zigzags in the night sky: shoot (one
 * tap) when it is inside the viewfinder.
 */
const FRAME = { x: 640, y: 270, w: 360, h: 270 };
const GROUND_Y = 576;

export default defineMicrogame({
  id: 'photo',
  verb: 'PRENDS LA PHOTO !',
  create(ctx) {
    const phase = ctx.rng.range(0, 6);
    const speed = ctx.rng.range(0.9, 1.3) * byLevel(ctx, 1, 1.15, 1.3);
    const ux = (t: number) => 640 + Math.sin(phase + (t / 520) * speed) * 420 + Math.sin(t / 190) * 60;
    const uy = (t: number) => FRAME.y + Math.sin(phase * 2 + (t / 340) * speed) * 85;
    let clock = 0;
    let shotAt: number | null = null;
    let flash = 0;
    let result: 'win' | 'lose' | null = null;
    return {
      input(e) {
        if (!isPress(e) || result || clock < 700) return;
        shotAt = clock;
        flash = 1;
        const x = ux(clock);
        const y = uy(clock);
        result = Math.abs(x - FRAME.x) < FRAME.w / 2 - 20 && Math.abs(y - FRAME.y) < FRAME.h / 2 - 10 ? 'win' : 'lose';
        ctx.sfx('select');
        if (result === 'win') ctx.win();
        else ctx.lose();
      },
      update(dt, t) {
        clock = t;
        flash = Math.max(0, flash - dt / 300);
      },
      timeout: () => (result === 'win' ? 'success' : 'failure'),
      draw(t) {
        const c = g();
        const sky = c.createLinearGradient(0, 0, 0, 720);
        sky.addColorStop(0, '#0c1030');
        sky.addColorStop(1, '#2a3570');
        c.fillStyle = sky;
        c.fillRect(0, 0, 1280, 720);
        for (let i = 0; i < 60; i++) {
          c.fillStyle = `rgba(255,255,255,${0.3 + 0.3 * Math.sin(t / 300 + i)})`;
          c.fillRect((i * 197) % 1280, (i * 89) % 540, 3, 3);
        }
        c.fillStyle = '#10142a';
        c.fillRect(0, GROUND_Y, 1280, 720 - GROUND_Y);
        const at = shotAt ?? clock;
        const x = ux(at);
        const y = uy(at);
        // Tractor beam, then the saucer.
        c.fillStyle = 'rgba(120,255,160,.25)';
        c.beginPath();
        c.moveTo(x - 40, y + 20);
        c.lineTo(x + 40, y + 20);
        c.lineTo(x + 110, GROUND_Y);
        c.lineTo(x - 110, GROUND_Y);
        c.closePath();
        c.fill();
        if (!item('ufo', x, y - 12, 160, Math.sin(t / 300) * 0.06)) ellipse(x, y, 110, 34, '#bfc6ce', 5);
        // Viewfinder.
        c.strokeStyle = '#fff';
        c.lineWidth = 6;
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          const cx = FRAME.x + (sx * FRAME.w) / 2;
          const cy = FRAME.y + (sy * FRAME.h) / 2;
          c.beginPath();
          c.moveTo(cx, cy - sy * 40);
          c.lineTo(cx, cy);
          c.lineTo(cx - sx * 40, cy);
          c.stroke();
        }
        circle(FRAME.x + FRAME.w / 2 - 20, FRAME.y - FRAME.h / 2 + 20, 8, '#ff3b3b', 0);
        if (flash > 0) {
          c.fillStyle = `rgba(255,255,255,${flash})`;
          c.fillRect(0, 0, 1280, 720);
        }
        if (result) outlineText(result === 'win' ? 'CLIC ! BELLE PHOTO' : 'FLOU…', 640, 510, 50, result === 'win' ? '#7dff9b' : '#ff6b6b', 'center', 8);
      },
    };
  },
});
