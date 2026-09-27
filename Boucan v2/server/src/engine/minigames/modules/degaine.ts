import { z } from 'zod';
import { defineMiniGame, reject, type RoundOutcome } from '../api';

/**
 * DUEL « Dégaine ! » — wait for the signal, then tap first.
 * Early tap = lost. When nobody jumped the gun, the slowest one loses.
 * The signal time is secret (server rng); reaction = received − signal − RTT.
 *
 * State : { signal: boolean, presses: { [id]: { early: boolean, ms: number | null } } }
 * Events: { type: 'signal' }, { type: 'pressed', playerId, early, ms }
 */
const Input = z.object({ type: z.literal('press') });

export const degaine = defineMiniGame<z.infer<typeof Input>>({
  id: 'degaine',
  input: { schema: Input, ratePerSecond: 6 },
  acceptsReports: false,
  start(ctx) {
    const signalAt = ctx.activeAt + Math.round(ctx.durationMs * ctx.rng.range(0.28, 0.55));
    let signalSentAt: number | null = null;
    const presses = new Map<string, { early: boolean; ms: number | null }>();
    const bots = ctx.participants
      .filter((id) => ctx.isBot(id))
      .map((id) => {
        const skill = ctx.skillOf(id);
        const early = ctx.rng.chance((1 - skill) * 0.18);
        return {
          id,
          early,
          at: early
            ? ctx.activeAt + (signalAt - ctx.activeAt) * ctx.rng.range(0.4, 0.95)
            : signalAt + 170 + (1 - skill) * 380 + ctx.rng.range(0, 140),
        };
      });

    const publish = () =>
      ctx.setState({ signal: signalSentAt !== null, presses: Object.fromEntries(presses) });
    publish();

    const press = (id: string, now: number) => {
      if (presses.has(id)) return reject('alreadyPressed');
      const early = signalSentAt === null;
      const ms = early ? null : Math.max(0, Math.round(now - signalSentAt! - (ctx.isBot(id) ? 0 : ctx.rttOf(id))));
      presses.set(id, { early, ms });
      if (early) ctx.settle(id, 'failure');
      ctx.emit({ type: 'pressed', playerId: id, early, ms });
      publish();
    };

    const done = (now: number) =>
      ctx.participants.every((id) => presses.has(id)) || (signalSentAt !== null && now > signalSentAt + 1500);

    return {
      onInput(playerId, _input, { now }) {
        return press(playerId, now);
      },
      onTick(now) {
        if (signalSentAt === null && now >= signalAt) {
          signalSentAt = now;
          ctx.emit({ type: 'signal' });
          publish();
        }
        for (const bot of bots) if (!presses.has(bot.id) && now >= bot.at && (bot.early || signalSentAt !== null)) press(bot.id, now);
      },
      isComplete: (now) => done(now),
      results() {
        const out: Record<string, RoundOutcome> = {};
        const anyEarly = [...presses.values()].some((p) => p.early);
        const valid = ctx.participants.filter((id) => presses.get(id)?.ms != null);
        const slowest = anyEarly || valid.length < ctx.participants.length
          ? null
          : valid.reduce((a, b) => (presses.get(b)!.ms! > presses.get(a)!.ms! ? b : a));
        for (const id of ctx.participants) {
          const p = presses.get(id);
          out[id] = !p || p.early || id === slowest ? 'failure' : 'success';
          ctx.settle(id, out[id]);
        }
        return out;
      },
    };
  },
});
