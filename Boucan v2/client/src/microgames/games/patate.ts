import type { TypedPayload } from '@boucan/shared';
import { outlineText, slam } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { arenaHeight, fighters, nameTag } from '../duel-common';
import { bomb, boom } from '../props';

/**
 * DUEL — PATATE CHAUDE : the bomb goes from hand to hand. When you hold it,
 * tap to throw it to someone else. Whoever holds it when it blows loses.
 */
interface State {
  holder: string | null;
  flight: { from: string; to: string; at: number; arrive: number } | null;
  exploded: string | null;
  passes: number;
}

export default defineMicrogame({
  id: 'patate',
  verb: 'PATATE CHAUDE !',
  create(ctx) {
    const GY = 580;
    const h = arenaHeight(ctx.players.length);
    const fs = fighters(ctx, GY, 150);
    const byId = new Map(fs.map((f) => [f.player.id, f]));
    let state: State = { holder: null, flight: null, exploded: null, passes: 0 };
    let boomAt = -1;
    let clock = 0;
    return {
      input(e) {
        if (e.type !== 'down') return;
        if (state.holder === ctx.me.id && !state.flight && !state.exploded) {
          ctx.send({ type: 'pass' });
          byId.get(ctx.me.id)?.actor.force('punch');
          ctx.sfx('whoosh');
        }
      },
      onState(s) {
        const prev = state.holder;
        state = s as State;
        if (state.holder && state.holder !== prev) byId.get(state.holder)?.actor.force('catch');
      },
      onEvent(e: TypedPayload) {
        if (e.type === 'boom') {
          boomAt = clock;
          ctx.sfx('boom');
          ctx.shake(300);
          const f = byId.get(String(e.playerId));
          f?.actor.force('hurt');
        }
      },
      update(dt, t) {
        clock = t;
        fs.forEach((f) => f.actor.update(dt));
      },
      draw(t) {
        sceneBg('foret', GY);
        for (const f of fs) {
          f.actor.draw(f.x, GY, h, { flip: f.x > 640 });
          nameTag(f, GY - h - 24);
        }
        // Heat (from elapsed time only: the explosion time stays secret).
        const heat = Math.min(2, Math.floor((t / ctx.duration) * 3.2));
        const wob = heat === 2 ? Math.sin(t / 30) * 0.2 : Math.sin(t / 200) * 0.06;
        if (state.exploded) {
          const f = byId.get(state.exploded);
          if (f && t - boomAt < 900) boom(f.x, GY - h * 0.6, 460 * Math.min(1, 0.6 + (t - boomAt) / 200));
        } else if (state.flight) {
          const a = byId.get(state.flight.from);
          const b = byId.get(state.flight.to);
          if (a && b) {
            const k = Math.min(1, Math.max(0, (ctx.serverNow() - state.flight.at) / (state.flight.arrive - state.flight.at)));
            const x = a.x + (b.x - a.x) * k;
            bomb(x, GY - h * 0.75 - Math.sin(k * Math.PI) * 170, 130, heat, false, k * 8);
          }
        } else if (state.holder) {
          const f = byId.get(state.holder);
          if (f) bomb(f.x + (f.x > 640 ? -50 : 50), GY - h * 0.45, 120, heat, false, wob);
        }
        if (state.holder === ctx.me.id && !state.flight && !state.exploded) slam('LANCE-LA !', 0, '#ffe04a', 640, 110, 110);
        else if (!state.exploded) outlineText(`${state.passes} passe${state.passes > 1 ? 's' : ''}`, 640, 60, 34, '#fff');
      },
    };
  },
});
