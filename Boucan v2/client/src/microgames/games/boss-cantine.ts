import { box, circle, g, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { cantineBg } from '../backdrops';
import { GY, hero } from '../common';
import { pureeBall, splat, teacher, tray } from '../props';

/**
 * BOSS — LA CANTINIÈRE : she throws food at you. Tap to raise your tray just
 * before each projectile arrives. Too many hits and you lose.
 */
export default defineMicrogame({
  id: 'boss-cantine',
  verb: 'PARE LA BOUFFE !',
  create(ctx) {
    const me = hero(ctx);
    const X = 300;
    const cookX = 1060;
    const n = ctx.level === 1 ? 7 : ctx.level === 2 ? 8 : 9;
    const allowed = ctx.level >= 3 ? 0 : 1;
    const flight = ctx.level === 1 ? 820 : 700;
    const guard = ctx.level === 1 ? 420 : 340;
    let at = 700;
    const shots = Array.from({ length: n }, () => {
      const s = { t0: at, state: 'wait' as 'wait' | 'fly' | 'blocked' | 'hit', t: 0, arc: ctx.rng.range(120, 300) };
      at += ctx.rng.range(900, 1300) - ctx.level * 60;
      return s;
    });
    let raisedAt = -1;
    let cooldown = 0;
    let hits = 0;
    let clock = 0;
    const raised = () => raisedAt >= 0 && clock - raisedAt <= guard;
    const splats: number[] = [];
    return {
      input(e) {
        if (e.type !== 'down' || cooldown > 0 || raised() || ctx.outcome) return;
        raisedAt = clock;
        me.force('ready');
        ctx.sfx('select');
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        cooldown = Math.max(0, cooldown - dt);
        if (raisedAt >= 0 && !raised()) {
          raisedAt = -1;
          cooldown = 140;
          if (me.pose === 'ready' || me.pose === 'hold') me.force('idle');
        }
        if (ctx.outcome) return;
        for (const s of shots) {
          if (s.state === 'wait' && t >= s.t0) {
            s.state = 'fly';
            s.t = 0;
          } else if (s.state === 'fly') {
            s.t += dt;
            if (s.t >= flight) {
              if (raised()) {
                s.state = 'blocked';
                ctx.sfx('pop');
              } else {
                s.state = 'hit';
                hits += 1;
                splats.push(X + ctx.rng.range(-60, 60));
                me.force('hurt');
                ctx.sfx('hurt');
                ctx.shake(180);
                if (hits > allowed) ctx.lose();
              }
            }
          }
        }
        if (!ctx.outcome && shots.every((s) => s.state === 'blocked' || s.state === 'hit')) ctx.win();
      },
      timeout: () => (hits > allowed ? 'failure' : 'success'),
      draw(t) {
        cantineBg(t, GY);
        box(cookX - 140, GY - 180, 280, 180, '#c9d3dc', 7);
        teacher(cookX, GY - 150, 380, 'front', t, 'angry');
        // Chef hat.
        circle(cookX, GY - 150 - 390 * (380 / 420), 40, '#fff', 6);
        splats.forEach((x) => splat(x, GY - 2, 0.7));
        me.draw(X, GY);
        if (raised()) tray(X + 90, GY - 250, -0.5, 0.9, []);
        for (const s of shots) {
          if (s.state !== 'fly') continue;
          const k = s.t / flight;
          const x = cookX - 80 + (X + 60 - (cookX - 80)) * k;
          const y = GY - 330 + (GY - 200 - (GY - 330)) * k - s.arc * 4 * k * (1 - k);
          pureeBall(x, y, 26, k * 10);
        }
        const c = g();
        c.save();
        for (let i = 0; i <= allowed; i++) {
          c.globalAlpha = i < allowed + 1 - hits ? 1 : 0.25;
          circle(60 + i * 50, 50, 18, '#ff4f7b', 5);
        }
        c.restore();
        outlineText('LA CANTINIÈRE', 1000, 50, 36, '#fff');
      },
    };
  },
});
