import { drawSprite } from '../../engine/assets';
import { box, circle, ellipse, g, INK, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero } from '../common';
import { gauge } from '../props';

/**
 * RESTE SUR LA RAMPE ! — skating down a narrow ramp that keeps pushing you
 * sideways: lean the other way (hold a side of the screen, or ← →) to stay
 * on it until the end. Off the edge = gamelle.
 */
const VP = [1080, 250] as const;
const NEAR_L = [70, 640] as const;
const NEAR_R = [830, 640] as const;
const DEPTH = 300;
/** Distance of the skater along the ramp (constant: the ramp scrolls). */
const RIDER_D = 40;
/** calm = time for the push to build up (the instruction is still on screen). */
const P = { drift: 1.8e-6, grow: 3000, calm: 1200, unstable: 1.4e-6, lean: 4e-6, damp: 420, speed: 0.62 };

/** Ground point at distance d along the ramp, lateral u in [-1, 1]. */
function at(d: number, u: number): { x: number; y: number; p: number } {
  const p = DEPTH / (DEPTH + d);
  const k = (u + 1) / 2;
  const ox = NEAR_L[0] + (NEAR_R[0] - NEAR_L[0]) * k;
  const oy = NEAR_L[1] + (NEAR_R[1] - NEAR_L[1]) * k;
  return { x: VP[0] + (ox - VP[0]) * p, y: VP[1] + (oy - VP[1]) * p, p };
}

export default defineMicrogame({
  id: 'skate',
  verb: 'RESTE SUR LA RAMPE !',
  create(ctx) {
    const me = hero(ctx, 'duck');
    const strength = byLevel(ctx, 0.75, 0.9, 1.05);
    // The same pushes for everyone, drawn in advance: [time, direction] and [time, kick].
    const flips: [number, number][] = [];
    let side = ctx.rng.chance(0.5) ? -1 : 1;
    for (let t = ctx.rng.range(600, 1300); t < ctx.duration + 2000; t += ctx.rng.range(600, 1400)) {
      if (ctx.rng.chance(0.7)) side = -side;
      flips.push([t, side]);
    }
    const bumps: [number, number][] = [];
    for (let t = ctx.rng.range(900, 1600); t < ctx.duration + 2000; t += ctx.rng.range(700, 1500)) {
      bumps.push([t, (ctx.rng.chance(0.5) ? -1 : 1) * ctx.rng.range(0.0005, 0.0009) * strength]);
    }
    let push = ctx.rng.chance(0.5) ? -1 : 1;
    let u = ctx.rng.range(-0.15, 0.15);
    let w = 0;
    let dir = 0;
    let clock = 0;
    let nextFlip = 0;
    let nextBump = 0;
    let gustT = 0;
    let fell: { t: number; x: number; y: number; vx: number; vy: number; r: number } | null = null;
    return {
      input(e) {
        if (fell) return;
        if (e.type === 'down' && e.x !== null) {
          dir = e.x < 640 ? -1 : 1;
          w += dir * 0.0006;
          ctx.sfx('tap');
        } else if (e.type === 'up') dir = 0;
        else if (e.type === 'key' && (e.key === 'left' || e.key === 'right')) dir = e.key === 'left' ? -1 : 1;
        else if (e.type === 'keyup' && (e.key === 'left' || e.key === 'right') && dir === (e.key === 'left' ? -1 : 1)) dir = 0;
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        if (fell) {
          fell.t += dt;
          fell.x += fell.vx * dt;
          fell.vy += 0.003 * dt;
          fell.y += fell.vy * dt;
          fell.r += dt * 0.012 * Math.sign(fell.vx);
          return;
        }
        while (flips[nextFlip] && flips[nextFlip]![0] <= t) push = flips[nextFlip++]![1];
        while (bumps[nextBump] && bumps[nextBump]![0] <= t) {
          w += bumps[nextBump++]![1];
          gustT = 300;
        }
        gustT -= dt;
        const grow = Math.min(1, t / P.calm) * (1 + t / P.grow);
        w += (push * P.drift * strength * grow + u * P.unstable + dir * P.lean) * dt;
        w *= Math.exp(-dt / P.damp);
        u += w * dt;
        if (Math.abs(u) > 1 && !ctx.outcome) {
          const q = at(RIDER_D, u);
          fell = { t: 0, x: q.x, y: q.y, vx: Math.sign(u) * 0.45, vy: -0.6, r: 0 };
          me.force('hurt');
          ctx.sfx('hurt');
          ctx.shake(260);
          ctx.lose();
        }
      },
      timeout: () => (fell ? 'failure' : 'success'),
      draw() {
        const c = g();
        sceneBg('ville', GY);
        c.fillStyle = 'rgba(20,15,40,.25)';
        c.fillRect(0, 0, 1280, 720);
        const far = 1e5;
        const L0 = at(-80, -1);
        const R0 = at(-80, 1);
        const Lf = at(far, -1);
        const Rf = at(far, 1);
        // Ramp sides, deck, speed stripes, lane lines, dangerous edges.
        c.fillStyle = '#3d4650';
        for (const [a, b] of [[L0, Lf], [R0, Rf]] as const) {
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.lineTo(b.x, b.y + 2);
          c.lineTo(a.x, a.y + 56);
          c.closePath();
          c.fill();
        }
        const grd = c.createLinearGradient(0, VP[1], 0, 720);
        grd.addColorStop(0, '#eef2f5');
        grd.addColorStop(1, '#8f9ba6');
        c.fillStyle = grd;
        c.beginPath();
        c.moveTo(L0.x, L0.y);
        c.lineTo(Lf.x, Lf.y);
        c.lineTo(Rf.x, Rf.y);
        c.lineTo(R0.x, R0.y);
        c.closePath();
        c.fill();
        const scroll = (clock * P.speed) % 70;
        for (let k = 0; k < 70; k++) {
          const d = k * 70 - scroll - 60;
          if (d < -80) continue;
          const a = at(d, -1);
          const b = at(d, 1);
          if (a.p < 0.05) break;
          c.strokeStyle = `rgba(60,70,80,${0.45 * Math.min(1, a.p * 1.5)})`;
          c.lineWidth = Math.max(1, 6 * a.p);
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
        }
        for (const lane of [-0.5, 0, 0.5]) {
          const a = at(-80, lane);
          const b = at(far, lane);
          c.strokeStyle = 'rgba(255,255,255,.35)';
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
        }
        for (const [a, b] of [[L0, Lf], [R0, Rf]] as const) {
          c.strokeStyle = INK;
          c.lineWidth = 12;
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
          c.strokeStyle = '#ffd23c';
          c.lineWidth = 6;
          c.setLineDash([22, 18]);
          c.lineDashOffset = -clock * P.speed * 0.6;
          c.stroke();
          c.setLineDash([]);
        }
        const board = (x: number, y: number, r: number) => {
          if (drawSprite('skate', 'skateboard', 0, x, y, 38, false, r)) return;
          box(x - 95, y - 14, 190, 18, '#ff4f7b', 5, 9);
          circle(x - 60, y + 10, 9, INK, 0);
          circle(x + 60, y + 10, 9, INK, 0);
        };
        if (fell) {
          board(fell.x + fell.vx * 80, fell.y + 40, fell.r * 1.5);
          me.draw(fell.x, fell.y, 216, { rot: fell.r, shadow: false });
          outlineText('GAMELLE !', 640, 250, 64, '#fff');
        } else {
          const q = at(RIDER_D, u);
          const ang = Math.atan2(VP[1] - q.y, VP[0] - q.x) * 0.35;
          const lean = Math.max(-0.5, Math.min(0.5, w * 260));
          ellipse(q.x, q.y + 4, 95 * q.p, 16 * q.p, 'rgba(0,0,0,.28)', 0, ang);
          c.save();
          c.translate(q.x, q.y - 16);
          c.rotate(ang);
          board(0, 0, 0);
          me.draw(0, -16, 222, { rot: lean, shadow: false });
          c.restore();
          if (Math.abs(u) > 0.7) {
            c.save();
            c.globalAlpha = 0.5 + 0.5 * Math.sin(clock / 60);
            outlineText('!', q.x, q.y - 250, 70, '#ff5a4a');
            c.restore();
          }
          if (gustT > 0) outlineText(w > 0 ? '→' : '←', q.x + (w > 0 ? 150 : -150), q.y - 160, 64, '#fff');
        }
        // Where you are on the ramp.
        outlineText('POSITION', 640, 96, 22, '#fff');
        gauge(490, 118, 300, 14, 1, '#2fd07a');
        box(476, 114, 22, 22, '#ff5a4a', 4, 4);
        box(782, 114, 22, 22, '#ff5a4a', 4, 4);
        circle(640 + Math.max(-1.1, Math.min(1.1, u)) * 150, 125, 15, '#fff', 4);
      },
    };
  },
});
