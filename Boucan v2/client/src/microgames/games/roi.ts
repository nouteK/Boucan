import type { TypedPayload } from '@boucan/shared';
import { ellipse, g, INK, outlineText, poly, slam, star } from '../../engine/draw';
import { defineMicrogame } from '../api';
import { sceneBg } from '../backdrops';
import { Actor, sideOf } from '../common';
import { keyCap } from '../props';

/**
 * DUEL — LE ROI DE LA COLLINE : one king on the summit, the others climb by
 * pressing left, right, left… The king strikes a slope (← / → or a side of
 * the screen) after a wind-up everyone sees: climbers near the top tumble —
 * unless they hold on (keep a finger down, or ↓). Summit = dethroned king.
 */
interface State {
  king: string;
  strike: { side: -1 | 1; at: number; phase: 'wind' | 'hit' } | null;
  climbers: Record<string, { side: -1 | 1; height: number; stunned: boolean; holding: boolean }>;
  result: 'king' | 'climbers' | null;
}

const BASE_Y = 560;
const PEAK = { x: 640, y: 250 };
/** Climbers above this height are within the king's reach (same as the server). */
const REACH = 0.68;
const HOLD_AFTER_MS = 180;

/** Point on a slope at height 0..1 (quadratic curve from the foot to the summit). */
function slope(side: -1 | 1, k: number): { x: number; y: number } {
  const u = 1 - k;
  const bx = u * u * 160 + 2 * u * k * 420 + k * k * 560;
  const by = u * u * BASE_Y + 2 * u * k * (PEAK.y + 40) + k * k * PEAK.y;
  return { x: side < 0 ? bx : 1280 - bx, y: by };
}

export default defineMicrogame({
  id: 'roi',
  verb: 'LE ROI DE LA COLLINE !',
  create(ctx) {
    const actors = new Map(ctx.players.map((p) => [p.id, new Actor(p, 'idle')]));
    const shown = new Map<string, number>();
    const climbedAt = new Map<string, number>();
    const pows: { id: string; t: number; held: boolean }[] = [];
    let state: State | null = null;
    let last: -1 | 1 | null = null;
    let downAt: number | null = null;
    let holding = false;
    let clock = 0;
    let resultAt = -1;
    const setHold = (on: boolean) => {
      if (on === holding) return;
      holding = on;
      ctx.send({ type: 'hold', on });
    };
    return {
      input(e) {
        if (!state || state.result) return;
        const side = sideOf(e);
        if (state.king === ctx.me.id) {
          if (side !== null) ctx.send({ type: 'strike', side });
          return;
        }
        if (e.type === 'down') downAt = clock;
        if (e.type === 'up') {
          downAt = null;
          setHold(false);
        }
        if (e.type === 'key' && e.key === 'down' && !e.repeat) setHold(true);
        if (e.type === 'keyup' && e.key === 'down') setHold(false);
        if (side === null || side === last || holding) return;
        last = side;
        ctx.send({ type: 'climb', side });
        ctx.sfx('tap');
      },
      onState(s) {
        const next = s as State;
        for (const [id, c] of Object.entries(next.climbers)) if (c.height > (state?.climbers[id]?.height ?? 0)) climbedAt.set(id, clock);
        if (next.result && !state?.result) resultAt = clock;
        state = next;
      },
      onEvent(e: TypedPayload) {
        if (e.type === 'windup') ctx.sfx('whoosh');
        if (e.type === 'knock' || e.type === 'held') {
          pows.push({ id: String(e.playerId), t: 0, held: e.type === 'held' });
          if (e.type === 'knock') actors.get(String(e.playerId))?.force('hurt');
          if (e.playerId === ctx.me.id) {
            ctx.sfx(e.type === 'knock' ? 'hit' : 'block');
            if (e.type === 'knock') ctx.shake(240);
          }
        }
        if (e.type === 'summit') ctx.sfx('pop');
      },
      update(dt, t) {
        clock = t;
        if (downAt !== null && t - downAt > HOLD_AFTER_MS) setHold(true);
        for (let i = pows.length - 1; i >= 0; i--) if ((pows[i]!.t += dt) > 450) pows.splice(i, 1);
        if (!state) return;
        for (const [id, a] of actors) {
          const c = state.climbers[id];
          if (c) {
            shown.set(id, (shown.get(id) ?? 0) + (c.height - (shown.get(id) ?? 0)) * Math.min(1, dt / 90));
            if (c.stunned) a.set('hurt');
            else if (state.result === 'climbers') a.set('win');
            else if (c.holding) a.set('duck');
            else a.set(t - (climbedAt.get(id) ?? -1e9) < 220 ? 'run' : 'idle');
          } else if (state.king === id) a.set(state.strike?.phase === 'wind' ? 'punch' : state.result === 'king' ? 'win' : 'idle');
          a.update(dt);
        }
      },
      draw(t) {
        sceneBg('foret', BASE_Y, 0, true);
        const c = g();
        c.fillStyle = '#2f2455';
        c.fillRect(0, BASE_Y, 1280, 720 - BASE_Y);
        // The hill.
        c.fillStyle = '#5fbf5a';
        c.strokeStyle = INK;
        c.lineWidth = 8;
        c.beginPath();
        c.moveTo(40, BASE_Y + 60);
        c.lineTo(160, BASE_Y);
        c.quadraticCurveTo(420, PEAK.y + 40, 560, PEAK.y);
        c.lineTo(720, PEAK.y);
        c.quadraticCurveTo(860, PEAK.y + 40, 1120, BASE_Y);
        c.lineTo(1240, BASE_Y + 60);
        c.closePath();
        c.fill();
        c.stroke();
        for (let i = 0; i < 9; i++) ellipse(300 + i * 85, BASE_Y - 20 - Math.sin((i / 8) * Math.PI) * 170, 26, 9, 'rgba(255,255,255,.18)', 0);
        if (!state) return;
        // The coming blow: red zone on the struck slope.
        if (state.strike?.phase === 'wind') {
          const s = state.strike.side;
          const a = 0.35 + 0.35 * Math.sin(t / 40);
          const r0 = slope(s, REACH);
          poly([[r0.x, r0.y + 30], [PEAK.x + s * 80, PEAK.y + 30], [PEAK.x + s * 80, PEAK.y - 230], [r0.x, r0.y - 200]], `rgba(255,60,60,${a})`, 0);
          outlineText('!', PEAK.x + s * 150, PEAK.y - 200, 70, '#ff3b3b', 'center', 8);
        }
        const king = ctx.players.find((p) => p.id === state!.king);
        if (king) {
          const flip = state.strike ? state.strike.side < 0 : Math.sin(t / 500) < 0;
          actors.get(king.id)?.draw(PEAK.x, PEAK.y, 234, { flip });
          c.save();
          c.translate(PEAK.x, PEAK.y - 244);
          poly([[-34, 10], [-34, -22], [-17, -6], [0, -30], [17, -6], [34, -22], [34, 10]], '#ffd23c', 5);
          c.restore();
          outlineText(king.isMe ? 'TOI' : king.nickname, PEAK.x, PEAK.y - 300, 28, king.isMe ? '#ffe04a' : king.color);
        }
        for (const p of ctx.players) {
          const cl = state.climbers[p.id];
          if (!cl) continue;
          const q = slope(cl.side, shown.get(p.id) ?? 0);
          actors.get(p.id)?.draw(q.x, q.y, 204, { flip: cl.side > 0, rot: cl.side < 0 ? -0.3 : 0.3 });
          outlineText(p.isMe ? 'TOI' : p.nickname, q.x, q.y - 220, p.isMe ? 28 : 22, p.isMe ? '#ffe04a' : p.color);
          if (cl.height >= 1) outlineText('AU SOMMET !', q.x, q.y - 270, 36, '#7dff9b');
        }
        for (const pw of pows) {
          const cl = state.climbers[pw.id];
          if (!cl) continue;
          const q = slope(cl.side, shown.get(pw.id) ?? 0);
          star(q.x, q.y - 120, pw.t / 450);
          outlineText(pw.held ? 'ACCROCHÉ !' : 'POW !', q.x, q.y - 180, 40, pw.held ? '#7dff9b' : '#ffe04a');
        }
        if (!state.result) {
          if (state.king === ctx.me.id) {
            keyCap(90, 110, 'left', 1);
            outlineText('frappe', 90, 162, 20, '#fff', 'center', 4);
            keyCap(210, 110, 'right', 1);
            outlineText('frappe', 210, 162, 20, '#fff', 'center', 4);
          } else if (state.climbers[ctx.me.id]) {
            const next = last === -1 ? 1 : -1;
            keyCap(80, 110, 'left', next === -1 ? 1 : 0.75, next === -1 ? 'next' : null);
            keyCap(180, 110, 'right', next === 1 ? 1 : 0.75, next === 1 ? 'next' : null);
            keyCap(280, 110, 'down', holding ? 1 : 0.75, holding ? 'ok' : null);
            outlineText('grimpe · maintiens = s’accrocher', 180, 166, 18, '#fff', 'center', 4);
          }
        } else slam(state.result === 'king' ? 'VIVE LE ROI !' : 'DÉTRÔNÉ !', t - resultAt, '#ffe04a', 640, 150, 90);
      },
    };
  },
});
