import { g, INK, outlineText, shadow } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, fxRand, GY, hero } from '../common';
import { Pad, PAD_LEFT, PAD_RIGHT, PAD_Y } from '../pad';
import { boom } from '../props';

/**
 * ESQUIVE LA FUSÉE ! — three rockets, one after the other, each announced by
 * a red warning: low or high dashes across the screen, a dive at where you
 * stand, or a homing one. Run left / right and jump to dodge them all.
 */
const HERO = 280;
const GRAVITY = 0.0032;
const JUMP_V = 1.25;
const HIT_R = 62;
/** Height of the hero's middle above the feet. */
const MID = 120;

type Kind = 'low' | 'high' | 'dive' | 'homing';
interface Rocket {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  warn: number;
  life: number;
  /** Dive: where it will hit the ground. */
  tx: number;
}

export default defineMicrogame({
  id: 'fusee',
  verb: 'ESQUIVE LA FUSÉE !',
  create(ctx) {
    const me = hero(ctx);
    const speed = byLevel(ctx, 0.56, 0.58, 0.6);
    const pace = byLevel(ctx, 1, 1.08, 1.16);
    const kinds: Kind[] = ['low', 'high', 'dive', 'homing'];
    let at = ctx.rng.range(1100, 1300);
    const queue = [0, 1, 2].map(() => {
      const kind = ctx.rng.pick(kinds);
      const o = { kind, at, side: ctx.rng.chance(0.5) ? -1 : 1 };
      at += (kind === 'homing' ? 1700 : 1250) / pace;
      return o;
    });
    const pad = new Pad(
      ctx,
      [
        { action: 'left', label: '◀', x: PAD_LEFT[0]!, y: PAD_Y, keys: ['left'] },
        { action: 'right', label: '▶', x: PAD_LEFT[1]!, y: PAD_Y, keys: ['right'] },
        { action: 'jump', label: 'SAUTE', x: PAD_RIGHT[0]!, y: PAD_Y, keys: ['up'], big: true },
      ],
      { tap: 'jump' },
    );
    let x = 640;
    let y = 0;
    let vy = 0;
    let face = false;
    let next = 0;
    let rocket: Rocket | null = null;
    let trail: [number, number][] = [];
    let blast: { x: number; y: number; t: number } | null = null;
    let hit = false;
    const jump = () => {
      if (y > 0 || hit) return;
      vy = JUMP_V;
      me.force('start');
      ctx.sfx('jump');
    };
    const launch = (o: (typeof queue)[number]) => {
      const px = x;
      if (o.kind === 'low' || o.kind === 'high') {
        rocket = { kind: o.kind, x: o.side < 0 ? -120 : 1400, y: o.kind === 'low' ? GY - 60 : GY - 230, vx: -o.side * 1.05 * pace, vy: 0, warn: 500, life: 2200, tx: 0 };
      } else if (o.kind === 'dive') {
        const sx = o.side < 0 ? 120 : 1160;
        const sy = -80;
        const d = Math.hypot(px - sx, GY - 40 - sy);
        rocket = { kind: 'dive', x: sx, y: sy, vx: ((px - sx) / d) * 0.9 * pace, vy: ((GY - 40 - sy) / d) * 0.9 * pace, warn: 450, life: 1800, tx: px };
      } else rocket = { kind: 'homing', x: o.side < 0 ? -100 : 1380, y: GY - 300, vx: 0, vy: 0, warn: 350, life: 1600, tx: 0 };
      trail = [];
      ctx.sfx('whoosh');
    };
    const explode = (bx: number, by: number, onMe: boolean) => {
      blast = { x: bx, y: by, t: 0 };
      rocket = null;
      trail = [];
      ctx.sfx('boom');
      ctx.shake(onMe ? 300 : 120);
      if (!onMe) return;
      hit = true;
      me.force('hurt');
      ctx.lose();
    };
    return {
      input(e) {
        for (const ev of pad.input(e)) if (ev.down && ev.action === 'jump') jump();
      },
      update(dt, t) {
        me.update(dt);
        if (blast && (blast.t += dt) > 450) blast = null;
        if (hit) return;
        const dir = pad.axis('left', 'right');
        x = Math.max(60, Math.min(1220, x + dir * speed * dt));
        if (dir) face = dir < 0;
        if (y > 0 || vy > 0) {
          vy -= GRAVITY * dt;
          y = Math.max(0, y + vy * dt);
          if (y <= 0 && vy < 0) {
            vy = 0;
            me.force('stop');
          }
        } else if (dir && me.pose !== 'run' && me.pose !== 'start') me.set('run');
        else if (!dir && me.pose === 'run') me.set('stop');
        if (me.pose === 'start' && y <= 0 && me.t > 220) me.set(dir ? 'run' : 'idle');
        const o = queue[next];
        if (!rocket && o && t >= o.at) {
          launch(o);
          next += 1;
        }
        const r = rocket as Rocket | null;
        if (r) {
          if (r.warn > 0) r.warn -= dt;
          else {
            if (r.kind === 'homing') {
              const dx = x - r.x;
              const dy = GY - MID - y - r.y;
              const d = Math.hypot(dx, dy) || 1;
              const k = Math.min(1, dt / 260);
              r.vx += ((dx / d) * 0.62 * pace - r.vx) * k;
              r.vy += ((dy / d) * 0.62 * pace - r.vy) * k;
            }
            r.x += r.vx * dt;
            r.y += r.vy * dt;
            r.life -= dt;
            trail.push([r.x, r.y]);
            if (trail.length > 18) trail.shift();
            if (r.kind === 'dive' && r.y >= GY - 40) explode(r.x, GY - 60, Math.abs(r.x - x) < 110 && y < 90);
            else if (Math.hypot(r.x - x, r.y - (GY - MID - y)) < HIT_R) explode(r.x, r.y, true);
            else if (r.life <= 0 || r.x < -200 || r.x > 1480) {
              rocket = null;
              trail = [];
            }
          }
        }
        if (!hit && next >= queue.length && !rocket && t > queue[queue.length - 1]!.at + 300 && !ctx.outcome) ctx.win();
      },
      timeout: () => (hit ? 'failure' : 'success'),
      draw(t) {
        sceneBg('ville', GY);
        const c = g();
        const r = rocket as Rocket | null;
        if (r && r.warn > 0) {
          c.save();
          c.globalAlpha = Math.sin(t / 50) > 0 ? 1 : 0.4;
          if (r.kind === 'dive') {
            outlineText('▼', r.x, 70, 70, '#ff3b3b', 'center', 8);
            c.strokeStyle = 'rgba(255,59,59,.5)';
            c.lineWidth = 6;
            c.setLineDash([16, 12]);
            c.beginPath();
            c.moveTo(r.x, r.y);
            c.lineTo(r.tx, GY - 40);
            c.stroke();
            c.setLineDash([]);
          } else outlineText(r.x < 640 ? '▶' : '◀', r.x < 640 ? 60 : 1220, Math.max(60, r.y), 80, '#ff3b3b', 'center', 8);
          c.restore();
        }
        if (r && r.warn <= 0) {
          trail.forEach(([px, py], i) => {
            const k = i / trail.length;
            c.fillStyle = `rgba(255,${(140 + k * 100) | 0},60,${k * 0.7})`;
            c.beginPath();
            c.arc(px, py, 6 + k * 16, 0, Math.PI * 2);
            c.fill();
          });
          c.save();
          c.translate(r.x, r.y);
          c.rotate(Math.atan2(r.vy, r.vx));
          c.strokeStyle = INK;
          c.lineWidth = 5;
          c.fillStyle = '#ff4f4f';
          c.beginPath();
          c.moveTo(52, 0);
          c.quadraticCurveTo(30, -22, -30, -20);
          c.lineTo(-30, 20);
          c.quadraticCurveTo(30, 22, 52, 0);
          c.fill();
          c.stroke();
          c.fillStyle = '#fff';
          c.beginPath();
          c.arc(10, 0, 9, 0, Math.PI * 2);
          c.fill();
          c.stroke();
          c.fillStyle = '#ffd23c';
          for (const s of [-1, 1]) {
            c.beginPath();
            c.moveTo(-18, s * 18);
            c.lineTo(-40, s * 36);
            c.lineTo(-34, s * 16);
            c.closePath();
            c.fill();
            c.stroke();
          }
          c.fillStyle = '#ffb020';
          c.beginPath();
          c.moveTo(-32, -11);
          c.lineTo(-62 - fxRand(0, 20), 0);
          c.lineTo(-32, 11);
          c.closePath();
          c.fill();
          c.restore();
        }
        shadow(x, GY, Math.max(40, 100 - y / 4));
        me.draw(x, GY - y, HERO, { flip: face, shadow: false });
        if (blast) boom(blast.x, blast.y, 380 * (0.6 + Math.min(1, blast.t / 150) * 0.4));
        outlineText(`FUSÉES : ${queue.length - next + (rocket ? 1 : 0)}`, 1180, 135, 30, '#fff', 'right', 6);
        pad.draw();
      },
    };
  },
});
