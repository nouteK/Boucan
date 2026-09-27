import { z } from 'zod';
import { defineMiniGame, reject, type RoundOutcome } from '../api';

/**
 * DUEL « La course » — mash to run; the last one to cross the line (or
 * everyone who has not crossed it when time is up) loses.
 * Progress is counted on the server (one tap = one step, rate limited).
 *
 * State : { runners: { [id]: { d: 0..1, place: number | null } } }
 * Events: { type: 'finish', playerId, place }
 */
const Input = z.object({ type: z.literal('tap') });
const STEPS = 30;

export const course = defineMiniGame<z.infer<typeof Input>>({
  id: 'course',
  input: { schema: Input, ratePerSecond: 14 },
  acceptsReports: false,
  stateHz: 15,
  start(ctx) {
    const runners = new Map(ctx.participants.map((id) => [id, { steps: 0, place: null as number | null }]));
    let finishers = 0;
    const bots = ctx.participants
      .filter((id) => ctx.isBot(id))
      .map((id) => ({ id, next: ctx.activeAt + ctx.rng.range(80, 250), rate: 5.2 + ctx.skillOf(id) * 4.5 }));

    const publish = () =>
      ctx.setState({
        runners: Object.fromEntries(
          [...runners].map(([id, r]) => [id, { d: Math.min(1, r.steps / STEPS), place: r.place }]),
        ),
      });
    publish();

    const step = (id: string) => {
      const r = runners.get(id)!;
      if (r.place !== null) return reject('finished');
      r.steps += 1;
      if (r.steps >= STEPS) {
        finishers += 1;
        r.place = finishers;
        ctx.emit({ type: 'finish', playerId: id, place: finishers });
        if (finishers < ctx.participants.length) ctx.settle(id, 'success');
      }
      publish();
    };

    return {
      onInput(playerId) {
        return step(playerId);
      },
      onTick(now) {
        for (const bot of bots) {
          while (now >= bot.next && runners.get(bot.id)!.place === null) {
            step(bot.id);
            bot.next += (1000 / bot.rate) * ctx.rng.range(0.8, 1.2);
          }
        }
      },
      // The race stops as soon as only one runner is left on the track.
      isComplete: () => finishers >= ctx.participants.length - 1,
      results() {
        const out: Record<string, RoundOutcome> = {};
        const unfinished = [...runners].filter(([, r]) => r.place === null).map(([id]) => id);
        const last = unfinished.length === 0 ? [...runners].find(([, r]) => r.place === finishers)?.[0] : null;
        for (const id of ctx.participants) {
          out[id] = unfinished.includes(id) || id === last ? 'failure' : 'success';
          ctx.settle(id, out[id]);
        }
        return out;
      },
    };
  },
});
