import { assets } from '../../engine/assets';
import { box, g, outlineText, shadow } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero, isPress } from '../common';
import { bomb, boom } from '../props';

/**
 * FERME LA PORTE ! — a bomb walks towards your hideout: drop the shutter
 * (one tap) right when it reaches the door. Too early and the shutter is
 * already back up; too late and it is inside. It sometimes stops to think…
 */
const DOOR_X = 980;
/** Shutter timeline (ms since the tap): closing, closed, opening again, then a short cooldown. */
const CLOSING = 110;
const CLOSED = 520;
const OPENING = 680;
const COOLDOWN = 350;

export default defineMicrogame({
  id: 'porte',
  verb: 'FERME LA PORTE !',
  create(ctx) {
    const me = hero(ctx);
    const [vMin, vMax] = byLevel(ctx, [0.42, 0.62], [0.5, 0.7], [0.58, 0.78]);
    const v = ctx.rng.range(vMin, vMax);
    const pause = ctx.rng.chance(0.6) ? { at: ctx.rng.range(250, 600), ms: ctx.rng.range(300, 600) } : null;
    let bx = -80;
    let thinking = false;
    let shutT = -1;
    let cooldown = 0;
    let door = 0;
    let result: 'win' | 'lose' | null = null;
    let resultT = 0;
    return {
      input(e) {
        if (!isPress(e) || result || cooldown > 0 || shutT >= 0) return;
        shutT = 0;
        ctx.sfx('whoosh');
      },
      update(dt) {
        me.update(dt);
        cooldown -= dt;
        if (shutT >= 0) {
          shutT += dt;
          door = shutT < CLOSING ? shutT / CLOSING : shutT < CLOSED ? 1 : Math.max(0, 1 - (shutT - CLOSED) / (OPENING - CLOSED));
          if (shutT > OPENING) {
            shutT = -1;
            cooldown = COOLDOWN;
          }
        }
        if (result) {
          resultT += dt;
          return;
        }
        if (pause && bx > pause.at) {
          thinking = true;
          pause.ms -= dt;
          if (pause.ms <= 0) {
            pause.at = Infinity;
            thinking = false;
          }
        } else bx += v * dt;
        if (bx >= DOOR_X - 60) {
          if (door > 0.9) {
            result = 'win';
            ctx.sfx('block');
            ctx.shake(100);
            me.force('win');
            ctx.win();
          } else {
            result = 'lose';
            ctx.sfx('boom');
            ctx.shake(300);
            me.force('hurt');
            ctx.lose();
          }
        }
      },
      timeout: () => (result === 'win' ? 'success' : 'failure'),
      draw(t) {
        sceneBg('tresor', GY, 0, false, 'porte');
        const c = g();
        // The hideout: a frame and its dark doorway.
        box(DOOR_X - 20, GY - 360, 260, 360, '#6b4a2b', 8);
        c.fillStyle = '#2a1a0e';
        c.fillRect(DOOR_X, GY - 330, 220, 330);
        if (result !== 'lose') bomb(bx, GY, 200, bx > DOOR_X - 400 ? 2 : bx > 300 ? 1 : 0, true, thinking ? Math.sin(t / 40) * 0.2 : Math.sin(t / 80) * 0.1);
        else if (resultT < 700) boom(DOOR_X - 40, GY - 150, 460);
        // The shutter comes down from its roll.
        const dh = 330 * door;
        const shutter = assets.image('shutter');
        if (shutter && dh > 2) {
          const w = 270;
          const h = (w * shutter.height) / shutter.width;
          c.save();
          c.beginPath();
          c.rect(DOOR_X - 30, GY - 372, 290, 42 + dh);
          c.clip();
          c.drawImage(shutter, DOOR_X - 25, GY - 372 - (h - 42 - 330) + (dh - 330), w, h);
          c.restore();
        } else if (dh > 2) box(DOOR_X, GY - 330, 220, dh, '#9aa6b1', 6);
        shadow(1150, GY, 90);
        me.draw(1150, GY, 264, { flip: true, shadow: false });
        if (thinking) outlineText('?!', bx, GY - 240, 50, '#fff');
        if (result === 'win') outlineText('CLAC !', DOOR_X + 110, GY - 420, 64, '#7dff9b');
      },
    };
  },
});
