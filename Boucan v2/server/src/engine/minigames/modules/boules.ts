import { z } from 'zod';
import { defineMiniGame, type RoundOutcome } from '../api';

/**
 * DUEL « Bataille de boules de neige » — the same volley of snowballs flies at
 * everyone: duck (tap) just before each one lands. Whoever takes the most
 * hits loses (nobody, if nobody was hit). The volley is public (it is on
 * screen anyway); ducks are judged on lag-compensated press times.
 *
 * State : { impacts: number[] (server times), sides: { [id]: (−1|1)[] }, hits: { [id]: n }, ducks: { [id]: pressTime } }
 * Events: { type: 'hit', playerId, ball }, { type: 'dodge', playerId, ball }
 */
const Input = z.object({ type: z.literal('duck') });
/** A duck: head down from +DOWN_MS to +UP_MS after the press, then a short recovery. */
const DOWN_MS = 60;
const UP_MS = 440;
const RECOVER_MS = 100;
const FLIGHT_MS = 700;
const VOLLEY = [600, 1400, 2100, 2900, 3600, 4300];
const JITTER = 70;
const END_PAUSE_MS = 700;
/** Impacts are judged a little late so that a duck pressed in time but still in transit counts (lag compensation window). */
const JUDGE_DELAY_MS = 150;

export const boules = defineMiniGame<z.infer<typeof Input>>({
  id: 'boules',
  input: { schema: Input, ratePerSecond: 8 },
  acceptsReports: false,
  stateHz: 15,
  start(ctx) {
    const impacts = VOLLEY.map((t) => ctx.activeAt + t + ctx.rng.range(-JITTER, JITTER) + FLIGHT_MS);
    const sides = Object.fromEntries(ctx.participants.map((id) => [id, impacts.map(() => (ctx.rng.chance(0.5) ? -1 : 1))]));
    const hits = new Map(ctx.participants.map((id) => [id, 0]));
    /** Every duck press per player (a late-judged ball may concern the previous one). */
    const ducks = new Map<string, number[]>(ctx.participants.map((id) => [id, []]));
    let resolved = 0;
    // Bots: for each ball, a well-timed duck (or a late / missing one) decided in advance.
    const botPresses = ctx.participants
      .filter((id) => ctx.isBot(id))
      .flatMap((id) => {
        const skill = ctx.skillOf(id);
        return impacts.flatMap((impact) => {
          if (ctx.rng.chance(0.35 + 0.6 * skill)) return [{ id, at: impact - ctx.rng.range(DOWN_MS + 30, UP_MS - 60) }];
          return ctx.rng.chance(0.5) ? [] : [{ id, at: impact - ctx.rng.range(UP_MS + 20, UP_MS + 260) }];
        });
      })
      .sort((a, b) => a.at - b.at);

    const publish = () =>
      ctx.setState({ impacts, sides, hits: Object.fromEntries(hits), ducks: Object.fromEntries([...ducks].map(([id, d]) => [id, d.at(-1) ?? null])) });
    publish();

    const duck = (id: string, at: number) => {
      const list = ducks.get(id)!;
      const last = list.at(-1);
      if (last !== undefined && at < last + UP_MS + RECOVER_MS) return;
      list.push(at);
      publish();
    };

    return {
      onInput(playerId, _input, { at }) {
        duck(playerId, at);
      },
      onTick(now) {
        while (botPresses[0] && botPresses[0].at <= now) {
          const p = botPresses.shift()!;
          duck(p.id, p.at);
        }
        while (resolved < impacts.length && impacts[resolved]! + JUDGE_DELAY_MS <= now) {
          const impact = impacts[resolved]!;
          for (const id of ctx.participants) {
            const down = ducks.get(id)!.some((at) => impact >= at + DOWN_MS && impact <= at + UP_MS);
            if (down) ctx.emit({ type: 'dodge', playerId: id, ball: resolved });
            else {
              hits.set(id, hits.get(id)! + 1);
              ctx.emit({ type: 'hit', playerId: id, ball: resolved });
            }
          }
          resolved += 1;
          publish();
        }
      },
      isComplete: (now) => resolved >= impacts.length && now >= impacts[impacts.length - 1]! + JUDGE_DELAY_MS + END_PAUSE_MS,
      results() {
        const max = Math.max(...hits.values());
        const out: Record<string, RoundOutcome> = {};
        for (const id of ctx.participants) {
          out[id] = max > 0 && hits.get(id) === max ? 'failure' : 'success';
          ctx.settle(id, out[id]);
        }
        return out;
      },
    };
  },
});
