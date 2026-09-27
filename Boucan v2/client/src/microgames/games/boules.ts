import type { TypedPayload } from '@boucan/shared';
import { outlineText } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { arenaHeight, fighters, nameTag } from '../duel-common';
import { snowBall, snowSplat } from '../props';

/**
 * DUEL — ESQUIVE LES BOULES ! The same volley flies at everyone: tap (or ↓)
 * to duck right before each snowball lands. Most hits loses. Server-judged;
 * your own duck shows instantly.
 */
interface State {
  impacts: number[];
  sides: Record<string, number[]>;
  hits: Record<string, number>;
  ducks: Record<string, number | null>;
}

const GY = 560;
const FLIGHT_MS = 700;
/** Same duck timing as the server (press → back up → recovery). */
const UP_MS = 440;
const RECOVER_MS = 100;

export default defineMicrogame({
  id: 'boules',
  verb: 'ESQUIVE LES BOULES !',
  create(ctx) {
    const h = arenaHeight(ctx.players.length);
    const fs = fighters(ctx, GY, 150);
    let state: State | null = null;
    let myDuck = -Infinity;
    const splatAt = new Map<string, number>();
    const done = new Set<string>();
    return {
      input(e) {
        const duck = e.type === 'down' || (e.type === 'key' && !e.repeat && (e.key === 'down' || e.key === 'up'));
        const now = ctx.serverNow();
        if (!duck || now < myDuck + UP_MS + RECOVER_MS) return;
        myDuck = now;
        ctx.send({ type: 'duck' });
        ctx.sfx('whoosh');
      },
      onState(s) {
        state = s as State;
      },
      onEvent(e: TypedPayload) {
        const id = String(e.playerId);
        done.add(`${id}:${e.ball}`);
        if (e.type === 'hit') {
          splatAt.set(id, ctx.serverNow());
          fs.find((f) => f.player.id === id)?.actor.force('hurt');
          if (id === ctx.me.id) {
            ctx.sfx('splash');
            ctx.shake(160);
          }
        } else if (id === ctx.me.id) ctx.sfx('block');
      },
      update(dt) {
        const now = ctx.serverNow();
        for (const f of fs) {
          const d = f.player.id === ctx.me.id ? myDuck : (state?.ducks[f.player.id] ?? -Infinity);
          const down = now >= d && now <= d + UP_MS;
          if (down && f.actor.pose !== 'duck') f.actor.force('duck');
          else if (!down && f.actor.pose === 'duck') f.actor.force('stop');
          f.actor.update(dt);
        }
      },
      draw() {
        sceneBg('neige', GY);
        const now = ctx.serverNow();
        for (const f of fs) {
          const id = f.player.id;
          f.actor.draw(f.x, GY, h, { flip: f.x > 640 });
          nameTag(f, GY - h - 24);
          const hits = state?.hits[id] ?? 0;
          if (hits > 0) snowSplat(f.x, GY - h * 0.82, 0.3 + hits * 0.08);
          outlineText(`❄ ${hits}`, f.x, GY + 40, 28, '#fff');
          // Incoming snowballs, each on its own arc towards this player's head.
          state?.impacts.forEach((impact, k) => {
            const t = now - (impact - FLIGHT_MS);
            if (t < 0 || t > FLIGHT_MS || done.has(`${id}:${k}`)) return;
            const q = t / FLIGHT_MS;
            const side = state!.sides[id]?.[k] ?? 1;
            const sx = f.x + side * 700;
            const x = sx + (f.x - sx) * q;
            const y = GY - 420 + (GY - h * 0.8 - (GY - 420)) * q - 200 * 4 * q * (1 - q);
            snowBall(x, y, id === ctx.me.id ? 30 : 24, q * 9);
          });
          const s = splatAt.get(id);
          if (s !== undefined && now - s < 500) outlineText('PAF', f.x + 60, GY - h - 70, 40, '#fff');
        }
        const left = state ? Math.max(0, state.impacts.filter((i) => i > now).length) : 6;
        outlineText(`${left} boule${left > 1 ? 's' : ''}`, 640, 70, 34, '#fff');
      },
    };
  },
});
