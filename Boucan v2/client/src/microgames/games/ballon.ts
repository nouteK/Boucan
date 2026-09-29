import { box, circle, g, INK, item, outlineText, shadow, star } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero, npc } from '../common';

/**
 * VISE LE RENARD ! — a friend runs about in the dunes: hold to wind up the
 * water balloon and let go when the power gauge is on the red mark (the
 * distance of the target). Touch / click / Space / ↑, held.
 */
const FLIGHT_MS = 700;
/** Camera: the field runs away from you (metres, depth up to ~12). */
const F = 700;
const CAM_Y = 1.6;
const HORIZON = 270;
const project = (x: number, y: number, z: number) => {
  const d = z + 2.5;
  return { x: 640 + (F * x) / d, y: HORIZON - (F * (y - CAM_Y)) / d, s: F / d };
};
const depth = (p: number) => 1 + p * 11;

export default defineMicrogame({
  id: 'ballon',
  verb: 'VISE LE RENARD !',
  create(ctx) {
    const me = hero(ctx);
    const target = npc(ctx, 0, 'run');
    const tolerance = byLevel(ctx, 0.1, 0.085, 0.07);
    const fillMs = byLevel(ctx, 1500, 1300, 1150);
    const goal = ctx.rng.range(0.35, 0.85);
    const phase = ctx.rng.range(0, 6);
    let power = 0;
    let holding = false;
    let charging = false;
    let clock = 0;
    let shot: { t: number; p: number } | null = null;
    let result: 'win' | 'lose' | null = null;
    let resultT = 0;
    const release = () => {
      holding = false;
      if (!charging || shot) return;
      charging = false;
      shot = { t: 0, p: power };
      me.force('throw');
      ctx.sfx('jump');
    };
    return {
      input(e) {
        if (result || shot) return;
        if (e.type === 'down' || (e.type === 'key' && (e.key === 'up' || e.key === 'down'))) holding = true;
        else if (e.type === 'up' || (e.type === 'keyup' && (e.key === 'up' || e.key === 'down'))) release();
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        target.update(dt);
        if (!shot && holding) {
          charging = true;
          power = Math.min(1.1, power + dt / fillMs);
        }
        if (shot && !result && (shot.t += dt) >= FLIGHT_MS) {
          result = Math.abs(shot.p - goal) < tolerance ? 'win' : 'lose';
          if (result === 'win') {
            ctx.sfx('splash');
            ctx.shake(120);
            ctx.win();
          } else {
            ctx.sfx('hurt');
            ctx.lose();
          }
        }
        if (result) resultT += dt;
      },
      timeout: () => (result === 'win' ? 'success' : 'failure'),
      draw() {
        sceneBg('desert', GY, 0, false, 'ballon');
        const c = g();
        // The field in perspective.
        const far = project(0, 0, 14).y;
        const sand = c.createLinearGradient(0, far, 0, 720);
        sand.addColorStop(0, '#f6d27f');
        sand.addColorStop(1, '#e5b45a');
        c.fillStyle = sand;
        c.fillRect(0, far, 1280, 720 - far);
        c.strokeStyle = 'rgba(255,255,255,.3)';
        c.lineWidth = 2;
        for (let k = 0; k <= 10; k++) {
          const y = project(0, 0, k * 1.3).y;
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(1280, y);
          c.stroke();
        }
        // The target, running along its distance.
        const z = depth(goal);
        const fx = Math.sin(phase + clock / 700) * 180;
        const fq = project(fx / 140, 0, z);
        c.fillStyle = 'rgba(255,60,60,.35)';
        c.beginPath();
        c.ellipse(640, project(0, 0, z).y, 0.9 * fq.s, 0.25 * fq.s, 0, 0, Math.PI * 2);
        c.fill();
        target.draw(fq.x, fq.y, 1.4 * fq.s, { flip: Math.cos(phase + clock / 700) < 0, shadow: false });
        if (shot) {
          const k = Math.min(1, shot.t / FLIGHT_MS);
          const q = project(0, 1.2 + 3 * 4 * k * (1 - k), depth(shot.p * k));
          if (!item('wball', q.x, q.y, Math.max(16, 0.8 * q.s), k * 6)) circle(q.x, q.y, Math.max(8, 0.35 * q.s), '#3fb8ff', 4);
        }
        if (result && shot) {
          const q = project(0, 0, depth(shot.p));
          star(q.x, q.y - 20, Math.min(1, resultT / 800));
          outlineText(result === 'win' ? 'SPLASH !' : 'RATÉ', q.x, q.y - 80, 50, result === 'win' ? '#7dff9b' : '#fff');
        }
        // You, the balloon in hand growing with the power.
        shadow(430, GY + 10, 110);
        me.draw(430, GY + 10, 297, { shadow: false });
        if (!shot && !item('wball', 560, 440, (26 + power * 50) * 2.3)) circle(560, 440, 26 + power * 50, '#3fb8ff', 5);
        // Power gauge with the red mark.
        const X0 = 1180;
        const Y0 = 160;
        const HH = 340;
        box(X0 - 22, Y0 - 8, 44, HH + 16, INK, 0, 12);
        c.fillStyle = '#ffe04a';
        c.fillRect(X0 - 14, Y0 + HH * (1 - Math.min(1, power)), 28, HH * Math.min(1, power));
        c.fillStyle = '#ff3b3b';
        c.fillRect(X0 - 30, Y0 + HH * (1 - goal) - 4, 60, 8);
        outlineText('FORCE', X0, Y0 - 22, 22, '#fff', 'center', 5);
        if (!shot && clock > 950) outlineText('MAINTIENS, LÂCHE SUR LE TRAIT ROUGE', 640, 110, 30, '#fff', 'center', 6);
      },
    };
  },
});
