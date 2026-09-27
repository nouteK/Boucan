import type { TypedPayload } from '@boucan/shared';
import { g, outlineText, stripes } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { Actor, isPress } from '../common';

/**
 * DUEL — LA COURSE : everyone on their own lane, mash to run. The last one
 * across the line (or anyone still running at the end) loses. Server-counted.
 */
interface State {
  runners: Record<string, { d: number; place: number | null }>;
}

export default defineMicrogame({
  id: 'course',
  verb: 'LA COURSE !',
  create(ctx) {
    const n = ctx.players.length;
    const laneH = Math.min(120, 600 / n);
    const top = 720 - 40 - laneH * n;
    const startX = 120;
    const endX = 1110;
    const lanes = ctx.players.map((p, i) => ({ p, actor: new Actor(p, 'idle'), y: top + laneH * (i + 1), shown: 0, target: 0, place: null as number | null }));
    const mine = lanes.find((l) => l.p.isMe);
    let myTaps = 0;
    return {
      input(e) {
        if (!isPress(e)) return;
        if (!mine || mine.place !== null) return;
        myTaps += 1;
        ctx.send({ type: 'tap' });
        ctx.sfx('tap');
      },
      onState(s) {
        const st = s as State;
        for (const l of lanes) {
          const r = st.runners[l.p.id];
          if (!r) continue;
          l.target = r.d;
          l.place = r.place;
        }
      },
      onEvent(e: TypedPayload) {
        if (e.type === 'finish' && e.playerId === ctx.me.id) ctx.sfx('pop');
      },
      update(dt) {
        for (const l of lanes) {
          // Own runner: optimistic (local taps), capped a little ahead of the server.
          const goal = l === mine ? Math.min(myTaps / 30, l.target + 2 / 30) : l.target;
          const before = l.shown;
          l.shown += (Math.max(l.shown, goal) - l.shown) * Math.min(1, dt / 90);
          const moving = l.shown - before > 0.00002 * dt;
          l.actor.set(l.place !== null ? 'win' : moving ? 'run' : 'idle');
          l.actor.update(dt);
        }
      },
      draw(t) {
        stripes('#ff4f7b', t, 2);
        const c = g();
        const h = Math.min(170, laneH * 1.35);
        for (const l of lanes) {
          c.fillStyle = '#161616';
          c.fillRect(0, l.y, 1280, 12);
          c.fillStyle = l.p.color;
          c.fillRect(0, l.y + 2, 60, 8);
          for (let k = 0; k < 5; k++) {
            c.fillStyle = k % 2 ? '#161616' : '#fff';
            c.fillRect(endX + 20, l.y - 10 - k * 10, 10, 10);
            c.fillStyle = k % 2 ? '#fff' : '#161616';
            c.fillRect(endX + 30, l.y - 10 - k * 10, 10, 10);
          }
          l.actor.draw(startX + (endX - startX) * l.shown, l.y, h);
          outlineText(l.p.isMe ? 'TOI' : l.p.nickname, 20, l.y - 22, 22, l.p.color, 'left', 5);
          if (l.place !== null) outlineText(`${l.place}${l.place === 1 ? 'er' : 'e'}`, 1210, l.y - 30, 34, '#ffe04a');
        }
      },
    };
  },
});
