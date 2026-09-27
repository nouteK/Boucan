import type { TypedPayload } from '@boucan/shared';
import { ellipse, g, outlineText, slam } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { Actor, sideOf } from '../common';
import { keyCap } from '../props';

/**
 * DUEL — 1, 2, 3… SOLEIL ! One lookout, back turned; the others run to them
 * by pressing left, right, left… Anyone moving while the lookout watches is
 * caught. The lookout taps → (or the right side) to turn around, ← (left
 * side) to fake it. Server-judged. You are always in the front row.
 */
interface State {
  lookout: string;
  phase: 'back' | 'turn' | 'watch';
  phaseAt: number;
  feintAt: number | null;
  goal: number;
  runners: Record<string, { steps: number; out: boolean; touched: boolean }>;
  result: 'lookout' | 'runners' | null;
}

const HORIZON = 270;
const START_X = 110;
const GOAL_X = 1050;
const LOOKOUT_X = 1150;
const FEINT_MS = 300;

/** Row r of the depth perspective (0 = front). */
const row = (r: number) => {
  const s = 1 / (1 + 0.5 * r);
  return { s, y: 610 - (1 - s) * 420 };
};
const X = (x: number, s: number) => 640 + (x - 640) * s;

export default defineMicrogame({
  id: 'soleil',
  verb: '1, 2, 3… SOLEIL !',
  create(ctx) {
    const actors = new Map(ctx.players.map((p) => [p.id, new Actor(p, 'idle')]));
    const steppedAt = new Map<string, number>();
    const shownSteps = new Map<string, number>();
    let state: State | null = null;
    let last: -1 | 1 | null = null;
    let clock = 0;
    let resultAt = -1;
    return {
      input(e) {
        if (!state || state.result) return;
        const side = sideOf(e);
        if (state.lookout === ctx.me.id) {
          if (side === 1 || (e.type === 'down' && e.x === null)) ctx.send({ type: 'turn' });
          else if (side === -1) ctx.send({ type: 'feint' });
          return;
        }
        if (side === null || side === last) return;
        last = side;
        ctx.send({ type: 'step', side });
        ctx.sfx('tap');
      },
      onState(s) {
        const next = s as State;
        for (const [id, r] of Object.entries(next.runners)) if (r.steps !== state?.runners[id]?.steps) steppedAt.set(id, clock);
        if (next.result && !state?.result) resultAt = clock;
        state = next;
      },
      onEvent(e: TypedPayload) {
        if (e.type === 'turn' || e.type === 'feint') ctx.sfx(e.type === 'turn' ? 'go' : 'select');
        if (e.type === 'caught') {
          actors.get(String(e.playerId))?.force('hurt');
          if (e.playerId === ctx.me.id) {
            ctx.sfx('hurt');
            ctx.shake(260);
          }
        }
        if (e.type === 'touch') ctx.sfx('pop');
      },
      update(dt, t) {
        clock = t;
        if (!state) return;
        for (const [id, a] of actors) {
          const r = state.runners[id];
          if (r) {
            const target = r.steps / state.goal;
            shownSteps.set(id, (shownSteps.get(id) ?? 0) + (target - (shownSteps.get(id) ?? 0)) * Math.min(1, dt / 90));
            if (r.out) a.set('hurt');
            else if (state.result === 'runners') a.set('win');
            else a.set(t - (steppedAt.get(id) ?? -1e9) < 220 ? 'run' : 'idle');
          } else a.set(state.result === 'lookout' ? 'win' : state.result === 'runners' ? 'lose' : 'idle');
          a.update(dt);
        }
      },
      draw(t) {
        sceneBg('neige', HORIZON, 0, true);
        const c = g();
        c.fillStyle = '#eef4ff';
        c.fillRect(0, HORIZON, 1280, 720 - HORIZON);
        if (!state) return;
        const now = ctx.serverNow();
        const meLookout = state.lookout === ctx.me.id;
        const runners = ctx.players.filter((p) => p.id !== state!.lookout).sort((a, b) => Number(b.isMe) - Number(a.isMe));
        const base = meLookout ? 1 : 0;
        const rows = runners.map((p, i) => ({ p, d: row(base + i) }));
        const back = row(base + runners.length);
        // Track with a lane per runner, and the goal line.
        const front = row(base);
        c.fillStyle = 'rgba(160,190,230,.35)';
        c.beginPath();
        c.moveTo(X(50, front.s), front.y + 30 * front.s);
        c.lineTo(X(GOAL_X + 80, front.s), front.y + 30 * front.s);
        c.lineTo(X(GOAL_X + 80, back.s), back.y);
        c.lineTo(X(50, back.s), back.y);
        c.closePath();
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 6;
        c.setLineDash([18, 14]);
        c.beginPath();
        c.moveTo(X(GOAL_X + 40, front.s), front.y + 30 * front.s);
        c.lineTo(X(GOAL_X + 40, back.s), back.y);
        c.stroke();
        c.setLineDash([]);
        const watching = state.phase === 'watch' || (state.phase === 'turn' && now - state.phaseAt > 100) || (state.feintAt !== null && now - state.feintAt < FEINT_MS * 0.7);
        const lookoutRow = meLookout ? row(0) : row(Math.max(1, Math.round(runners.length / 2)));
        const drawLookout = () => {
          const p = ctx.players.find((pp) => pp.id === state!.lookout);
          const a = actors.get(state!.lookout);
          if (!p || !a) return;
          const s = lookoutRow.s;
          const x = X(LOOKOUT_X, s);
          const h = 280 * s;
          a.draw(x, lookoutRow.y, h, { flip: watching });
          outlineText(p.isMe ? 'TOI' : p.nickname, x, lookoutRow.y - h - 14, Math.round(28 * s + 8), p.isMe ? '#ffe04a' : p.color, 'center', 6);
          if (state!.phase === 'watch') {
            for (const side of [-1, 1]) {
              ellipse(x + side * 26 * (s + 0.2), lookoutRow.y - h - 60 * s - 20, 22 * (s + 0.2), 15 * (s + 0.2), '#fff', 5);
              ellipse(x + side * 26 * (s + 0.2) - 8, lookoutRow.y - h - 60 * s - 20, 8 * (s + 0.2), 8 * (s + 0.2), '#ff3b3b', 0);
            }
          } else if (state!.phase === 'back' && !state!.result) {
            const k = Math.min(2, Math.floor((now - state!.phaseAt) / 420));
            outlineText(['1…', '2…', '3…'][k]!, x, lookoutRow.y - h - 60 * s - 20, Math.round(48 * (s + 0.3)), '#fff', 'center', 7);
          }
        };
        const drawRunner = ({ p, d }: { p: (typeof runners)[number]; d: { s: number; y: number } }) => {
          const r = state!.runners[p.id];
          const x = X(START_X + (shownSteps.get(p.id) ?? 0) * (GOAL_X - START_X), d.s);
          const h = 250 * d.s;
          c.save();
          if (r?.out) c.globalAlpha = 0.55;
          actors.get(p.id)?.draw(x, d.y, h);
          c.restore();
          outlineText(p.isMe ? 'TOI' : p.nickname, x, d.y - h - 10, Math.round(26 * d.s + 8), p.isMe ? '#ffe04a' : p.color, 'center', 5);
          if (r?.out) outlineText('PRIS !', x + 70 * d.s, d.y - h * 0.5, Math.round(34 * d.s + 6), '#ff6b6b');
          if (r?.touched) outlineText('TOUCHÉ !', x, d.y - h - 50 * d.s - 10, Math.round(44 * d.s + 8), '#7dff9b');
        };
        // Back to front.
        const items = rows.map((r) => ({ s: r.d.s, draw: () => drawRunner(r) }));
        items.push({ s: lookoutRow.s, draw: drawLookout });
        items.sort((a, b) => a.s - b.s).forEach((it) => it.draw());
        if (state.phase === 'turn') slam('SOLEIL !', now - state.phaseAt, '#ffe04a', 640, 180, 110);
        if (!state.result) {
          if (meLookout) {
            keyCap(560, 110, 'left', 0.9);
            outlineText('feinte', 560, 162, 20, '#fff', 'center', 4);
            keyCap(720, 110, 'right', 1);
            outlineText('se retourner', 720, 162, 20, '#fff', 'center', 4);
          } else if (state.runners[ctx.me.id] && !state.runners[ctx.me.id]!.out) {
            const next = last === -1 ? 1 : -1;
            keyCap(580, 110, 'left', next === -1 ? 1 : 0.75, next === -1 ? 'next' : null);
            keyCap(700, 110, 'right', next === 1 ? 1 : 0.75, next === 1 ? 'next' : null);
            outlineText('avance · STOP quand il regarde !', 640, 166, 20, '#fff', 'center', 4);
          }
        } else slam(state.result === 'lookout' ? 'LE GUETTEUR GAGNE !' : 'TOUCHÉ !', t - resultAt, '#ffe04a', 640, 230, 80, 1000);
      },
    };
  },
});
