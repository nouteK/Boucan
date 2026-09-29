import { circle, g, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero, npc } from '../common';

/**
 * BAISSE-TOI ! — the others throw dodgeballs at head height: tap (or ↓) to
 * duck just before each one arrives. A duck lasts about half a second.
 */
const X = 420;
/** The duck animation needs this long before the head is really down. */
const DOWN_AFTER = 60;
const DUCK_MS = 520;
const COOLDOWN_MS = 90;
const BALL_Y = GY - 255;
const FLIGHT_MS = 1000;

export default defineMicrogame({
  id: 'baisse',
  verb: 'BAISSE-TOI !',
  create(ctx) {
    const me = hero(ctx);
    const throwers = [0, 1, 2].map((i) => npc(ctx, i));
    const arrivals = byLevel(ctx, [0.42, 0.74], [0.32, 0.56, 0.8], [0.28, 0.5, 0.72]);
    const balls = arrivals.map((k) => ({
      at: ctx.duration * k,
      y: BALL_Y + ctx.rng.range(-10, 10),
      x: 1400,
      state: 'wait' as 'wait' | 'fly' | 'gone' | 'bounce',
      vx: 0,
      vy: 0,
      rot: 0,
    }));
    let duckT = -1;
    let cooldown = 0;
    let hurt = false;
    return {
      input(e) {
        const pressed = e.type === 'down' || (e.type === 'key' && !e.repeat && e.key === 'down');
        if (!pressed || hurt || cooldown > 0 || duckT >= 0) return;
        duckT = 0;
        me.force('duck');
        ctx.sfx('whoosh');
      },
      update(dt, t) {
        me.update(dt);
        throwers.forEach((a) => a.update(dt));
        cooldown = Math.max(0, cooldown - dt);
        if (duckT >= 0) {
          duckT += dt;
          if (duckT > DUCK_MS + DOWN_AFTER) {
            duckT = -1;
            cooldown = COOLDOWN_MS;
            if (!hurt) me.force('stop');
          }
        }
        const down = duckT >= DOWN_AFTER;
        for (const [i, b] of balls.entries()) {
          if (b.state === 'wait' && t >= b.at - FLIGHT_MS) {
            b.state = 'fly';
            throwers[i % 3]!.force('throw');
          }
          if (b.state === 'fly') {
            b.x = 1400 - ((1400 - X) * (t - (b.at - FLIGHT_MS))) / FLIGHT_MS;
            b.rot -= dt * 0.02;
            if (!hurt && Math.abs(b.x - X) < 70 && !down) {
              hurt = true;
              b.state = 'bounce';
              b.vx = 0.4;
              b.vy = -0.8;
              duckT = -1;
              me.force('hurt');
              ctx.sfx('hit');
              ctx.shake(220);
              ctx.lose();
            } else if (b.x < -60) b.state = 'gone';
          } else if (b.state === 'bounce') {
            b.vy += 0.003 * dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
          }
        }
        if (!ctx.outcome && balls.every((b) => b.state === 'gone')) {
          ctx.win();
          me.force('win');
        }
      },
      timeout: () => (hurt ? 'failure' : 'success'),
      draw() {
        sceneBg('prairie', GY, 0, false, 'baisse');
        throwers.forEach((a, i) => a.draw(1070 + i * 75, GY, 200 + i * 12, { flip: true }));
        me.draw(X, GY);
        const c = g();
        for (const b of balls) {
          if (b.state !== 'fly' && b.state !== 'bounce') continue;
          if (b.state === 'fly') {
            c.strokeStyle = 'rgba(255,255,255,.75)';
            c.lineWidth = 6;
            for (let k = 1; k < 4; k++) {
              c.beginPath();
              c.moveTo(b.x + 30 + k * 18, b.y - 12 + k * 8);
              c.lineTo(b.x + 60 + k * 18, b.y - 12 + k * 8);
              c.stroke();
            }
          }
          c.save();
          c.translate(b.x, b.y);
          c.rotate(b.rot);
          circle(0, 0, 30, '#ff5a4a', 6);
          c.strokeStyle = '#fff';
          c.lineWidth = 5;
          c.beginPath();
          c.arc(0, 0, 20, 0.4, 2.4);
          c.stroke();
          c.restore();
        }
        if (hurt) outlineText('PAF !', X + 200, GY - 340, 56, '#fff');
      },
    };
  },
});
