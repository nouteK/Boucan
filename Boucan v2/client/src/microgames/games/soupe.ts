import { ellipse, g, INK, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero, isPress } from '../common';
import { drone, potion } from '../props';

/** REMPLIS LA FIOLE ! — a drone sweeps left and right: tap to drop its potion when it is right above your flask. */
const X = 430;
const BX = X + 80;
const BY = GY - 118;
const DRONE_Y = 150;
const POUR_MS = 350;
const LIQUID = '#35e0ff';

export default defineMicrogame({
  id: 'soupe',
  verb: 'REMPLIS LA FIOLE !',
  create(ctx) {
    const me = hero(ctx, 'hold');
    const phase = ctx.rng.range(0, Math.PI * 2);
    const speed = ctx.rng.range(0.0017, 0.0023) * byLevel(ctx, 1, 1.2, 1.4);
    const tolerance = byLevel(ctx, 105, 90, 75);
    let clock = 0;
    let pour: { x: number; t: number } | null = null;
    let result: 'win' | 'lose' | null = null;
    const lx = () => 700 + 380 * Math.sin(phase + clock * speed);
    return {
      input(e) {
        if (!isPress(e) || pour) return;
        pour = { x: lx(), t: 0 };
        ctx.sfx('whoosh');
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        if (!pour || result || (pour.t += dt) < POUR_MS) return;
        result = Math.abs(pour.x - BX) < tolerance ? 'win' : 'lose';
        if (result === 'win') {
          me.force('catch');
          ctx.sfx('pop');
          ctx.win();
        } else {
          me.force('hurt');
          ctx.sfx('splash');
          ctx.shake(200);
          ctx.lose();
        }
      },
      timeout: () => (result === 'win' ? 'success' : 'failure'),
      draw(t) {
        sceneBg('prairie', GY, 0, false, 'soupe');
        me.draw(X, GY);
        potion(BX + 8, BY + 20, 1.1, result === 'win' ? 0.95 : 0, LIQUID);
        const x = pour ? pour.x : lx();
        drone(x, DRONE_Y, t, pour ? 0 : Math.cos(phase + clock * speed) * 0.15, 1.25);
        const c = g();
        if (!pour) {
          c.fillStyle = LIQUID;
          c.strokeStyle = INK;
          c.lineWidth = 5;
          c.beginPath();
          c.moveTo(x, DRONE_Y + 34);
          c.quadraticCurveTo(x + 18, DRONE_Y + 62, x, DRONE_Y + 70);
          c.quadraticCurveTo(x - 18, DRONE_Y + 62, x, DRONE_Y + 34);
          c.fill();
          c.stroke();
        } else if (pour.t < POUR_MS + 10) {
          const y2 = DRONE_Y + 40 + Math.min(1, pour.t / POUR_MS) * (BY - 60 - DRONE_Y - 40);
          c.strokeStyle = LIQUID;
          c.lineWidth = 16;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(pour.x, DRONE_Y + 40);
          c.lineTo(pour.x, y2);
          c.stroke();
        }
        if (result === 'lose' && pour) {
          ellipse(pour.x, GY - 6, 70, 14, LIQUID, 5);
          outlineText('À CÔTÉ !', pour.x, GY - 330, 50, '#fff');
        }
        // Where the flask is.
        c.strokeStyle = 'rgba(255,255,255,.6)';
        c.lineWidth = 4;
        c.setLineDash([10, 12]);
        c.beginPath();
        c.moveTo(BX + 8, DRONE_Y + 90);
        c.lineTo(BX + 8, BY - 110);
        c.stroke();
        c.setLineDash([]);
      },
    };
  },
});
