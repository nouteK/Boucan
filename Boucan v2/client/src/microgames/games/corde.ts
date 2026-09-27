import type { TypedPayload } from '@boucan/shared';
import { ellipse, g, INK, outlineText, poly, slam } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { Actor, sideOf } from '../common';
import { keyCap } from '../props';

/**
 * DUEL — TIRE LA CORDE : two random teams. Press left, right, left… (screen
 * halves or ← →) to pull; only alternating counts. Drag the flag over your
 * line to win. Server-counted.
 */
interface State {
  rope: number;
  teams: { left: string[]; right: string[] };
  pulls: Record<string, number>;
  winner: 'left' | 'right' | null;
}

const GY = 590;
/** Flag travel in px for the whole rope range (±0.5 = a win). */
const TRAVEL = 500;

export default defineMicrogame({
  id: 'corde',
  verb: 'TIRE LA CORDE !',
  create(ctx) {
    const actors = new Map(ctx.players.map((p) => [p.id, new Actor(p, 'pull')]));
    const pulledAt = new Map<string, number>();
    let state: State | null = null;
    let shown = 0;
    let last: -1 | 1 | null = null;
    let wonAt = -1;
    let clock = 0;
    const perSide = Math.max(1, Math.ceil(ctx.players.length / 2));
    const h = perSide <= 1 ? 280 : perSide === 2 ? 250 : perSide === 3 ? 220 : 190;
    const gap = Math.min(150, 420 / perSide);
    return {
      input(e) {
        const side = sideOf(e);
        if (side === null || side === last || state?.winner) return;
        last = side;
        ctx.send({ type: 'pull', side });
        ctx.sfx('tap');
      },
      onState(s) {
        const next = s as State;
        for (const [id, n] of Object.entries(next.pulls)) if (n !== state?.pulls[id]) pulledAt.set(id, clock);
        state = next;
      },
      onEvent(e: TypedPayload) {
        if (e.type !== 'won' || !state) return;
        wonAt = clock;
        const winners = e.team === 'left' ? state.teams.left : state.teams.right;
        for (const [id, a] of actors) a.force(winners.includes(id) ? 'win' : 'hurt');
        ctx.sfx(winners.includes(ctx.me.id) ? 'pop' : 'hurt');
      },
      update(dt, t) {
        clock = t;
        shown += ((state?.rope ?? 0) - shown) * Math.min(1, dt / 120);
        for (const [id, a] of actors) {
          if (!state?.winner) a.set(t - (pulledAt.get(id) ?? -1e9) < 170 ? 'pull_hard' : 'pull');
          a.update(dt);
        }
      },
      draw(t) {
        sceneBg('foret', GY);
        const c = g();
        const off = shown * TRAVEL;
        // Mud pit and the two winning lines.
        ellipse(640, GY + 18, 110, 22, '#6b4a2b', 5);
        for (const s of [-1, 1]) {
          c.fillStyle = s < 0 ? '#7dff9b' : '#ff6b6b';
          c.fillRect(640 + s * (TRAVEL / 2) - 5, GY - 4, 10, 40);
        }
        if (!state) return;
        const mySide = state.teams.left.includes(ctx.me.id) ? -1 : state.teams.right.includes(ctx.me.id) ? 1 : 0;
        const place = (id: string): { x: number; side: -1 | 1 } => {
          const li = state!.teams.left.indexOf(id);
          if (li >= 0) return { x: 640 + off - 140 - li * gap, side: -1 };
          return { x: 640 + off + 140 + state!.teams.right.indexOf(id) * gap, side: 1 };
        };
        // Rope under the hands, flag in the middle.
        const ropeY = GY - h * 0.5;
        const xs = ctx.players.map((p) => place(p.id).x);
        c.lineCap = 'round';
        c.strokeStyle = INK;
        c.lineWidth = 16;
        c.beginPath();
        c.moveTo(Math.min(...xs) - 60, ropeY + 8);
        c.lineTo(Math.max(...xs) + 60, ropeY + 8);
        c.stroke();
        c.strokeStyle = '#c98a4b';
        c.lineWidth = 9;
        c.stroke();
        poly([[640 + off, ropeY + 6], [640 + off - 22, ropeY + 58], [640 + off + 22, ropeY + 58]], '#ff2d55', 5);
        for (const p of ctx.players) {
          const { x, side } = place(p.id);
          actors.get(p.id)!.draw(x, GY, h, { flip: side > 0 });
          outlineText(p.isMe ? 'TOI' : p.nickname, x, GY - h - 18, p.isMe ? 30 : 22, p.isMe ? '#ffe04a' : p.color);
        }
        if (mySide) outlineText('TON ÉQUIPE', mySide < 0 ? 170 : 1110, 90, 30, '#7dff9b');
        if (!state.winner && mySide) {
          const next = last === -1 ? 1 : -1;
          keyCap(580, 190, 'left', next === -1 ? 1 : 0.75, next === -1 ? 'next' : null);
          keyCap(700, 190, 'right', next === 1 ? 1 : 0.75, next === 1 ? 'next' : null);
        }
        if (state.winner) {
          const mine = (state.winner === 'left') === (mySide < 0);
          slam(!mySide ? 'FIN !' : mine ? 'GAGNÉ !' : 'PERDU…', t - wonAt, '#ffe04a', 640, 230, 100);
        }
      },
    };
  },
});
