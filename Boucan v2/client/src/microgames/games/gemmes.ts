import type { ArrowKey } from '../../engine/input';
import { outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero } from '../common';
import { chest, gem, keyCap, ringTimer } from '../props';

/**
 * RAMASSE LES GEMMES ! — each gem shows an arrow: press it (arrow keys or the
 * on-screen pad) before its ring runs out and it flies into your chest.
 * Wrong arrow or too slow: the gem shatters.
 */
const X = 330;
const PAD = { x: 1070, y: 400, gap: 96 };
const DIRS: readonly ArrowKey[] = ['up', 'left', 'right', 'down'];
const PAD_POS: Record<ArrowKey, [number, number]> = {
  up: [PAD.x, PAD.y - PAD.gap],
  left: [PAD.x - PAD.gap, PAD.y],
  right: [PAD.x + PAD.gap, PAD.y],
  down: [PAD.x, PAD.y + PAD.gap],
};
const COLORS = ['#3fb8ff', '#ff4f7b', '#2fd07a', '#ffc93c'];
const FLY_MS = 320;

export default defineMicrogame({
  id: 'gemmes',
  verb: 'RAMASSE LES GEMMES !',
  create(ctx) {
    const me = hero(ctx, 'carry');
    const count = byLevel(ctx, 4, 4, 5);
    const window = byLevel(ctx, 1150, 1000, 880);
    const seq = Array.from({ length: count }, () => ({ dir: ctx.rng.pick(DIRS), col: ctx.rng.pick(COLORS) }));
    let i = 0;
    let since = 0;
    let state: 'play' | 'done' | 'fail' = 'play';
    let bad = -1;
    let flash: { dir: ArrowKey; t: number } | null = null;
    let flying: { col: string; t: number }[] = [];
    let stored: string[] = [];
    let broken: { col: string; t: number } | null = null;
    const limit = () => (i === 0 ? window + 700 : window);
    const fail = () => {
      state = 'fail';
      bad = i;
      broken = { col: seq[i]!.col, t: 0 };
      me.force('hurt');
      ctx.sfx('hurt');
      ctx.shake(200);
      ctx.lose();
    };
    const press = (dir: ArrowKey) => {
      if (state !== 'play') return;
      flash = { dir, t: 0 };
      if (dir !== seq[i]!.dir) {
        fail();
        return;
      }
      flying.push({ col: seq[i]!.col, t: 0 });
      ctx.sfx('pop');
      i += 1;
      since = 0;
      if (i >= count) {
        state = 'done';
        ctx.win();
      }
    };
    return {
      input(e) {
        if (e.type === 'key' && !e.repeat) press(e.key);
        if (e.type === 'down' && e.x !== null && e.y !== null) {
          const hit = DIRS.find((d) => Math.hypot(e.x! - PAD_POS[d][0], e.y! - PAD_POS[d][1]) < 62);
          if (hit) press(hit);
        }
      },
      update(dt) {
        me.update(dt);
        since += dt;
        if (flash && (flash.t += dt) > 160) flash = null;
        if (broken) broken.t += dt;
        flying = flying.filter((f) => {
          f.t += dt;
          if (f.t < FLY_MS) return true;
          stored.push(f.col);
          return false;
        });
        if (state === 'play' && since > limit()) fail();
        if (state === 'done' && me.pose === 'carry' && flying.length === 0) me.force('win');
      },
      timeout: () => (state === 'done' ? 'success' : 'failure'),
      draw(t) {
        sceneBg('ville', GY);
        const hx = X + 80;
        const hy = GY - 110;
        me.draw(X, GY);
        chest(hx, hy + 30, 0.55, 0.5);
        stored.forEach((col, k) => gem(hx - 36 + (k % 4) * 24, hy - 24 - (k % 2) * 10, 0.55, col));
        // Current gem, floating in the middle with its arrow and time ring.
        if (state === 'play') {
          const cur = seq[i]!;
          gem(660, GY - 300 + Math.sin(t / 200) * 8, 1.4, cur.col, Math.sin(t / 240) * 0.1);
          keyCap(660, GY - 440, cur.dir, 1.05, 'next');
          ringTimer(660, GY - 442, 66, 1 - since / limit());
        }
        for (const f of flying) {
          const k = f.t / FLY_MS;
          gem(660 + (hx - 660) * k, GY - 300 + (hy - 40 - (GY - 300)) * k - 110 * 4 * k * (1 - k), 1.4 - 0.8 * k, f.col, k * 6);
        }
        if (broken) {
          const k = Math.min(1, broken.t / 400);
          gem(660 + 60 * k, GY - 300 + 280 * k * k, 1.2, broken.col, k * 4);
          if (k >= 1) outlineText('CRAC !', 660, GY - 420, 56, '#fff');
        }
        // On-screen pad (also shows what the arrow keys do).
        for (const d of DIRS) {
          const [px, py] = PAD_POS[d];
          keyCap(px, py + (flash?.dir === d ? 6 : 0), d, 0.95, flash?.dir === d ? (state === 'fail' ? 'bad' : 'ok') : null);
        }
        // Progress dots.
        seq.forEach((s, k) => gem(640 + (k - (count - 1) / 2) * 50, 110, 0.4, k < i ? s.col : k === bad ? '#555' : 'rgba(255,255,255,.35)'));
      },
    };
  },
});
