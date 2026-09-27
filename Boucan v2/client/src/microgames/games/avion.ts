import { box, g, outlineText, poly } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { classeBg } from '../backdrops';
import { byLevel, GY, hero } from '../common';

/** LANCE L'AVION ! — the aim swings: tap to throw the paper plane into the bin. */
export default defineMicrogame({
  id: 'avion',
  verb: "LANCE L'AVION !",
  create(ctx) {
    const me = hero(ctx);
    const X = 200;
    const launch = { x: X + 90, y: GY - 200 };
    const binX = ctx.rng.range(byLevel(ctx, 760, 820, 880), byLevel(ctx, 960, 1060, 1120));
    const binW = byLevel(ctx, 150, 120, 96);
    const binTop = GY - 150;
    const swing = byLevel(ctx, 0.0032, 0.0042, 0.0052);
    const phase = ctx.rng.range(0, 6);
    let clock = 0;
    let plane: { x: number; y: number; vx: number; vy: number; rot: number } | null = null;
    let landed: 'in' | 'out' | null = null;
    const angle = () => -0.25 - 0.45 * (0.5 + 0.5 * Math.sin(phase + clock * swing));
    return {
      input(e) {
        if (e.type !== 'down' || plane) return;
        const a = angle();
        plane = { x: launch.x, y: launch.y, vx: Math.cos(a) * 1.25, vy: Math.sin(a) * 1.25, rot: a };
        me.force('punch');
        ctx.sfx('whoosh');
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        if (!plane || landed) return;
        plane.vy += 0.0019 * dt;
        plane.x += plane.vx * dt;
        plane.y += plane.vy * dt;
        plane.rot = Math.atan2(plane.vy, plane.vx);
        if (plane.vy > 0 && plane.y >= binTop && plane.y < binTop + 30 && Math.abs(plane.x - binX) < binW / 2) {
          landed = 'in';
          me.force('win');
          ctx.sfx('pop');
          ctx.win();
        } else if (plane.y > GY - 10 || plane.x > 1300) {
          landed = 'out';
          plane.y = Math.min(plane.y, GY - 10);
          me.force('lose');
          ctx.lose();
        }
      },
      draw(t) {
        classeBg(t, GY);
        me.draw(X, GY);
        box(binX - binW / 2, binTop, binW, GY - binTop, '#6b7b8c', 7);
        box(binX - binW / 2 - 10, binTop - 12, binW + 20, 20, '#8e9fb2', 6);
        if (!plane) {
          const c = g();
          const a = angle();
          c.save();
          c.translate(launch.x, launch.y);
          c.rotate(a);
          c.setLineDash([16, 12]);
          c.strokeStyle = '#fff';
          c.lineWidth = 7;
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(230, 0);
          c.stroke();
          c.setLineDash([]);
          poly([[230, -18], [262, 0], [230, 18]], '#fff', 5);
          c.restore();
        }
        const p = plane ?? { x: launch.x, y: launch.y, rot: angle() };
        const c = g();
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        poly([[-40, -14], [40, 0], [-40, 14], [-26, 0]], '#fff', 5);
        c.restore();
        if (landed === 'in') outlineText('PANIER !', binX, binTop - 90, 60, '#ffe04a');
        if (landed === 'out') outlineText('RATÉ', p.x, GY - 120, 56, '#fff');
      },
    };
  },
});
