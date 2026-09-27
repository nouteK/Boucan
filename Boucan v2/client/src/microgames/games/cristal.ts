import type { TypedPayload } from '@boucan/shared';
import { outlineText, slam } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { isPress } from '../common';
import { arenaHeight, fighters, nameTag } from '../duel-common';
import { chest, crystal } from '../props';

/**
 * DUEL — LE DERNIER CRISTAL : the chest holds one crystal less than there are
 * players. Wait for it to open, then tap: the slowest (or anyone too early)
 * goes home empty-handed. Server-judged.
 */
interface State {
  open: boolean;
  crystals: number;
  presses: Record<string, { early: boolean; ms: number | null }>;
  winners: string[] | null;
}

const GY = 560;
const CHEST = { x: 640, y: 290 };

export default defineMicrogame({
  id: 'cristal',
  verb: 'ATTRAPE UN CRISTAL !',
  create(ctx) {
    const h = arenaHeight(ctx.players.length);
    const fs = fighters(ctx, GY, 140);
    let state: State = { open: false, crystals: Math.max(1, ctx.players.length - 1), presses: {}, winners: null };
    let openedAt = -1;
    let awardedAt = -1;
    let clock = 0;
    let pressed = false;
    return {
      input(e) {
        if (!isPress(e) || pressed) return;
        pressed = true;
        ctx.send({ type: 'grab' });
        ctx.sfx('tap');
      },
      onState(s) {
        state = s as State;
        for (const f of fs) {
          const p = state.presses[f.player.id];
          if (p && (f.actor.pose === 'idle' || f.actor.pose === 'ready')) f.actor.force(p.early ? 'hurt' : 'ready');
        }
      },
      onEvent(e: TypedPayload) {
        if (e.type === 'open') {
          openedAt = clock;
          ctx.sfx('go');
        }
        if (e.type === 'grab' && e.playerId === ctx.me.id && e.early) {
          ctx.sfx('hurt');
          ctx.shake(200);
        }
        if (e.type === 'award') {
          awardedAt = clock;
          const winners = (e.winners as string[]) ?? [];
          for (const f of fs) f.actor.force(winners.includes(f.player.id) ? 'catch' : 'lose');
          ctx.sfx(winners.includes(ctx.me.id) ? 'pop' : 'hurt');
        }
      },
      update(dt, t) {
        clock = t;
        fs.forEach((f) => f.actor.update(dt));
      },
      draw(t) {
        sceneBg('futur', GY);
        const open = state.open;
        chest(CHEST.x, CHEST.y + 80, 1.1, open ? Math.min(1, (t - openedAt) / 180) : 0);
        // Crystals: in the chest, then flying to the winners.
        const winners = state.winners;
        for (let i = 0; i < state.crystals; i++) {
          const home = { x: CHEST.x - (state.crystals - 1) * 25 + i * 50, y: CHEST.y - 10 - (i % 2) * 14 };
          if (!open) continue;
          const who = winners?.[i] ? fs.find((f) => f.player.id === winners[i]) : undefined;
          if (who && awardedAt >= 0) {
            const k = Math.min(1, (t - awardedAt) / 420);
            const x = home.x + (who.x + (who.x > 640 ? -60 : 60) - home.x) * k;
            const y = home.y + (GY - h * 0.45 - home.y) * k - 160 * 4 * k * (1 - k);
            crystal(x, y, 0.7, k * 6);
          } else if (!winners) crystal(home.x, home.y + Math.sin(t / 200 + i) * 6, 0.7, (i - 1) * 0.2);
        }
        for (const f of fs) {
          f.actor.draw(f.x, GY, h, { flip: f.x > 640 });
          nameTag(f, GY - h - 24);
          const p = state.presses[f.player.id];
          if (p?.early) outlineText('TROP TÔT', f.x, GY + 40, 28, '#ff6b6b');
          else if (p?.ms != null) outlineText(`${p.ms} ms`, f.x, GY + 40, 28, '#fff');
        }
        if (open && !winners) slam('PRENEZ !', t - openedAt, '#7ff0ff', 640, 110, 120);
        else if (!open && t > 900) outlineText('…', 640, 120, 110, '#fff');
      },
    };
  },
});
