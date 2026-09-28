import { box, ellipse, g, INK, outlineText, poly, star } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { byLevel, GY, hero, isPress } from '../common';
import { bomb } from '../props';

/**
 * RÉPÈTE LE RYTHME ! — the bomb plays a rhythm on the drum: listen, then tap
 * the same rhythm (the first tap starts it; each tap must fall near its beat).
 */
const X = 380;
const DRUM = { x: 700, y: GY - 120 };
const LISTEN_AT = 1300;
const LINE = { x0: 260, x1: 1020, y: 210 };

export default defineMicrogame({
  id: 'rythme',
  verb: 'RÉPÈTE LE RYTHME !',
  create(ctx) {
    const me = hero(ctx);
    const tolerance = byLevel(ctx, 200, 170, 145);
    const steps = [350, 500, 500, 700];
    const beats = [0];
    const count = ctx.rng.int(4, 5);
    while (beats.length < count) beats.push(beats[beats.length - 1]! + ctx.rng.pick(steps));
    const total = beats[beats.length - 1]!;
    let phase: 'listen' | 'play' = 'listen';
    let played = -1;
    let clock = 0;
    let start = -1;
    const taps: number[] = [];
    let result: 'win' | 'lose' | null = null;
    let bad = -1;
    let flash = 1e9;
    const lose = (i: number) => {
      result = 'lose';
      bad = i;
      me.force('hurt');
      ctx.sfx('hurt');
      ctx.lose();
    };
    return {
      input(e) {
        if (!isPress(e) || phase !== 'play' || result) return;
        me.force('punch');
        flash = 0;
        if (start < 0) start = clock;
        taps.push(clock - start);
        const i = taps.length - 1;
        if (Math.abs(taps[i]! - beats[i]!) > tolerance) lose(i);
        else if (taps.length === beats.length) {
          result = 'win';
          ctx.sfx('pop');
          ctx.win();
        } else ctx.sfx('hit');
      },
      update(dt, t) {
        clock = t;
        flash += dt;
        me.update(dt);
        if (phase === 'listen') {
          const u = t - LISTEN_AT;
          while (played + 1 < beats.length && beats[played + 1]! <= u) {
            played += 1;
            flash = 0;
            ctx.sfx('hit');
          }
          if (u > total + 700) {
            phase = 'play';
            ctx.sfx('go');
          }
        } else if (!result && start >= 0 && t - start > beats[taps.length]! + tolerance + 50) lose(taps.length);
      },
      timeout: () => (result === 'win' ? 'success' : 'failure'),
      draw(t) {
        sceneBg('futur', GY);
        const c = g();
        // Drum.
        const f = Math.max(0, 1 - flash / 220);
        c.save();
        c.translate(DRUM.x, DRUM.y);
        c.scale(1 + f * 0.06, 1 - f * 0.04);
        box(-110, -20, 220, 130, '#d8312f', 7, 20);
        ellipse(0, -20, 110, 34, '#fff3d6', 7);
        c.strokeStyle = '#ffd23c';
        c.lineWidth = 5;
        for (let i = -3; i <= 3; i++) {
          c.beginPath();
          c.moveTo(i * 30, 14);
          c.lineTo(i * 30 + 15, 100);
          c.stroke();
        }
        c.restore();
        if (f > 0) star(DRUM.x, DRUM.y - 80, 1 - f);
        if (phase === 'listen') {
          bomb(DRUM.x + 220, GY, 200, 0, true, f * 0.3);
          if (t > 950) outlineText('ÉCOUTE…', 640, 130, 56, '#fff', 'center', 8);
        } else if (!result) outlineText('À TOI !', 640, 130, 56, '#ffe04a', 'center', 8);
        me.draw(X, GY);
        // Timeline: the beats, then your taps.
        const mx = (x: number) => LINE.x0 + ((LINE.x1 - LINE.x0) * Math.min(total * 1.1, x)) / total;
        box(LINE.x0 - 30, LINE.y - 22, LINE.x1 - LINE.x0 + 60, 44, INK, 0, 22);
        beats.forEach((b, i) => {
          c.fillStyle = phase === 'play' || i <= played ? '#ffe04a' : '#555';
          c.beginPath();
          c.arc(mx(b), LINE.y, 13, 0, Math.PI * 2);
          c.fill();
        });
        taps.forEach((x, i) => poly([[mx(x), LINE.y - 30], [mx(x) - 10, LINE.y - 48], [mx(x) + 10, LINE.y - 48]], i === bad ? '#ff4a4a' : '#7dff9b', 3));
        if (result) outlineText(result === 'win' ? 'EN RYTHME !' : 'PAS EN RYTHME', 640, 320, 56, result === 'win' ? '#7dff9b' : '#ff6b6b', 'center', 8);
      },
    };
  },
});
