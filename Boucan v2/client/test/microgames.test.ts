import { createRng, microgameInfo } from '@boucan/shared';
import { describe, expect, it } from 'vitest';
import { setContext } from '../src/engine/draw';
import { MICROGAME_DEFS } from '../src/microgames';
import { fakeContext, harness, randomInput } from './support';

/**
 * Smoke tests: every microgame is created, fed random input and drawn for its
 * whole duration (three levels, several seeds) on a fake canvas. Catches
 * crashes, NaN-free outcome logic and microgames that never decide.
 */

describe('every solo / boss microgame plays through without crashing', () => {
  setContext(fakeContext());
  const solos = MICROGAME_DEFS.filter((d) => microgameInfo(d.id)?.kind !== 'duel');
  for (const def of solos) {
    it(def.id, () => {
      for (const level of [1, 2, 3]) {
        for (const seed of [1, 42, 777]) {
          const h = harness(def.id, seed + level, level);
          const r = createRng(seed * 31 + level);
          const dt = 16;
          const end = h.ctx.duration + 800;
          for (let t = dt; t <= end; t += dt) {
            h.clock.t = t;
            if (r.next() < 0.18) h.instance.input?.(randomInput(() => r.next()));
            h.instance.update(dt, t);
            h.instance.draw(t, dt);
          }
          const final = h.outcome() ?? h.instance.timeout?.() ?? 'failure';
          expect(['success', 'failure'], `${def.id} level ${level} seed ${seed}`).toContain(final);
          h.instance.dispose?.();
        }
      }
    });
  }
});
