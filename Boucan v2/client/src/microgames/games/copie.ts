import { box, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { classeBg } from '../backdrops';
import { Actor, byLevel, GY, hero } from '../common';
import { desk, paperSheet, teacher } from '../props';

/**
 * COPIE EN DOUCE ! — hold to copy your neighbour's sheet while the teacher
 * writes on the board; let go as soon as she turns around ("?!").
 */
export default defineMicrogame({
  id: 'copie',
  verb: 'COPIE EN DOUCE !',
  create(ctx) {
    const me = hero(ctx);
    const neighbour = new Actor({ characterId: ctx.players.find((p) => !p.isMe)?.characterId ?? 'renard', color: '#888' });
    const warn = byLevel(ctx, 420, 320, 240);
    const turns = [ctx.duration * ctx.rng.range(0.22, 0.36)];
    if (ctx.level >= 2 || ctx.rng.chance(0.5)) turns.push(turns[0]! + ctx.rng.range(1300, 1700));
    const lookMs = 700;
    let holding = false;
    let progress = 0;
    const rate = 1 / (ctx.duration * 0.52);
    let caught = false;
    let clock = 0;
    const teacherState = (t: number): 'back' | 'turning' | 'front' => {
      for (const at of turns) {
        if (t >= at - warn && t < at) return 'turning';
        if (t >= at && t < at + lookMs) return 'front';
      }
      return 'back';
    };
    return {
      input(e) {
        if (caught || ctx.outcome) return;
        if (e.type === 'down') {
          holding = true;
          me.set('hold');
        }
        if (e.type === 'up') {
          holding = false;
          me.set('idle');
        }
      },
      update(dt, t) {
        clock = t;
        me.update(dt);
        neighbour.update(dt);
        if (caught || ctx.outcome) return;
        if (holding) {
          progress += rate * dt;
          if (teacherState(t) === 'front') {
            caught = true;
            me.force('hurt');
            ctx.sfx('hurt');
            ctx.shake(220);
            ctx.lose();
          } else if (progress >= 1) {
            me.force('win');
            ctx.win();
          }
        }
      },
      draw(t) {
        classeBg(t, GY);
        const st = teacherState(clock);
        teacher(640, GY - 80, 380, caught ? 'front' : st, t, caught ? 'angry' : 'calm');
        if (st === 'turning' && !caught) outlineText('?!', 740, GY - 520, 80, '#ff5a4a');
        if (caught) outlineText('JE T’AI VU !', 640, 60, 60, '#ff5a4a');
        me.draw(360, GY + 60, 280, { rot: holding ? 0.18 : 0 });
        neighbour.draw(930, GY + 60, 280, { flip: true });
        desk(360, GY - 60, 320);
        desk(930, GY - 60, 320);
        paperSheet(380, GY - 72, 170, 40, 0, 2);
        paperSheet(910, GY - 72, 170, 40, 0, 2);
        box(390, 650, 500, 30, '#fff', 6, 15);
        box(394, 654, 492 * Math.min(1, progress), 22, '#2fd07a', 0, 11);
      },
    };
  },
});
