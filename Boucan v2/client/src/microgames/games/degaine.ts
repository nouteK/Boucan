import type { TypedPayload } from '@boucan/shared';
import { circle, g, outlineText, radial, slam } from '../../engine/draw';
import { defineMicrogame } from '../api';
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
        if (go) radial(Math.floor(t / 90) % 2 ? '#ff3b3b' : '#ffcf3b', t, 20);
        else radial('#3a2a4a', t, 14);
        const c = g();
        c.fillStyle = '#161616';
        c.fillRect(0, GY, 1280, 720 - GY);
        circle(640, 330, 150, go ? 'rgba(255,255,255,.3)' : '#ffb34a', 0);
        for (const f of fs) {
          f.actor.draw(f.x, GY, h, { flip: f.x > 640 });
          nameTag(f, GY - h - 24);
          const p = state.presses[f.player.id];
          if (p?.early) outlineText('TROP TÔT', f.x, GY + 40, 28, '#ff6b6b');
          else if (p?.ms != null) outlineText(`${p.ms} ms`, f.x, GY + 40, 28, '#fff');
        }
        if (go) slam('DÉGAINE !', t - signalSeenAt, '#fff', 640, 150, 140);
        else if (t > 900) outlineText('…', 640, 160, 120, '#fff');
      },
    };
  },
});
