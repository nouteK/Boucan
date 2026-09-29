import { box, g, INK, item, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { byLevel, sideOf } from '../common';
import { keyCap } from '../props';

/**
 * VISSE L'AMPOULE ! — in the dark, screw the bulb in: left, right, left…
 * (screen halves or ← →). The same side twice forces the thread: three
 * cracks and it breaks. Fully screwed = light!
 */
const CX = 640;
const CY = 300;

export default defineMicrogame({
  id: 'ampoule',
  verb: "VISSE L'AMPOULE !",
  create(ctx) {
    const need = byLevel(ctx, 16, 18, 20);
    let turns = 0;
    let last: -1 | 1 | null = null;
    let cracks = 0;
    let rot = 0;
    let result: 'win' | 'lose' | null = null;
    return {
      input(e) {
        const side = sideOf(e);
        if (side === null || result) return;
        if (side === last) {
          cracks += 1;
          ctx.shake(120);
          ctx.sfx('block');
          if (cracks >= 3) {
            result = 'lose';
            ctx.sfx('boom');
            ctx.lose();
          }
          return;
        }
        last = side;
        turns += 1;
        rot += 0.45;
        ctx.sfx('tap');
        if (turns >= need) {
          result = 'win';
          ctx.sfx('pop');
          ctx.win();
        }
      },
      update() {},
      timeout: () => (result === 'win' ? 'success' : 'failure'),
      draw() {
        const c = g();
        const k = turns / need;
        c.fillStyle = result === 'win' ? '#fff3b0' : '#1c1c2e';
        c.fillRect(0, 0, 1280, 720);
        if (result === 'win') {
          const glow = c.createRadialGradient(CX, CY, 40, CX, CY, 600);
          glow.addColorStop(0, 'rgba(255,240,120,.9)');
          glow.addColorStop(1, 'rgba(255,240,120,0)');
          c.fillStyle = glow;
          c.fillRect(0, 0, 1280, 720);
        }
        // Wire and socket, the bulb rising as it is screwed in.
        c.fillStyle = '#555';
        c.fillRect(CX - 6, 0, 12, 130);
        box(CX - 60, 122, 120, 46, '#777', 6, 8);
        const dy = 36 * (1 - k);
        const broken = cracks >= 2 || result === 'lose';
        if (!item(broken ? 'bulb-x' : 'bulb', CX, CY + dy - 36, 300, Math.PI + Math.sin(rot) * 0.04)) {
          box(CX - 45, CY + dy - 135, 90, 72, '#bfc6ce', 6);
          c.fillStyle = result === 'win' ? '#ffe04a' : 'rgba(220,240,255,.6)';
          c.beginPath();
          c.arc(CX, CY + dy + 20, 90, 0, Math.PI * 2);
          c.fill();
        }
        c.strokeStyle = INK;
        c.lineWidth = 5;
        for (let i = 0; i < cracks; i++) {
          c.beginPath();
          c.moveTo(CX - 60 + i * 50, CY + dy - 36);
          c.lineTo(CX - 40 + i * 50, CY + dy);
          c.lineTo(CX - 65 + i * 50, CY + dy + 27);
          c.stroke();
        }
        // Progress and the side to press next.
        box(390, 600, 500, 24, INK, 0, 12);
        c.fillStyle = '#ffd23c';
        c.fillRect(396, 605, 488 * k, 14);
        if (!result) {
          const next = last === -1 ? 1 : -1;
          keyCap(560, 500, 'left', next === -1 ? 1.1 : 0.8, next === -1 ? 'next' : null);
          keyCap(720, 500, 'right', next === 1 ? 1.1 : 0.8, next === 1 ? 'next' : null);
          outlineText('alterne ! (pas 2 fois le même côté)', 640, 565, 24, '#fff', 'center', 5);
        }
        if (result === 'lose') outlineText('CRAC !', CX, CY, 80, '#ff6b6b', 'center', 9);
      },
    };
  },
});
