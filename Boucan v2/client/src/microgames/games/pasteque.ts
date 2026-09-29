import { clamp, g, INK, item, outlineText } from '../../engine/draw';
import type { ArrowKey } from '../../engine/input';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY } from '../common';
import { bomb, boom } from '../props';

/**
 * TRANCHE LES FRUITS ! — fruits are tossed up: slash three of them (touch
 * where to slash, or ← → to move the knife and ↑ / Space to slash). Never
 * slash a bomb.
 */
const NEED = 3;
const AIR_MS = 2100;
const FRUITS = ['melon', 'orange', 'straw'] as const;
const COLORS = ['#2fd07a', '#ff9f1c', '#ff4f7b'];

interface Fruit {
  at: number;
  x: number;
  vx: number;
  bomb: boolean;
  kind: number;
  /** Cut: where and since when. */
  cut: { x: number; y: number; t: number } | null;
  done: boolean;
}

export default defineMicrogame({
  id: 'pasteque',
  verb: 'TRANCHE LES FRUITS !',
  create(ctx) {
    const [gapMin, gapMax] = byLevel(ctx, [560, 800], [520, 740], [480, 680]);
    const fruits: Fruit[] = [];
    let at = 900;
    for (let i = 0; i < 7; i++) {
      fruits.push({ at, x: ctx.rng.range(220, 1060), vx: ctx.rng.range(-0.06, 0.06), bomb: i > 0 && ctx.rng.chance(0.25), kind: ctx.rng.int(0, 2), cut: null, done: false });
      at += ctx.rng.range(gapMin, gapMax);
    }
    let clock = 0;
    let knife = 640;
    const keys = new Set<ArrowKey>();
    let slashes: { x: number; t: number }[] = [];
    let cuts = 0;
    let blast: { x: number; y: number; t: number } | null = null;
    const height = (f: Fruit) => {
      const k = (clock - f.at) / AIR_MS;
      return k < 0 || k > 1 ? null : GY + 60 - 684 * 4 * k * (1 - k);
    };
    const xOf = (f: Fruit) => f.x + f.vx * (clock - f.at);
    const slash = () => {
      if (ctx.outcome) return;
      slashes.push({ x: knife, t: 0 });
      ctx.sfx('whoosh');
      for (const f of fruits) {
        if (f.done) continue;
        const y = height(f);
        if (y === null || y > GY - 60) continue;
        const x = xOf(f);
        if (Math.abs(x - knife) >= (f.bomb ? 70 : 130)) continue;
        f.done = true;
        if (f.bomb) {
          blast = { x, y, t: 0 };
          ctx.sfx('boom');
          ctx.shake(300);
          ctx.lose();
          return;
        }
        f.cut = { x, y, t: 0 };
        cuts += 1;
        ctx.sfx('hit');
        if (cuts >= NEED) ctx.win();
      }
    };
    return {
      input(e) {
        if (e.type === 'down') {
          if (e.x !== null) knife = clamp(e.x, 80, 1200);
          slash();
        } else if (e.type === 'key') {
          keys.add(e.key);
          if (e.key === 'up' && !e.repeat) slash();
        } else if (e.type === 'keyup') keys.delete(e.key);
      },
      update(dt, t) {
        clock = t;
        const dir = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
        knife = clamp(knife + dir * 0.9 * dt, 80, 1200);
        slashes = slashes.filter((s) => (s.t += dt) < 220);
        for (const f of fruits) if (f.cut) f.cut.t += dt;
        if (blast) blast.t += dt;
      },
      timeout: () => (cuts >= NEED && !blast ? 'success' : 'failure'),
      draw(t) {
        sceneBg('prairie', GY, 0, false, 'pasteque');
        const c = g();
        c.fillStyle = 'rgba(255,255,255,.35)';
        c.fillRect(0, 0, 1280, 720);
        for (const f of fruits) {
          if (f.cut) {
            // Two halves flying apart.
            const k = f.cut.t / 500;
            if (k > 1) continue;
            for (const s of [-1, 1]) {
              const hx = f.cut.x + s * k * 120;
              const hy = f.cut.y + k * k * 300;
              if (item(`${FRUITS[f.kind]}-h`, hx, hy, 120, s * k * 2, s < 0)) continue;
              c.save();
              c.translate(hx, hy);
              c.rotate(s * k * 2);
              c.fillStyle = COLORS[f.kind]!;
              c.strokeStyle = INK;
              c.lineWidth = 6;
              c.beginPath();
              c.arc(0, 0, 50, s > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? Math.PI / 2 : Math.PI * 1.5);
              c.closePath();
              c.fill();
              c.stroke();
              c.restore();
            }
            continue;
          }
          if (f.done) continue;
          const y = height(f);
          if (y === null) continue;
          const x = xOf(f);
          if (f.bomb) {
            c.strokeStyle = `rgba(255,40,40,${0.5 + 0.5 * Math.sin(t / 60)})`;
            c.lineWidth = 8;
            c.beginPath();
            c.arc(x, y, 90, 0, Math.PI * 2);
            c.stroke();
            bomb(x, y + 70, 160, 2, true, t / 200);
            outlineText('✘', x, y - 100, 40, '#ff3b3b');
          } else {
            if (Math.abs(x - knife) < 130) {
              c.fillStyle = 'rgba(255,255,160,.55)';
              c.beginPath();
              c.arc(x, y, 98, 0, Math.PI * 2);
              c.fill();
            }
            if (!item(FRUITS[f.kind]!, x, y, 150, Math.sin(t / 300 + f.x) * 0.3)) {
              c.fillStyle = COLORS[f.kind]!;
              c.beginPath();
              c.arc(x, y, 72, 0, Math.PI * 2);
              c.fill();
            }
          }
        }
        for (const s of slashes) {
          c.strokeStyle = `rgba(255,255,255,${1 - s.t / 220})`;
          c.lineWidth = 14;
          c.beginPath();
          c.moveTo(s.x - 40, 50);
          c.lineTo(s.x + 40, GY);
          c.stroke();
        }
        // The knife and its line.
        c.strokeStyle = 'rgba(22,22,22,.55)';
        c.lineWidth = 4;
        c.setLineDash([12, 12]);
        c.beginPath();
        c.moveTo(knife, 36);
        c.lineTo(knife, GY);
        c.stroke();
        c.setLineDash([]);
        if (!item('knife', knife, GY - 95, 200, Math.PI / 4 + 0.1)) {
          c.fillStyle = '#dfe6ec';
          c.fillRect(knife - 6, GY - 150, 12, 130);
        }
        if (blast) boom(blast.x, blast.y, 420 * (0.6 + Math.min(1, blast.t / 150) * 0.4));
        outlineText(`FRUITS : ${cuts} / ${NEED}`, 1180, 135, 32, '#fff', 'right', 6);
      },
    };
  },
});
