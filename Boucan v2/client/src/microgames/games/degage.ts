import { box, g, outlineText, shadow } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, fxRand, GY, hero, isPress } from '../common';
import { bomb, boom } from '../props';

/**
 * SHOOTE LES BOMBES ! — four bombs bounce in on the beat: kick each one when
 * it is in the yellow zone at your foot. One slips through and it blows up.
 */
const X = 380;
const FOOT = X + 157;
const ZONE = [-60, 70] as const;
/** The foot is out during this part of the kick (ms since the kick started). */
const KICK_ON = 80;
const KICK_OFF = 220;
const N = 4;

interface Bomb {
  at: number;
  x: number;
  y: number;
  state: 'roll' | 'fly' | 'gone' | 'boom';
  vx: number;
  vy: number;
  spin: number;
  pow: number;
}

export default defineMicrogame({
  id: 'degage',
  verb: 'SHOOTE LES BOMBES !',
  create(ctx) {
    const me = hero(ctx);
    const beat = byLevel(ctx, 560, 520, 480);
    const v = byLevel(ctx, 0.8, 0.86, 0.92);
    const first = 1500;
    const bombs: Bomb[] = Array.from({ length: N }, (_, i) => ({ at: first + i * beat, x: 9999, y: GY, state: 'roll', vx: 0, vy: 0, spin: 0, pow: 0 }));
    let booms: { x: number; y: number; t: number; s: number }[] = [];
    let kickUsed = false;
    let lastBeat = -1;
    let ok = 0;
    let lost = false;
    let doneT = 0;
    const kicking = () => me.pose === 'kick' && me.t >= KICK_ON && me.t < KICK_OFF;
    const hop = (b: Bomb, t: number) => Math.abs(Math.sin((Math.PI * (b.at - t)) / beat)) * 46;
    return {
      input(e) {
        if (!isPress(e) || lost) return;
        if (me.pose !== 'kick' || me.t >= KICK_OFF) {
          me.force('kick');
          kickUsed = false;
          ctx.sfx('tap');
        }
      },
      update(dt, t) {
        me.update(dt);
        booms = booms.filter((b) => (b.t += dt) < 420);
        if (lost) return;
        // Metronome: a tick each time the bombs touch the ground.
        const beatNow = Math.floor((t - first) / beat + 0.5);
        if (beatNow !== lastBeat) {
          lastBeat = beatNow;
          if (bombs.some((b) => b.state === 'roll' && b.x < 1300)) ctx.sfx('tick');
        }
        for (const b of bombs) {
          if (b.state === 'roll') {
            b.x = FOOT + v * (b.at - t);
            const d = b.x - FOOT;
            if (kicking() && !kickUsed && d > ZONE[0] && d < ZONE[1]) {
              b.state = 'fly';
              b.vx = 2.4;
              b.vy = -1.25 - fxRand(0, 0.45);
              b.y = GY - 110;
              kickUsed = true;
              ok += 1;
              ctx.sfx('hit');
              ctx.shake(120);
            } else if (b.x < X + 70) {
              b.state = 'boom';
              lost = true;
              me.force('hurt');
              ctx.sfx('boom');
              ctx.shake(300);
              booms.push({ x: X + 60, y: GY - 170, t: 0, s: 480 });
              ctx.lose();
            }
          } else if (b.state === 'fly') {
            b.pow += dt;
            b.x += b.vx * dt;
            b.vy += 0.0022 * dt;
            b.y += b.vy * dt;
            b.spin += dt * 0.03;
            if (b.x > 1190) {
              b.state = 'gone';
              booms.push({ x: 1190, y: Math.max(140, b.y), t: 0, s: 300 });
              ctx.sfx('boom');
            }
          }
        }
        if (ok === N && bombs.every((b) => b.state === 'gone') && (doneT += dt) > 300 && !ctx.outcome) {
          ctx.win();
          me.force('win');
        }
      },
      timeout: () => (ok === N && !lost ? 'success' : 'failure'),
      draw(t) {
        sceneBg('prairie', GY, 0, false, 'degage');
        const lit = bombs.some((b) => b.state === 'roll' && b.x - FOOT > ZONE[0] && b.x - FOOT < ZONE[1]);
        box(FOOT + ZONE[0], GY - 7, ZONE[1] - ZONE[0], 14, lit ? 'rgba(255,224,74,.8)' : 'rgba(255,255,255,.35)', 5);
        for (let i = bombs.length - 1; i >= 0; i--) {
          const b = bombs[i]!;
          if (b.state !== 'roll' || b.x > 1420) continue;
          const d = b.x - FOOT;
          const h = hop(b, t);
          shadow(b.x, GY, 60 * (1 - h / 120));
          bomb(b.x, GY - h, 190, d > 500 ? 0 : d > 220 ? 1 : 2, true, Math.sin(t / 60 + i) * 0.14);
        }
        me.draw(X, GY);
        const c = g();
        for (const b of bombs) {
          if (b.state !== 'fly') continue;
          bomb(b.x, b.y, 160, 2, true, b.spin);
          if (b.pow < 240) {
            c.globalAlpha = 1 - b.pow / 240;
            outlineText('POW !', FOOT + 40, GY - 260, 60, '#ffe04a');
            c.globalAlpha = 1;
          }
        }
        for (const b of booms) boom(b.x, b.y, b.s * (0.65 + Math.min(1, b.t / 120) * 0.35));
        // Bombs to shoot.
        bombs.forEach((b, i) => {
          const x = 640 + (i - (N - 1) / 2) * 70;
          const done = b.state === 'fly' || b.state === 'gone';
          c.globalAlpha = b.state === 'roll' ? 0.45 : 1;
          bomb(x, 130, 60, b.state === 'boom' ? 2 : 0, false, 0);
          c.globalAlpha = 1;
          if (done) outlineText('✔', x + 18, 128, 30, '#7dff9b', 'center', 5);
        });
      },
    };
  },
});
