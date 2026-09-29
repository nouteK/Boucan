import { ellipse, g, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { byLevel, hero, sideOf } from '../common';
import { bomb, boom } from '../props';
import { drawRoad, enterRoad, roadPoint } from '../road';

/**
 * ESQUIVE LES BOMBES ! — running down the road, bombs roll towards you on
 * three lanes: switch lane (screen halves or ← →) to let them pass. Some
 * waves block two lanes at once.
 */
const LANES = [-0.62, 0, 0.62];
/** Distance of the runner along the road (constant: the road scrolls). */
const RUNNER_D = 90;
const WAVES = 6;

export default defineMicrogame({
  id: 'esquive',
  verb: 'ESQUIVE LES BOMBES !',
  create(ctx) {
    const me = hero(ctx, 'run');
    const v = byLevel(ctx, 0.95, 1.02, 1.1);
    const [gapMin, gapMax] = byLevel(ctx, [450, 650], [440, 620], [420, 590]);
    interface Bomb {
      at: number;
      lane: number;
      wob: number;
    }
    const bombs: Bomb[] = [];
    let at = ctx.rng.range(1500, 1700);
    for (let i = 0; i < WAVES; i++) {
      const lane = i === 0 ? (ctx.rng.chance(0.5) ? 0 : 2) : ctx.rng.int(0, 2);
      bombs.push({ at, lane, wob: ctx.rng.range(0, 6) });
      if (i > 1 && ctx.rng.chance(0.3)) bombs.push({ at, lane: (lane + (ctx.rng.chance(0.5) ? 1 : 2)) % 3, wob: ctx.rng.range(0, 6) });
      at += ctx.rng.range(gapMin, gapMax);
    }
    const end = Math.max(...bombs.map((b) => b.at)) + 300;
    let lane = 1;
    let u = 0;
    let clock = 0;
    let hit: { bomb: Bomb; t: number } | null = null;
    return {
      input(e) {
        const side = sideOf(e);
        if (side === null || hit) return;
        const next = Math.max(0, Math.min(2, lane + side));
        if (next === lane) return;
        lane = next;
        ctx.sfx('whoosh');
      },
      update(dt, t) {
        me.update(dt);
        if (hit) {
          hit.t += dt;
          return;
        }
        const before = clock;
        clock = t;
        u += (LANES[lane]! - u) * Math.min(1, dt / 70);
        for (const b of bombs) {
          if (b.at > before && b.at <= t && Math.abs(u - LANES[b.lane]!) < 0.4) {
            hit = { bomb: b, t: 0 };
            me.force('hurt');
            ctx.sfx('boom');
            ctx.shake(300);
            ctx.lose();
            return;
          }
        }
        if (t > end && !ctx.outcome) ctx.win();
      },
      timeout: () => (hit ? 'failure' : 'success'),
      draw(t) {
        drawRoad(clock * v, [-0.31, 0.31]);
        const c = g();
        c.save();
        enterRoad();
        // Far to near: bombs, then the runner at its depth.
        const items: { d: number; draw: () => void }[] = [];
        for (const b of bombs) {
          const d = RUNNER_D + v * (b.at - clock);
          if (d > 2200 || d < -60 || hit?.bomb === b) continue;
          items.push({
            d,
            draw: () => {
              const q = roadPoint(d, LANES[b.lane]!);
              ellipse(q.x, q.y, 70 * q.p, 16 * q.p, 'rgba(0,0,0,.3)', 0);
              bomb(q.x, q.y, 170 * q.p, d < 500 ? 2 : d < 1100 ? 1 : 0, true, Math.sin(t / 90 + b.wob) * 0.15);
            },
          });
        }
        const me0 = roadPoint(RUNNER_D, u);
        items.push({
          d: RUNNER_D,
          draw: () => {
            ellipse(me0.x, me0.y, 80, 16, 'rgba(0,0,0,.28)', 0, -0.25);
            me.draw(me0.x, me0.y, 244, { shadow: false, rot: (LANES[lane]! - u) * 0.6 });
          },
        });
        items.sort((a, b) => b.d - a.d).forEach((i) => i.draw());
        if (hit) boom(me0.x, me0.y - 120, 420 * (0.6 + Math.min(1, hit.t / 150) * 0.4));
        else {
          // Speed lines.
          c.strokeStyle = 'rgba(255,255,255,.4)';
          c.lineWidth = 3;
          for (let k = 0; k < 6; k++) {
            const y = me0.y - 60 - k * 34;
            const x = me0.x - 130 - ((t * 0.9 + k * 70) % 120);
            c.beginPath();
            c.moveTo(x, y);
            c.lineTo(x - 60, y + 12);
            c.stroke();
          }
        }
        c.restore();
        outlineText(`BOMBES : ${bombs.filter((b) => b.at > clock).length}`, 1180, 135, 32, '#fff', 'right', 6);
      },
    };
  },
});
