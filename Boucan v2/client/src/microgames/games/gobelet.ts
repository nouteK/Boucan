import { box, g, item, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY } from '../common';

/**
 * OÙ EST L'OS ? — the bone is shown under a cup, then the cups swap places:
 * follow it and touch the right cup at the end (or ← ↑ →).
 */
const SLOTS = [360, 640, 920];
const TABLE_Y = 410;
const SHOW_MS = 1300;
const FIRST = 1500;

export default defineMicrogame({
  id: 'gobelet',
  verb: "OÙ EST L'OS ?",
  create(ctx) {
    /** pos[cup] = slot where the cup is now. */
    const pos = [0, 1, 2];
    const bone = ctx.rng.int(0, 2);
    const count = byLevel(ctx, 5, 6, 8);
    const ms = byLevel(ctx, 420, 360, 300);
    const swaps: { at: number; a: number; b: number; done: boolean }[] = [];
    let at = FIRST;
    for (let i = 0; i < count; i++) {
      const a = ctx.rng.int(0, 2);
      swaps.push({ at, a, b: (a + 1 + ctx.rng.int(0, 1)) % 3, done: false });
      at += ms + 40;
    }
    const end = at;
    let clock = 0;
    let pick = -1;
    let result: 'win' | 'lose' | null = null;
    let resultT = 0;
    const choose = (slot: number) => {
      if (result || clock < end) return;
      pick = pos.indexOf(slot);
      result = pick === bone ? 'win' : 'lose';
      if (result === 'win') {
        ctx.sfx('pop');
        ctx.win();
      } else {
        ctx.sfx('hurt');
        ctx.lose();
      }
    };
    return {
      input(e) {
        if (e.type === 'down' && e.x !== null) {
          let best = 0;
          for (let s = 1; s < 3; s++) if (Math.abs(SLOTS[s]! - e.x) < Math.abs(SLOTS[best]! - e.x)) best = s;
          choose(best);
        } else if (e.type === 'key' && !e.repeat) {
          if (e.key === 'left') choose(0);
          else if (e.key === 'up' || e.key === 'down') choose(1);
          else if (e.key === 'right') choose(2);
        }
      },
      update(dt, t) {
        clock = t;
        if (result) resultT += dt;
        for (const s of swaps) {
          if (s.done || t < s.at + ms) continue;
          s.done = true;
          const ca = pos.indexOf(s.a);
          const cb = pos.indexOf(s.b);
          pos[ca] = s.b;
          pos[cb] = s.a;
          ctx.sfx('tap');
        }
      },
      timeout: () => (result === 'win' ? 'success' : 'failure'),
      draw() {
        sceneBg('tresor', GY, 0, false, 'gobelet');
        const c = g();
        box(160, TABLE_Y, 960, 40, '#7a4a2a', 6, 6);
        c.fillStyle = '#5a3418';
        c.fillRect(200, TABLE_Y + 40, 30, GY - TABLE_Y - 40);
        c.fillRect(1050, TABLE_Y + 40, 30, GY - TABLE_Y - 40);
        const lift = clock < SHOW_MS ? Math.max(0, Math.sin(Math.min(1, clock / 1200) * Math.PI)) * 120 : result ? Math.min(1, resultT / 250) * 120 : 0;
        const moving = swaps.find((s) => !s.done && clock >= s.at);
        for (let cup = 0; cup < 3; cup++) {
          let x = SLOTS[pos[cup]!]!;
          let y = TABLE_Y;
          if (moving && (pos[cup] === moving.a || pos[cup] === moving.b)) {
            const k = Math.min(1, (clock - moving.at) / ms);
            const fromA = pos[cup] === moving.a;
            const x0 = SLOTS[fromA ? moving.a : moving.b]!;
            const x1 = SLOTS[fromA ? moving.b : moving.a]!;
            x = x0 + (x1 - x0) * k;
            y -= (fromA ? 1 : -0.4) * Math.sin(k * Math.PI) * 60;
          }
          const up = clock < SHOW_MS || (result && (cup === pick || cup === bone)) ? lift : 0;
          if (cup === bone && up > 10 && !item('bone', x, y - 30, 70, 0.49)) outlineText('OS', x, y - 30, 30, '#fff');
          if (!item('cup', x, y - up - 100, 215, Math.PI)) box(x - 70, y - up - 190, 140, 180, '#ff4f7b', 6, 20);
        }
        if (clock >= end && !result) outlineText('TOUCHE LE BON GOBELET !', 640, 150, 50, '#ffe04a', 'center', 8);
      },
    };
  },
});
