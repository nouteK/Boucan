import { z } from 'zod';
import { defineMiniGame, reject, type RoundOutcome } from '../api';
import { Alternation, Side } from '../kits/duel';

/**
 * DUEL « 1, 2, 3… soleil ! » — one player (drawn at random) is the lookout,
 * back turned; everyone else runs to them by pressing left, right, left…
 * The lookout turns around (tap) or fakes it (feint): anyone still moving
 * while they watch is caught. A runner who touches the lookout wins it for
 * all the runners still in; if nobody makes it in time, the lookout wins.
 * Steps are judged on lag-compensated press times, with a short grace.
 *
 * State : { lookout, phase: 'back' | 'turn' | 'watch', phaseAt, feintAt, goal, runners: { [id]: { steps, out, touched } }, result: 'lookout' | 'runners' | null }
 * Events: { type: 'turn' }, { type: 'feint' }, { type: 'caught', playerId }, { type: 'touch', playerId }
 */
const Input = z.union([
  z.object({ type: z.literal('step'), side: Side }),
  z.object({ type: z.literal('turn') }),
  z.object({ type: z.literal('feint') }),
]);
const P = {
  goal: 24,
  /** Turning around takes this long; steps during the turn are fine. */
  turnMs: 200,
  /** Once watching, a step is still forgiven for this long (reaction). */
  graceMs: 110,
  humanWatchMs: 1100,
  cooldownMs: 450,
  feintMs: 300,
  feintCooldownMs: 500,
  showMs: 1200,
};

export const soleil = defineMiniGame<z.infer<typeof Input>>({
  id: 'soleil',
  input: { schema: Input, ratePerSecond: 20 },
  acceptsReports: false,
  stateHz: 20,
  start(ctx) {
    const lookout = ctx.rng.pick(ctx.participants);
    const runnerIds = ctx.participants.filter((id) => id !== lookout);
    const runners = new Map(runnerIds.map((id) => [id, { steps: 0, out: false, touched: false }]));
    const alternation = new Alternation();
    let phase: 'back' | 'turn' | 'watch' = 'back';
    let phaseAt = ctx.activeAt;
    let watchMs = P.humanWatchMs;
    let readyAt = ctx.activeAt + 900;
    let feintAt: number | null = null;
    let result: 'lookout' | 'runners' | null = null;
    let resultAt = 0;
    const lookoutBot = ctx.isBot(lookout);
    let nextTurn = 0;
    let nextIsFeint = false;
    // Runner bots: steady steps, and a reaction delay when the lookout moves.
    const bots = runnerIds
      .filter((id) => ctx.isBot(id))
      .map((id) => ({ id, skill: ctx.skillOf(id), next: ctx.activeAt + ctx.rng.range(0, 150), alarmSeen: -Infinity, reaction: 0 }));

    const publish = () =>
      ctx.setState({ lookout, phase, phaseAt, feintAt, goal: P.goal, runners: Object.fromEntries(runners), result });
    publish();

    const finish = (r: 'lookout' | 'runners', now: number) => {
      if (result) return;
      result = r;
      resultAt = now;
      for (const id of ctx.participants) ctx.settle(id, outcomeOf(id));
      publish();
    };
    const outcomeOf = (id: string): RoundOutcome => {
      if (id === lookout) return result === 'runners' ? 'failure' : 'success';
      return result === 'runners' && !runners.get(id)!.out ? 'success' : 'failure';
    };

    const turn = (now: number) => {
      if (phase !== 'back' || now < readyAt || result) return;
      phase = 'turn';
      phaseAt = now;
      watchMs = lookoutBot ? ctx.rng.range(700, 1400) : P.humanWatchMs;
      ctx.emit({ type: 'turn' });
      publish();
    };
    const feint = (now: number) => {
      if (phase !== 'back' || now < readyAt || result || (feintAt !== null && now < feintAt + P.feintCooldownMs)) return;
      feintAt = now;
      readyAt = now + P.feintCooldownMs;
      ctx.emit({ type: 'feint' });
      publish();
    };
    const step = (id: string, side: Side, at: number) => {
      const r = runners.get(id)!;
      if (result || r.out || r.touched || !alternation.accept(id, side)) return;
      if (phase === 'watch' && at > phaseAt + P.graceMs) {
        r.out = true;
        ctx.settle(id, 'failure');
        ctx.emit({ type: 'caught', playerId: id });
        if ([...runners.values()].every((x) => x.out)) finish('lookout', at);
        publish();
        return;
      }
      r.steps += 1;
      if (r.steps >= P.goal) {
        r.touched = true;
        ctx.emit({ type: 'touch', playerId: id });
        finish('runners', at);
      }
      publish();
    };

    return {
      onInput(playerId, input, { now, at }) {
        if (input.type === 'step') {
          if (playerId === lookout) return reject('lookout');
          step(playerId, input.side, at);
        } else if (playerId !== lookout) return reject('notLookout');
        else if (input.type === 'turn') turn(now);
        else feint(now);
      },
      onTick(now) {
        if (result) return;
        if (phase === 'turn' && now >= phaseAt + P.turnMs) {
          phase = 'watch';
          phaseAt = now;
          publish();
        }
        if (phase === 'watch' && now >= phaseAt + watchMs) {
          phase = 'back';
          phaseAt = now;
          readyAt = now + P.cooldownMs;
          publish();
        }
        if (lookoutBot && phase === 'back' && now >= readyAt) {
          if (nextTurn === 0) {
            const best = Math.max(0, ...[...runners.values()].map((r) => (r.out ? 0 : r.steps / P.goal)));
            nextTurn = now + ctx.rng.range(500, 2100) * (1 - 0.35 * best);
            nextIsFeint = ctx.rng.chance(0.3);
          } else if (now >= nextTurn) {
            if (nextIsFeint) {
              feint(now);
              nextTurn = now + ctx.rng.range(250, 700);
              nextIsFeint = false;
            } else {
              turn(now);
              nextTurn = 0;
            }
          }
        }
        const alarmAt = phase !== 'back' ? phaseAt : feintAt !== null && now - feintAt < P.feintMs ? feintAt : null;
        for (const bot of bots) {
          const r = runners.get(bot.id)!;
          if (r.out || r.touched) continue;
          if (alarmAt !== null) {
            if (bot.alarmSeen !== alarmAt) {
              bot.alarmSeen = alarmAt;
              bot.reaction = ctx.rng.range(70, 230) * (1.7 - bot.skill) + (ctx.rng.chance(0.18 * (1 - bot.skill)) ? ctx.rng.range(200, 450) : 0);
            }
            if (now - alarmAt > bot.reaction) continue;
          }
          if (now < bot.next) continue;
          bot.next = now + (1000 / (4.6 + 2.2 * bot.skill)) * ctx.rng.range(0.85, 1.2);
          step(bot.id, alternation.next(bot.id), now);
        }
      },
      isComplete: (now) => result !== null && now >= resultAt + P.showMs,
      results(now) {
        finish('lookout', now);
        return Object.fromEntries(ctx.participants.map((id) => [id, outcomeOf(id)]));
      },
    };
  },
});
