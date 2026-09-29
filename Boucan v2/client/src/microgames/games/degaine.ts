import type { TypedPayload } from '@boucan/shared';
import { g, outlineText, slam } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { arenaHeight, fighters, nameTag } from '../duel-common';

/**
 * DUEL — DÉGAINE ! Everyone faces the centre; wait for the signal, then tap
 * first. Early = out. When everybody is clean, the slowest loses. Server-judged.
 */
interface State {
  signal: boolean;
  presses: Record<string, { early: boolean; ms: number | null }>;
}

export default defineMicrogame({
  id: 'degaine',
  verb: 'ATTENDS LE SIGNAL…',
  create(ctx) {
    const GY = 560;
    const h = arenaHeight(ctx.players.length);
    const fs = fighters(ctx, GY);
    let state: State = { signal: false, presses: {} };
    let signalSeenAt = -1;
    let clock = 0;
    let pressed = false;
    return {
      input(e) {
        if (e.type !== 'down' || pressed) return;
        pressed = true;
        ctx.send({ type: 'press' });
        ctx.sfx('tap');
      },
      onState(s) {
        state = s as State;
        if (state.signal && signalSeenAt < 0) {
          signalSeenAt = clock;
          ctx.sfx('go');
        }
        for (const f of fs) {
          const p = state.presses[f.player.id];
          if (p && f.actor.pose === 'idle') f.actor.force(p.early ? 'hurt' : 'punch');
        }
      },
      onEvent(e: TypedPayload) {
        if (e.type === 'pressed' && e.playerId === ctx.me.id && e.early) ctx.shake(200);
      },
      update(dt, t) {
        clock = t;
        fs.forEach((f) => f.actor.update(dt));
      },
      draw(t) {
        const go = state.signal;
        sceneBg('desert', GY, 0, false, 'degaine');
        // Tension before the signal (dusk), flashing red / yellow after it.
        const c = g();
        c.fillStyle = go ? (Math.floor(t / 80) % 2 ? 'rgba(255,60,60,.35)' : 'rgba(255,210,60,.35)') : 'rgba(20,10,40,.28)';
        c.fillRect(0, 0, 1280, 720);
        for (const f of fs) {
          f.actor.draw(f.x, GY, h, { flip: f.x > 640 });
          nameTag(f, GY - h - 24);
          const p = state.presses[f.player.id];
          if (p?.early) outlineText('TROP TÔT', f.x, GY + 40, 28, '#ff6b6b');
          else if (p?.ms != null) outlineText(`${p.ms} ms`, f.x, GY + 40, 28, '#fff');
        }
        if (go) slam('TAPE !', t - signalSeenAt, '#fff', 640, 150, 150);
        else if (t > 900) outlineText('…', 640, 160, 120, '#fff');
      },
    };
  },
});
