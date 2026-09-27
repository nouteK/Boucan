import { z } from 'zod';
import { defineMiniGame, reject, type RoundOutcome } from '../api';

/**
 * DUEL « Le dernier cristal » — a chest holds one crystal less than there are
 * players. Wait for it to open, then grab: the fastest get a crystal, the one
 * left empty-handed loses. Grabbing before the chest opens = lost.
 * Reactions are ranked on lag-compensated times, then crystals are awarded.
 *
 * State : { open, crystals, presses: { [id]: { early, ms } }, winners: id[] | null }
 * Events: { type: 'open' }, { type: 'grab', playerId, early, ms }, { type: 'award', winners }
 */
const Input = z.object({ type: z.literal('grab') });
/** Grabs accepted after the opening, then the award is shown this long before the verdict. */
const WINDOW_MS = 1500;
const SHOW_MS = 900;

export const cristal = defineMiniGame<z.infer<typeof Input>>({
  id: 'cristal',
  input: { schema: Input, ratePerSecond: 6 },
  acceptsReports: false,
  stateHz: 20,
  start(ctx) {
    const crystals = Math.max(1, ctx.participants.length - 1);
    const openAt = ctx.activeAt + Math.round(ctx.durationMs * ctx.rng.range(0.25, 0.5));
    let openedAt: number | null = null;
    let awardedAt: number | null = null;
    let winners: string[] | null = null;
    const presses = new Map<string, { early: boolean; ms: number | null }>();
    const bots = ctx.participants
      .filter((id) => ctx.isBot(id))
      .map((id) => {
        const skill = ctx.skillOf(id);
        const early = ctx.rng.chance((1 - skill) * 0.22);
        return {
          id,
          early,
          at: early ? ctx.activeAt + (openAt - ctx.activeAt) * ctx.rng.range(0.4, 0.95) : openAt + ctx.rng.range(210, 400) * (1.7 - skill),
        };
      });

    const publish = () => ctx.setState({ open: openedAt !== null, crystals, presses: Object.fromEntries(presses), winners });
    publish();

    const award = (now: number) => {
      if (winners) return;
      winners = [...presses]
        .filter(([, p]) => p.ms !== null)
        .sort((a, b) => a[1].ms! - b[1].ms!)
        .slice(0, crystals)
        .map(([id]) => id);
      awardedAt = now;
      for (const id of ctx.participants) ctx.settle(id, winners.includes(id) ? 'success' : 'failure');
      ctx.emit({ type: 'award', winners });
      publish();
    };

    const grab = (id: string, now: number, at: number) => {
      if (presses.has(id) || winners) return reject('alreadyGrabbed');
      // `at` is when the player pressed (server time): a press sent before the opening is early even if it arrives after.
      const early = openedAt === null || at < openedAt;
      const ms = early ? null : Math.max(0, Math.round(at - openedAt! - (ctx.isBot(id) ? 0 : ctx.rttOf(id) / 2)));
      presses.set(id, { early, ms });
      if (early) ctx.settle(id, 'failure');
      ctx.emit({ type: 'grab', playerId: id, early, ms });
      publish();
      if (ctx.participants.every((p) => presses.has(p))) award(now);
    };

    return {
      onInput(playerId, _input, { now, at }) {
        return grab(playerId, now, at);
      },
      onTick(now) {
        if (openedAt === null && now >= openAt) {
          openedAt = now;
          ctx.emit({ type: 'open' });
          publish();
        }
        for (const bot of bots) if (!presses.has(bot.id) && now >= bot.at && (bot.early || openedAt !== null)) grab(bot.id, now, now);
        if (openedAt !== null && now > openedAt + WINDOW_MS) award(now);
      },
      isComplete: (now) => awardedAt !== null && now >= awardedAt + SHOW_MS,
      results(now) {
        award(now);
        const out: Record<string, RoundOutcome> = {};
        for (const id of ctx.participants) out[id] = winners!.includes(id) ? 'success' : 'failure';
        return out;
      },
    };
  },
});
