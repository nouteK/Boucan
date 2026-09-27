import { z } from 'zod';
import { defineMiniGame, type RoundOutcome } from '../api';
import { BotClock } from '../kits/duel';

/**
 * DUEL « Course sur la glace » — mash to skate to the line, but every push
 * heats your blades: past the red you slip and slide for almost a second.
 * The last one on the ice (or anyone still skating at the end) loses.
 * Physics runs on the server; a tap is one push.
 *
 * State : { runners: { [id]: { d: 0..1, heat: 0..1, slip: boolean, place: number | null } } }
 * Events: { type: 'slip', playerId }, { type: 'finish', playerId, place }
 */
const Input = z.object({ type: z.literal('push') });
const TRACK = 950;
const P = { push: 0.13, maxSpeed: 0.8, heat: 0.1, heatPerSpeed: 0.32, cool: 0.0012, friction: 1.6, slipMs: 900, slide: 0.15 };

interface Runner {
  x: number;
  v: number;
  heat: number;
  slipUntil: number;
  place: number | null;
}

export const glace = defineMiniGame<z.infer<typeof Input>>({
  id: 'glace',
  input: { schema: Input, ratePerSecond: 14 },
  acceptsReports: false,
  stateHz: 15,
  start(ctx) {
    const runners = new Map<string, Runner>(ctx.participants.map((id) => [id, { x: 0, v: 0, heat: 0, slipUntil: 0, place: null }]));
    let finishers = 0;
    let last = ctx.activeAt;
    const bots = ctx.participants
      .filter((id) => ctx.isBot(id))
      .map((id) => {
        const skill = ctx.skillOf(id);
        return { id, skill, clock: new BotClock(ctx.activeAt + ctx.rng.range(0, 200), () => (1000 / (3 + 3 * skill)) * ctx.rng.range(0.8, 1.2)) };
      });

    const publish = () =>
      ctx.setState({
        runners: Object.fromEntries(
          [...runners].map(([id, r]) => [id, { d: Math.min(1, r.x / TRACK), heat: r.heat, slip: r.slipUntil > last, place: r.place }]),
        ),
      });
    publish();

    const push = (id: string, now: number) => {
      const r = runners.get(id)!;
      if (r.place !== null || now < r.slipUntil) return;
      r.v = Math.min(P.maxSpeed, r.v + P.push);
      r.heat += P.heat + r.v * P.heatPerSpeed;
      if (r.heat > 1) {
        r.heat = 0;
        r.v = 0;
        r.slipUntil = now + P.slipMs;
        ctx.emit({ type: 'slip', playerId: id });
      }
    };

    return {
      onInput(playerId, _input, { now }) {
        push(playerId, now);
      },
      onTick(now) {
        const dt = Math.max(0, now - last);
        last = now;
        for (const bot of bots) {
          const r = runners.get(bot.id)!;
          if (!bot.clock.due(now)) continue;
          // Careful bots stop pushing when their blades get hot.
          const limit = 0.45 + 0.35 * bot.skill + ctx.rng.range(-0.15, 0.15);
          if (r.heat < limit) push(bot.id, now);
        }
        for (const [id, r] of runners) {
          r.heat = Math.max(0, r.heat - dt * P.cool);
          r.v *= Math.exp((-dt / 1000) * P.friction);
          if (r.place !== null) continue;
          r.x += now < r.slipUntil ? P.slide * dt * ((r.slipUntil - now) / P.slipMs) : r.v * dt;
          if (r.x >= TRACK) {
            r.x = TRACK;
            finishers += 1;
            r.place = finishers;
            ctx.emit({ type: 'finish', playerId: id, place: finishers });
            if (finishers < ctx.participants.length) ctx.settle(id, 'success');
          }
        }
        publish();
      },
      // The race stops as soon as only one skater is left on the ice.
      isComplete: () => finishers >= ctx.participants.length - 1,
      results() {
        const out: Record<string, RoundOutcome> = {};
        for (const [id, r] of runners) {
          out[id] = r.place === null ? 'failure' : 'success';
          ctx.settle(id, out[id]);
        }
        return out;
      },
    };
  },
});
