import { box, outlineText, shadow } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { recreBg } from '../backdrops';
import { GY, hero } from '../common';
import { bomb, boom } from '../props';

/**
 * BOSS — LE ROI BOMBE : the giant bomb sends little bombs rolling at you.
 * Jump over every one of them (tap); each one that passes hurts the king.
 */
export default defineMicrogame({
  id: 'boss-recre',
  verb: 'SAUTE PAR-DESSUS !',
  create(ctx) {
    const me = hero(ctx);
    const X = 260;
    const kingX = 1080;
    const n = ctx.level === 1 ? 5 : ctx.level === 2 ? 6 : 7;
    let at = 900;
    const bombs = Array.from({ length: n }, () => {
      const b = { spawn: at, x: kingX - 60, v: ctx.rng.range(0.5, 0.75 + ctx.level * 0.05), passed: false, live: false };
      at += ctx.rng.range(1050, 1500) - ctx.level * 80;
      return b;
    });
    let jumpT = -1;
    let h = 0;
    let hit = false;
    let boomT = -1;
    let kingHurt = 0;
    let passedCount = 0;
    let clock = 0;
    return {
      input(e) {
        if (e.type !== 'down' || jumpT >= 0 || hit || ctx.outcome) return;
        jumpT = 0;
        me.force('start');
        ctx.sfx('jump');
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        kingHurt = Math.max(0, kingHurt - dt);
        if (boomT >= 0) boomT += dt;
        if (hit || ctx.outcome === 'success') return;
        if (jumpT >= 0) {
          jumpT += dt;
          const p = Math.min(1, jumpT / 760);
          h = 360 * 4 * p * (1 - p);
          if (p >= 1) {
            jumpT = -1;
            h = 0;
            me.force('stop');
          }
        }
        for (const b of bombs) {
          if (!b.live && !b.passed && t >= b.spawn) {
            b.live = true;
            ctx.sfx('pop');
          }
          if (!b.live) continue;
          b.x -= b.v * dt;
          if (Math.abs(b.x - X) < 64 && h < 120) {
            hit = true;
            boomT = 0;
            me.force('hurt');
            ctx.sfx('boom');
            ctx.shake(300);
            ctx.lose();
            return;
          }
          if (b.x < X - 120) {
            b.live = false;
            b.passed = true;
            passedCount += 1;
            kingHurt = 300;
            if (passedCount === n) {
              boomT = 0;
              ctx.sfx('boom');
              ctx.shake(400);
              ctx.win();
            }
          }
        }
      },
      timeout: () => (ctx.outcome === 'success' ? 'success' : 'failure'),
      draw(t) {
        recreBg(t, GY, '#ffb3a8');
        const won = ctx.outcome === 'success';
        if (!won || boomT < 200) {
          const wob = kingHurt > 0 ? Math.sin(t / 20) * 0.15 : Math.sin(t / 300) * 0.05;
          shadow(kingX, GY, 160);
          bomb(kingX, GY, 420, kingHurt > 0 ? 2 : 1, true, wob);
        }
        if (won) boom(kingX, GY - 220, 600 * Math.min(1, 0.6 + boomT / 300));
        for (const b of bombs) {
          if (!b.live) continue;
          shadow(b.x, GY, 50);
          bomb(b.x, GY, 150, 2, true, Math.sin(clock / 50) * 0.2);
        }
        shadow(X, GY, Math.max(40, 100 - h / 4));
        me.draw(X, GY - h, undefined, { shadow: false });
        if (hit && boomT < 700) boom(X + 30, GY - 160, 400 * (0.6 + Math.min(1, boomT / 150) * 0.4));
        // King's health.
        outlineText('ROI BOMBE', 1000, 50, 36, '#fff');
        box(840, 80, 320, 26, '#fff', 6, 13);
        box(844, 84, 312 * (1 - passedCount / n), 18, '#ff4f7b', 0, 9);
      },
    };
  },
});
