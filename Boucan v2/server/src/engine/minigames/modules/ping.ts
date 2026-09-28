import { z } from 'zod';
import { defineMiniGame, reject, type Rejection, type RoundOutcome } from '../api';

/**
 * DUEL « Ping-pong » — players are paired at random for one-on-one matches
 * played side by side (an odd player out faces the house bot). Move your
 * paddle left / right and swing when the ball reaches you: in reach and on
 * time, it goes back (aim with left / right while swinging); perfect timing
 * smashes it. The ball speeds up with each hit of the rally. First to 2
 * points wins its match; when time is up the one ahead wins (a tie goes to
 * the last hitter, or nobody).
 *
 * The server judges a swing at its lag-compensated time with the paddle
 * position sent by the client (speed-checked), and only gives the point a
 * little after the ball passed, so late packets still count.
 *
 * State : { matches: [{ ids: [near, far | null], sc: [n, n], px: [x, x], ball: { from, x0, x1, t0, d, smash } | null, serveAt, winner: 0 | 1 | null }] }
 *   px, x ∈ [−1, 1] across the table; ball.d = flight time (ms) from `from` to the other side, t0 = when it left.
 * Events: { type: 'swing', m, side }, { type: 'hit', m, side, smash }, { type: 'point', m, side }, { type: 'won', m, side }
 */
const Input = z.union([
  z.object({ type: z.literal('pos'), px: z.number().min(-1).max(1) }),
  z.object({ type: z.literal('swing'), px: z.number().min(-1).max(1), x1: z.number().min(-1).max(1) }),
]);

export const PING = {
  /** Serve flight, speed-up per hit, fastest flight (ms). */
  flight0: 950,
  speedUp: 0.9,
  minFlight: 430,
  pointsToWin: 2,
  /** Paddle speed (table half-widths per second) and reach. */
  paddleSpeed: 2.3,
  reach: 0.36,
  /** A swing hits between these fractions of the flight; perfect around `smashAt`. */
  hitFrom: 0.8,
  hitTo: 1.12,
  smashAt: 0.97,
  smashTol: 0.045,
  smashFactor: 0.78,
  /** Where an aimed return lands (|x1|) and the widest a return can go. */
  aimX: 0.56,
  maxX: 0.6,
  swingCooldownMs: 260,
  firstServeMs: 900,
  serveMs: 750,
  /** A point is given this long after the last moment the ball could be hit. */
  judgeDelayMs: 150,
  houseBotSkill: 0.55,
  showMs: 1300,
};
const P = PING;
const r2 = (x: number) => Math.round(x * 100) / 100;

interface Ball {
  from: 0 | 1;
  x0: number;
  x1: number;
  t0: number;
  d: number;
  smash: boolean;
}
interface Side {
  /** null = house bot. */
  id: string | null;
  px: number;
  pxAt: number;
  readyAt: number;
  bot: boolean;
  skill: number;
  /** Bot brain: ball being played, reaction delay, hit moment, aim error, done. */
  ai: { ball: Ball | null; react: number; hitK: number; err: number; swung: boolean };
}
interface Match {
  sides: [Side, Side];
  sc: [number, number];
  ball: Ball | null;
  serve: 0 | 1;
  serveAt: number;
  flight: number;
  rally: number;
  winner: 0 | 1 | null;
  lastHitter: 0 | 1 | null;
}

/** Lateral position of the ball at time t (it keeps going a bit past the paddle). */
export function ballX(b: Ball, t: number): number {
  const k = Math.min(1.3, Math.max(0, (t - b.t0) / b.d));
  return b.x0 + (b.x1 - b.x0) * k;
}

export const ping = defineMiniGame<z.infer<typeof Input>>({
  id: 'ping',
  input: { schema: Input, ratePerSecond: 30 },
  acceptsReports: false,
  stateHz: 20,
  start(ctx) {
    const order = ctx.rng.shuffle(ctx.participants);
    const side = (id: string | null): Side => ({
      id,
      px: 0,
      pxAt: ctx.activeAt,
      readyAt: 0,
      bot: id === null || ctx.isBot(id),
      skill: id === null ? P.houseBotSkill : ctx.skillOf(id),
      ai: { ball: null, react: 0, hitK: 1, err: 0, swung: false },
    });
    const matches: Match[] = [];
    for (let i = 0; i < order.length; i += 2) {
      matches.push({
        sides: [side(order[i]!), side(order[i + 1] ?? null)],
        sc: [0, 0],
        ball: null,
        serve: ctx.rng.chance(0.5) ? 0 : 1,
        serveAt: ctx.activeAt + P.firstServeMs,
        flight: P.flight0,
        rally: 0,
        winner: null,
        lastHitter: null,
      });
    }
    const where = new Map<string, { m: number; s: 0 | 1 }>();
    matches.forEach((m, i) => m.sides.forEach((s, k) => s.id && where.set(s.id, { m: i, s: k as 0 | 1 })));
    let endAt: number | null = null;
    let last = ctx.activeAt;

    const publish = () =>
      ctx.setState({
        matches: matches.map((m) => ({
          ids: m.sides.map((s) => s.id),
          sc: m.sc,
          px: m.sides.map((s) => r2(s.px)),
          ball: m.ball && { ...m.ball, x0: r2(m.ball.x0), x1: r2(m.ball.x1) },
          serveAt: m.serveAt,
          winner: m.winner,
        })),
      });
    publish();

    const settleMatch = (m: Match) => {
      for (const [k, s] of m.sides.entries()) if (s.id) ctx.settle(s.id, k === m.winner ? 'success' : 'failure');
    };
    const launch = (m: Match, from: 0 | 1, x0: number, x1: number, d: number, t0: number, smash: boolean) => {
      m.ball = { from, x0, x1, t0, d, smash };
    };

    const swing = (mi: number, si: 0 | 1, at: number, px: number, x1: number | null): Rejection | void => {
      const m = matches[mi]!;
      const s = m.sides[si];
      if (m.winner !== null) return reject('over');
      if (at < s.readyAt) return;
      s.readyAt = at + P.swingCooldownMs;
      ctx.emit({ type: 'swing', m: mi, side: si });
      const b = m.ball;
      if (!b || b.from === si) return;
      const k = (at - b.t0) / b.d;
      if (k < P.hitFrom || k > P.hitTo || Math.abs(px - ballX(b, at)) > P.reach) return;
      const smash = Math.abs(k - P.smashAt) < P.smashTol;
      let target = x1;
      if (target === null) {
        const other = m.sides[si === 0 ? 1 : 0];
        target = ctx.rng.chance(0.6) ? -Math.sign(other.px || ctx.rng.range(-1, 1)) * ctx.rng.range(0.3, 0.6) : ctx.rng.range(-0.6, 0.6);
      }
      m.rally += 1;
      m.flight = Math.max(P.minFlight, m.flight * P.speedUp);
      m.lastHitter = si;
      launch(m, si, ballX(b, at), Math.max(-P.maxX, Math.min(P.maxX, target)), m.flight * (smash ? P.smashFactor : 1), at, smash);
      ctx.emit({ type: 'hit', m: mi, side: si, smash });
    };

    const brain = (m: Match, mi: number, si: 0 | 1, now: number, dt: number) => {
      const s = m.sides[si];
      const b = m.ball;
      if (!b || b.from === si) {
        s.px += (0 - s.px) * Math.min(1, dt / 600);
        return;
      }
      const ai = s.ai;
      if (ai.ball !== b) {
        const hard = (P.flight0 / b.d) ** 0.9;
        ai.ball = b;
        ai.react = ctx.rng.range(120, 300) * (1.6 - s.skill);
        ai.hitK = P.smashAt + ctx.rng.range(-1, 1) * (0.05 + 0.16 * (1 - s.skill)) * hard;
        if (ctx.rng.chance((0.06 + 0.12 * (1 - s.skill)) * hard)) ai.hitK += ctx.rng.range(-0.3, 0.3);
        if (ctx.rng.chance((0.07 + 0.06 * m.rally) * (1.3 - s.skill))) ai.hitK = 1.3;
        ai.err = ctx.rng.range(-1, 1) * (0.06 + 0.3 * (1 - s.skill));
        ai.swung = false;
      }
      if (now - b.t0 > ai.react) {
        const d = b.x1 + ai.err - s.px;
        s.px += Math.sign(d) * Math.min(Math.abs(d), (P.paddleSpeed * (0.7 + 0.3 * s.skill) * dt) / 1000);
      }
      if (!ai.swung && (now - b.t0) / b.d >= ai.hitK) {
        ai.swung = true;
        swing(mi, si, now, s.px, null);
      }
    };

    const finishAll = (now: number) => {
      if (endAt !== null) return;
      endAt = now;
      for (const m of matches) {
        if (m.winner !== null) continue;
        m.winner = m.sc[0] !== m.sc[1] ? (m.sc[0] > m.sc[1] ? 0 : 1) : m.ball ? m.ball.from : m.lastHitter;
        settleMatch(m);
      }
      publish();
    };

    return {
      onInput(playerId, input, { at }) {
        const w = where.get(playerId);
        if (!w) return reject('notPlaying');
        const s = matches[w.m]!.sides[w.s];
        // The paddle cannot move faster than its speed (small slack for jitter).
        const max = (P.paddleSpeed * Math.max(0, at - s.pxAt)) / 1000 + 0.1;
        s.px = Math.max(s.px - max, Math.min(s.px + max, input.px));
        s.pxAt = Math.max(s.pxAt, at);
        if (input.type === 'swing') return swing(w.m, w.s, at, s.px, input.x1);
      },
      onTick(now) {
        const dt = Math.max(0, now - last);
        last = now;
        if (endAt !== null) return;
        matches.forEach((m, mi) => {
          if (m.winner !== null) return;
          m.sides.forEach((s, si) => {
            if (s.bot) brain(m, mi, si as 0 | 1, now, dt);
          });
          const b = m.ball;
          if (!b) {
            if (now >= m.serveAt) {
              m.flight = P.flight0;
              launch(m, m.serve, 0, ctx.rng.range(-0.4, 0.4), P.flight0 * 1.1, now, false);
            }
            return;
          }
          if (now < b.t0 + b.d * P.hitTo + P.judgeDelayMs) return;
          // Missed: point for the hitter, the loser serves.
          const w = b.from;
          m.sc[w] += 1;
          m.rally = 0;
          m.ball = null;
          m.serve = w === 0 ? 1 : 0;
          m.serveAt = now + P.serveMs;
          ctx.emit({ type: 'point', m: mi, side: w });
          if (m.sc[w] >= P.pointsToWin) {
            m.winner = w;
            settleMatch(m);
            ctx.emit({ type: 'won', m: mi, side: w });
          }
        });
        if (matches.every((m) => m.winner !== null)) finishAll(now);
        else publish();
      },
      isComplete: (now) => endAt !== null && now >= endAt + P.showMs,
      results(now) {
        finishAll(now);
        const out: Record<string, RoundOutcome> = {};
        for (const m of matches) for (const [k, s] of m.sides.entries()) if (s.id) out[s.id] = k === m.winner ? 'success' : 'failure';
        return out;
      },
    };
  },
});
