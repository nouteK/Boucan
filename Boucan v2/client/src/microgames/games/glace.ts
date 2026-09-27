import type { TypedPayload } from '@boucan/shared';
import { box, g, outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { Actor, isPress } from '../common';

/**
 * DUEL — COURSE SUR GLACE : mash to skate, but every push heats your blades.
 * Past the red, you slip for almost a second. The last one on the ice loses.
 * Server-simulated; the heat gauge above each skater shows the danger.
 */
interface State {
  runners: Record<string, { d: number; heat: number; slip: boolean; place: number | null }>;
}

const START_X = 120;
const END_X = 1100;

export default defineMicrogame({
  id: 'glace',
  verb: 'COURSE SUR GLACE !',
  create(ctx) {
    const n = ctx.players.length;
    const laneH = Math.min(120, 560 / n);
    const top = 720 - 40 - laneH * n;
    const lanes = ctx.players.map((p, i) => ({ p, actor: new Actor(p, 'idle'), y: top + laneH * (i + 1), shown: 0, target: 0, heat: 0, slip: false, place: null as number | null }));
    const mine = lanes.find((l) => l.p.isMe);
    let slipT = new Map<string, number>();
    return {
      input(e) {
        if (!isPress(e) || !mine || mine.place !== null || mine.slip) return;
        ctx.send({ type: 'push' });
        ctx.sfx('tap');
      },
      onState(s) {
        const st = s as State;
        for (const l of lanes) {
          const r = st.runners[l.p.id];
          if (!r) continue;
          l.target = r.d;
          l.heat = r.heat;
          l.slip = r.slip;
          l.place = r.place;
        }
      },
      onEvent(e: TypedPayload) {
        if (e.type === 'slip') {
          slipT.set(String(e.playerId), ctx.serverNow());
          lanes.find((l) => l.p.id === e.playerId)?.actor.force('slide');
          if (e.playerId === ctx.me.id) {
            ctx.sfx('hurt');
            ctx.shake(200);
          }
        }
        if (e.type === 'finish' && e.playerId === ctx.me.id) ctx.sfx('pop');
      },
      update(dt) {
        for (const l of lanes) {
          const before = l.shown;
          l.shown += (Math.max(l.shown, l.target) - l.shown) * Math.min(1, dt / 90);
          const moving = l.shown - before > 0.00002 * dt;
          if (l.place !== null) l.actor.set('win');
          else if (l.slip) l.actor.set('slide');
          else l.actor.set(moving ? 'run' : 'idle');
          l.actor.update(dt);
        }
        slipT = new Map([...slipT].filter(([, at]) => ctx.serverNow() - at < 900));
      },
      draw(t) {
        const c = g();
        // Ice rink.
        c.fillStyle = '#dff3ff';
        c.fillRect(0, 0, 1280, 720);
        c.fillStyle = 'rgba(255,255,255,.7)';
        for (let i = 0; i < 9; i++) c.fillRect(((i * 190 + t * 0.03) % 1500) - 200, 0, 60, 720);
        box(-10, 0, 1300, top - 10, '#3fb8ff', 0);
        outlineText('PATINOIRE', 640, Math.max(40, (top - 10) / 2), 44, '#fff');
        const h = Math.min(170, laneH * 1.35);
        for (const l of lanes) {
          c.fillStyle = 'rgba(22,22,22,.18)';
          c.fillRect(0, l.y - 3, END_X + 10, 6);
          for (let k = 0; k < 12; k++) {
            c.fillStyle = k % 2 ? '#161616' : '#fff';
            c.fillRect(END_X + 10, l.y - 10 - k * 9, 10, 9);
          }
          const x = START_X + (END_X - START_X) * l.shown;
          const wobble = l.slip ? 0 : (l.heat - 0.3) * 0.25 * Math.sin(t / 50);
          l.actor.draw(x, l.y, h, { rot: wobble });
          if (slipT.has(l.p.id)) outlineText('ZIIP', x + 60, l.y - h - 20, 26, '#fff');
          // Blade heat: green → orange → red.
          const col = l.heat > 0.75 ? '#ff5a4a' : l.heat > 0.45 ? '#ffb020' : '#2fd07a';
          box(x - 40, l.y - h - 8, 80, 12, '#161616', 0, 4);
          box(x - 38, l.y - h - 6, 76 * Math.min(1, l.heat), 8, col, 0, 3);
          outlineText(l.p.isMe ? 'TOI' : l.p.nickname, 20, l.y - 22, 22, l.p.color, 'left', 5);
          if (l.place !== null) outlineText(`${l.place}${l.place === 1 ? 'er' : 'e'}`, 1200, l.y - 30, 34, '#ffe04a');
        }
      },
    };
  },
});
