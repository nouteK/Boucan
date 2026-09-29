import type { TypedPayload } from '@boucan/shared';
import { box, circle, ellipse, g, INK, outlineText, slam } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { skyline } from '../backdrops';
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
const LIGHTS = { green: '#2fd07a', orange: '#ff9f1c', red: '#ff3b3b' } as const;

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
        skyline(HORIZON, 0, 'soleil');
        const c = g();
        const grass = c.createLinearGradient(0, HORIZON, 0, 720);
        grass.addColorStop(0, '#94d86a');
        grass.addColorStop(1, '#4f9a45');
        c.fillStyle = grass;
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
        c.fillStyle = 'rgba(255,240,200,.35)';
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
        // Green = back turned, orange = turning (or faking), red = watching.
        const light = state.phase === 'watch' ? 'red' : state.phase === 'turn' || (state.feintAt !== null && now - state.feintAt < FEINT_MS) ? 'orange' : 'green';
        const lightCol = LIGHTS[light];
        if (!state.result) {
          const pulse = 0.5 + 0.5 * Math.sin(t / (light === 'red' ? 90 : light === 'orange' ? 60 : 400));
          c.save();
          c.strokeStyle = lightCol;
          c.globalAlpha = light === 'green' ? 0.35 : 0.55 + 0.35 * pulse;
          c.lineWidth = light === 'green' ? 14 : 26 + 10 * pulse;
          c.strokeRect(0, 0, 1280, 720);
          if (light === 'red') {
            c.globalAlpha = 0.16;
            c.fillStyle = '#ff2020';
            c.fillRect(0, 0, 1280, 720);
          }
          c.restore();
        }
        const lookoutRow = meLookout ? row(0) : row(Math.max(1, Math.round(runners.length / 2)));
        const drawLookout = () => {
          const p = ctx.players.find((pp) => pp.id === state!.lookout);
          const a = actors.get(state!.lookout);
          if (!p || !a) return;
          const s = lookoutRow.s;
          const x = X(LOOKOUT_X, s);
          const h = 280 * s;
          if (watching && !state!.result) {
            // Red gaze sweeping the track.
            c.save();
            const cone = c.createLinearGradient(x, 0, X(110, 1), 0);
            cone.addColorStop(0, 'rgba(255,40,40,.45)');
            cone.addColorStop(1, 'rgba(255,40,40,0)');
            c.fillStyle = cone;
            c.beginPath();
            c.moveTo(x - 20, lookoutRow.y - h * 0.8);
            c.lineTo(0, lookoutRow.y - h * 1.6);
            c.lineTo(0, 720);
            c.lineTo(x - 20, lookoutRow.y - h * 0.3);
            c.closePath();
            c.fill();
            c.restore();
          }
          a.draw(x, lookoutRow.y, h, { flip: watching });
          if (!watching && !state!.result) outlineText('ZZZ… DOS', x, lookoutRow.y - h * 0.55, Math.round(30 * s + 10), '#fff', 'center', 5);
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
          const moving = !r?.out && !r?.touched && t - (steppedAt.get(p.id) ?? -1e9) < 220;
          if (moving) {
            c.save();
            c.strokeStyle = light === 'green' ? 'rgba(255,255,255,.7)' : 'rgba(255,60,60,.9)';
            c.lineWidth = 5 * d.s + 1;
            for (let k = 0; k < 3; k++) {
              const yy = d.y - h * (0.3 + k * 0.2);
              c.beginPath();
              c.moveTo(x - 50 * d.s - k * 8, yy);
              c.lineTo(x - 110 * d.s - k * 14, yy);
              c.stroke();
            }
            c.restore();
            if (meLookout) outlineText('!', x, d.y - h - 44 * d.s - 10, Math.round(46 * d.s + 12), '#ffe04a');
          }
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
        if (state.phase === 'turn') slam('SOLEIL !', now - state.phaseAt, '#ffe04a', 640, 250, 110);
        if (!state.result) {
          // Giant traffic light and what to do now.
          box(522, 22, 236, 80, INK, 5, 40);
          (['green', 'orange', 'red'] as const).forEach((k, i) => {
            const on = k === light;
            circle(568 + i * 72, 62, 27, on ? LIGHTS[k] : '#3a3a3a', 0);
            if (on) circle(568 + i * 72, 62, 40, 'rgba(255,255,255,.2)', 0);
          });
          const msg = meLookout
            ? { red: 'TU REGARDES ! ATTRAPE CEUX QUI BOUGENT', orange: 'TU TE RETOURNES…', green: 'DOS TOURNÉ : ILS AVANCENT !' }[light]
            : { red: 'STOP ! NE BOUGE PLUS', orange: 'ATTENTION… IL SE RETOURNE', green: 'COURS !' }[light];
          outlineText(msg, 640, 136, light === 'green' && !meLookout ? 48 : 34, lightCol, 'center', 7);
          if (meLookout) {
            const ready = state.phase === 'back';
            keyCap(90, 90, 'right', ready ? 1.05 : 0.7, ready ? 'next' : null);
            outlineText(ready ? 'SE RETOURNER' : '…', 90, 146, 18, ready ? '#7dff9b' : '#aaa', 'center', 4);
            keyCap(210, 90, 'left', 0.8);
            outlineText('feinte', 210, 146, 18, '#fff', 'center', 4);
          } else if (state.runners[ctx.me.id] && !state.runners[ctx.me.id]!.out) {
            const next = last === -1 ? 1 : -1;
            keyCap(90, 90, 'left', next === -1 ? 1.05 : 0.7, next === -1 ? 'next' : null);
            keyCap(200, 90, 'right', next === 1 ? 1.05 : 0.7, next === 1 ? 'next' : null);
            outlineText('alterne pour avancer', 145, 146, 18, '#fff', 'center', 4);
          }
        } else slam(state.result === 'lookout' ? 'LE GUETTEUR GAGNE !' : 'TOUCHÉ !', t - resultAt, '#ffe04a', 640, 230, 80, 1000);
      },
    };
  },
});
