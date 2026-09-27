import { circle, ellipse, g, INK, outlineText, poly, slam, star } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { recreBg } from '../backdrops';
import { between, byLevel, GY, hero, isPress, npc } from '../common';

/**
 * MARQUE UN BUT ! — the goalkeeper throws the ball at you: tap to kick it
 * right when it reaches your foot. Too early or too late, it bonks you.
 */
const X = 330;
const FOOT_X = X + 143;
const FOOT_Y = GY - 144;
/** Kick animation: the foot is out between these times (ms since the kick started). */
const KICK_ON = 70;
const KICK_OFF = 220;
const GOAL_X = 1120;

export default defineMicrogame({
  id: 'but',
  verb: 'MARQUE UN BUT !',
  create(ctx) {
    const me = hero(ctx);
    const keeper = npc(ctx, 0);
    const wait = between(ctx, 400, 1200);
    const flight = byLevel(ctx, between(ctx, 720, 900), between(ctx, 620, 800), between(ctx, 520, 700));
    let state: 'wait' | 'fly' | 'shot' | 'bonk' = 'wait';
    let t = 0;
    let bx = GOAL_X + 10;
    let by = GY - 140;
    let vx = 0;
    let vy = 0;
    let spin = 0;
    let shotT = 0;
    let goal = false;
    let goalT = 0;
    return {
      input(e) {
        if (!isPress(e) || ctx.outcome || state === 'shot' || state === 'bonk') return;
        if (me.pose !== 'kick' || me.t > KICK_OFF) {
          me.force('kick');
          ctx.sfx('tap');
        }
      },
      update(dt, time) {
        me.update(dt);
        keeper.update(dt);
        spin += dt * (state === 'shot' ? 0.03 : -0.02);
        if (state === 'wait') {
          if (time >= wait) state = 'fly';
          return;
        }
        if (state === 'fly') {
          t += dt;
          const p = Math.min(1.25, t / flight);
          bx = GOAL_X + 10 + (FOOT_X - GOAL_X - 10) * p;
          by = GY - 140 + (FOOT_Y - (GY - 140)) * p - 220 * 4 * p * (1 - p);
          const kicking = me.pose === 'kick' && me.t >= KICK_ON && me.t < KICK_OFF;
          if (kicking && Math.abs(bx - FOOT_X) < 60 && Math.abs(by - FOOT_Y) < 80) {
            state = 'shot';
            vx = 2.6;
            vy = -0.35;
            ctx.sfx('hit');
            ctx.shake(120);
          } else if (bx < X + 20) {
            state = 'bonk';
            vx = 0.4;
            vy = -0.7;
            me.force('hurt');
            ctx.sfx('hurt');
            ctx.shake(220);
            ctx.lose();
          }
        } else if (state === 'shot') {
          shotT += dt;
          bx += vx * dt;
          vy += 0.0006 * dt;
          by += vy * dt;
          if (!goal && bx > GOAL_X + 30) {
            goal = true;
            ctx.win();
            me.force('win');
          }
          if (goal) {
            goalT += dt;
            bx = Math.min(bx, 1240);
          }
        } else {
          vy += 0.003 * dt;
          bx += vx * dt;
          by = Math.min(GY - 30, by + vy * dt);
        }
      },
      timeout: () => (goal ? 'success' : 'failure'),
      draw(time) {
        recreBg(time, GY);
        const c = g();
        // Goal: posts, crossbar, net.
        c.strokeStyle = 'rgba(255,255,255,.55)';
        c.lineWidth = 3;
        for (let x = GOAL_X + 10; x < 1280; x += 22) {
          c.beginPath();
          c.moveTo(x, GY - 330);
          c.lineTo(x + 18, GY);
          c.stroke();
        }
        for (let y = GY - 310; y < GY; y += 26) {
          c.beginPath();
          c.moveTo(GOAL_X, y);
          c.lineTo(1280, y);
          c.stroke();
        }
        c.lineCap = 'round';
        c.strokeStyle = INK;
        c.lineWidth = 20;
        c.beginPath();
        c.moveTo(GOAL_X, GY);
        c.lineTo(GOAL_X, GY - 330);
        c.lineTo(1280, GY - 330);
        c.stroke();
        c.strokeStyle = '#fff';
        c.lineWidth = 11;
        c.stroke();
        // Keeper: dives the wrong way when it goes in.
        const dive = goal ? Math.min(1, goalT / 200) : 0;
        keeper.draw(1175 + dive * 30, GY, 250, { flip: true, rot: 0.9 * dive });
        me.draw(X, GY);
        if (state === 'fly' || state === 'wait') ellipse(bx, GY, 34, 8, 'rgba(0,0,0,.2)', 0);
        c.save();
        c.translate(bx, by);
        c.rotate(spin);
        circle(0, 0, 28, '#fff', 6);
        poly(
          Array.from({ length: 5 }, (_, i) => [Math.cos((i / 5) * Math.PI * 2) * 11, Math.sin((i / 5) * Math.PI * 2) * 11] as [number, number]),
          INK,
          0,
        );
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 0.6;
          circle(Math.cos(a) * 22, Math.sin(a) * 22, 5, INK, 0);
        }
        c.restore();
        if (state === 'shot' && shotT < 220) star(FOOT_X + 10, FOOT_Y, shotT / 220);
        if (goal) slam('BUT !', goalT, '#ffe04a', 820, GY - 400, 120);
        if (state === 'bonk') outlineText('BONK', X + 190, GY - 320, 56, '#fff');
      },
    };
  },
});
