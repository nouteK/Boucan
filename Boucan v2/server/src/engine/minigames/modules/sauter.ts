import { z } from 'zod';
import { defineMiniGame, reject, type RoundOutcome } from '../api';

/**
 * DUEL « Corde à sauter » — everyone stands in a line inside a long rope
 * turned by two bombs. Each time the rope sweeps the ground, whoever is not
 * in the air is out. The rope turns faster every turn. Last one jumping wins
 * (players knocked out on the same turn as the last ones all win together);
 * when time is up, every survivor wins.
 *
 * The rope schedule is deterministic (see ropeTurns), so clients draw it from
 * the server clock; the server judges each sweep with the lag-compensated
 * jump times, a little after the sweep so late packets still count.
 *
 * State : { order: [id], start, jumps: { [id]: at }, out: { [id]: turn }, turn, winners: [id] | null }
 * Events: { type: 'jump', playerId, at }, { type: 'out', playerIds, turn }
 */
const Input = z.object({ type: z.literal('jump') });

export const SAUTER = {
  /** Rope period of the first turn, factor per turn, fastest period (ms). */
  period0: 1300,
  speedUp: 0.9,
  minPeriod: 420,
  /** Jump height (m) and the height needed when the rope passes. */
  height: 0.75,
  clear: 0.3,
  /** Before the rope starts turning (ms). */
  prepMs: 1300,
  /** Sweeps are judged this long after they happen (late inputs). */
  judgeDelayMs: 150,
  showMs: 1300,
};
const P = SAUTER;

/** Period of turn i (turn 0 is the first sweep: half a turn from the top). */
export function ropePeriod(i: number): number {
  return Math.max(P.minPeriod, P.period0 * P.speedUp ** i);
}

/** Time of the i-th sweep of the rope along the ground, from the start of the rope. */
export function sweepTime(i: number): number {
  let t = ropePeriod(0) / 2;
  for (let k = 1; k <= i; k++) t += ropePeriod(k);
  return t;
}

/** Jump duration while the rope turns with period T. */
export function jumpMs(period: number): number {
  return Math.min(460, period * 0.85);
}

/** Height (m) of a jump started at `jumpAt` (with duration `ms`), at time `t`. */
export function jumpHeight(jumpAt: number | undefined, ms: number, t: number): number {
  if (jumpAt === undefined) return 0;
  const k = (t - jumpAt) / ms;
  return k < 0 || k > 1 ? 0 : P.height * 4 * k * (1 - k);
}

export const sauter = defineMiniGame<z.infer<typeof Input>>({
  id: 'sauter',
  input: { schema: Input, ratePerSecond: 10 },
  acceptsReports: false,
  stateHz: 15,
  start(ctx) {
    const order = ctx.rng.shuffle(ctx.participants);
    const start = ctx.activeAt + P.prepMs;
    /** Last jump of each player: start time and duration (the period when it started). */
    const jumps = new Map<string, { at: number; ms: number }>();
    const out = new Map<string, number>();
    let turn = 0;
    let winners: string[] | null = null;
    let endAt = 0;
    const bots = order
      .filter((id) => ctx.isBot(id))
      .map((id) => ({ id, skill: ctx.skillOf(id), plannedTurn: -1, at: 0 }));

    const periodAt = (t: number) => {
      let i = 0;
      while (start + sweepTime(i) <= t) i++;
      return ropePeriod(i);
    };
    const publish = () =>
      ctx.setState({
        order,
        start,
        jumps: Object.fromEntries([...jumps].map(([id, j]) => [id, j.at])),
        out: Object.fromEntries(out),
        turn,
        winners,
      });
    publish();

    const finish = (ids: string[], now: number) => {
      if (winners) return;
      winners = ids;
      endAt = now;
      for (const id of order) ctx.settle(id, ids.includes(id) ? 'success' : 'failure');
      publish();
    };

    const jump = (id: string, at: number) => {
      if (winners) return reject('over');
      if (out.has(id)) return reject('out');
      const prev = jumps.get(id);
      if (prev && at < prev.at + prev.ms) return reject('inAir');
      if (at < start - 200) return reject('early');
      const ms = jumpMs(periodAt(at));
      jumps.set(id, { at, ms });
      ctx.emit({ type: 'jump', playerId: id, at });
      publish();
    };

    return {
      onInput(playerId, _input, { at }) {
        return jump(playerId, at);
      },
      onTick(now) {
        if (winners) return;
        // Bots: jump so that the sweep falls mid-jump, with some error (more as the rope speeds up).
        for (const b of bots) {
          if (out.has(b.id)) continue;
          if (b.plannedTurn !== turn) {
            b.plannedTurn = turn;
            const sweep = start + sweepTime(turn);
            const half = jumpMs(ropePeriod(turn)) / 2;
            const error = ctx.rng.range(-1, 1) * (25 + 150 * (1 - b.skill)) * (1 + turn * 0.12);
            const blunder = ctx.rng.chance(0.02 + 0.05 * (1 - b.skill)) ? ctx.rng.range(-260, 260) : 0;
            b.at = sweep - half + error + blunder;
          }
          if (now >= b.at) {
            b.at = Infinity;
            jump(b.id, now);
          }
        }
        // Judge the sweep once late inputs had their chance.
        const sweep = start + sweepTime(turn);
        if (now < sweep + P.judgeDelayMs) return;
        const alive = order.filter((id) => !out.has(id));
        const lost = alive.filter((id) => {
          const j = jumps.get(id);
          return jumpHeight(j?.at, j?.ms ?? 1, sweep) < P.height * P.clear;
        });
        for (const id of lost) out.set(id, turn);
        if (lost.length > 0) ctx.emit({ type: 'out', playerIds: lost, turn });
        turn += 1;
        const still = alive.filter((id) => !out.has(id));
        if (still.length <= 1) finish(still.length === 1 ? still : lost, now);
        else publish();
      },
      isComplete: (now) => winners !== null && now >= endAt + P.showMs,
      results(now) {
        finish(
          order.filter((id) => !out.has(id)),
          now,
        );
        return Object.fromEntries(order.map((id): [string, RoundOutcome] => [id, winners!.includes(id) ? 'success' : 'failure']));
      },
    };
  },
});
