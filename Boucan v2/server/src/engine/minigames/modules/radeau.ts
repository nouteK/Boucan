import { z } from 'zod';
import { defineMiniGame, type RoundOutcome } from '../api';
import { Alternation, BotClock, Side, twoTeams } from '../kits/duel';

/**
 * DUEL « Descente en radeau » — two teams, one raft each. Paddle left,
 * right, left… to speed up, but slow down before the two rapids: entering a
 * rapid too fast capsizes the raft for almost a second. First raft past the
 * buoys wins; at the end, the one further down the river wins.
 *
 * State : { length, rapids: [from, to][], rafts: [{ team: id[], x, speed, capsized, splashAt }], winner: 0 | 1 | null }
 * Events: { type: 'capsize', raft }, { type: 'arrived', raft }
 */
const Input = z.object({ type: z.literal('paddle'), side: Side });
const LENGTH = 850;
const P = { stroke: 0.072, drag: 2, maxSafe: 0.2, capsizeMs: 850, smoothing: 250, rapidWidth: 95 };
const SHOW_MS = 1000;

interface Raft {
  team: string[];
  x: number;
  v: number;
  vs: number;
  capsizedUntil: number;
  splashAt: number | null;
  done: boolean;
}

export const radeau = defineMiniGame<z.infer<typeof Input>>({
  id: 'radeau',
  input: { schema: Input, ratePerSecond: 20 },
  acceptsReports: false,
  stateHz: 20,
  start(ctx) {
    const rafts: Raft[] = twoTeams(ctx.participants, ctx.rng).map((team) => ({ team, x: 0, v: 0, vs: 0, capsizedUntil: 0, splashAt: null, done: false }));
    const raftOf = (id: string) => rafts.findIndex((r) => r.team.includes(id));
    const r1 = ctx.rng.range(245, 305);
    const r2 = ctx.rng.range(510, 580);
    const rapids: [number, number][] = [
      [r1, r1 + P.rapidWidth],
      [r2, r2 + P.rapidWidth],
    ];
    const alternation = new Alternation();
    let winner: number | null = null;
    let wonAt = 0;
    let last = ctx.activeAt;
    const bots = ctx.participants
      .filter((id) => ctx.isBot(id))
      .map((id) => {
        const skill = ctx.skillOf(id);
        return { id, skill, clock: new BotClock(ctx.activeAt + ctx.rng.range(0, 250), () => (1000 / (3.6 + 2.6 * skill)) * ctx.rng.range(0.8, 1.25)) };
      });

    const publish = (now: number) =>
      ctx.setState({
        length: LENGTH,
        rapids,
        rafts: rafts.map((r) => ({ team: r.team, x: r.x, speed: r.vs / P.maxSafe, capsized: now < r.capsizedUntil, splashAt: r.splashAt })),
        winner,
      });
    publish(ctx.activeAt);

    const paddle = (id: string, side: Side, now: number) => {
      const i = raftOf(id);
      const raft = rafts[i];
      if (!raft || raft.done || winner !== null || now < raft.capsizedUntil || !alternation.accept(id, side)) return;
      raft.v += P.stroke / raft.team.length;
    };

    const finish = (i: number, now: number) => {
      if (winner !== null) return;
      winner = i;
      wonAt = now;
      rafts.forEach((r, k) => r.team.forEach((id) => ctx.settle(id, k === i ? 'success' : 'failure')));
      ctx.emit({ type: 'arrived', raft: i });
    };

    return {
      onInput(playerId, input, { now }) {
        paddle(playerId, input.side, now);
      },
      onTick(now) {
        const dt = Math.max(0, now - last);
        last = now;
        for (const bot of bots) {
          if (!bot.clock.due(now)) continue;
          const raft = rafts[raftOf(bot.id)]!;
          // Bots ease off before a rapid (the better ones more reliably).
          const near = rapids.some(([a, b]) => raft.x > a - 90 && raft.x < b);
          if (near && raft.vs > P.maxSafe * (0.72 + 0.3 * (1 - bot.skill) * ctx.rng.next())) continue;
          paddle(bot.id, alternation.next(bot.id), now);
        }
        rafts.forEach((raft, i) => {
          if (now < raft.capsizedUntil) raft.v *= Math.exp(-dt / 150);
          raft.v *= Math.exp((-dt / 1000) * P.drag);
          raft.vs += (raft.v - raft.vs) * Math.min(1, dt / P.smoothing);
          if (!raft.done) raft.x += raft.v * dt;
          const inRapid = rapids.some(([a, b]) => raft.x > a && raft.x < b);
          if (inRapid && now >= raft.capsizedUntil && raft.vs > P.maxSafe) {
            raft.capsizedUntil = now + P.capsizeMs;
            raft.splashAt = now;
            raft.v *= 0.15;
            ctx.emit({ type: 'capsize', raft: i });
          }
          if (!raft.done && raft.x >= LENGTH) {
            raft.done = true;
            raft.x = LENGTH;
            finish(i, now);
          }
        });
        publish(now);
      },
      isComplete: (now) => winner !== null && now >= wonAt + SHOW_MS,
      results(now) {
        if (winner === null) finish(rafts[1] && rafts[1].x > rafts[0]!.x ? 1 : 0, now);
        const out: Record<string, RoundOutcome> = {};
        rafts.forEach((r, k) => r.team.forEach((id) => (out[id] = k === winner ? 'success' : 'failure')));
        return out;
      },
    };
  },
});
