import { z } from 'zod';
import { defineMiniGame, reject, type RoundOutcome } from '../api';

/**
 * DUEL « Patate chaude » — a bomb goes from player to player; tap to throw it.
 * Whoever holds it (or is about to catch it) when it explodes loses.
 * The explosion time is secret (server rng).
 *
 * State : { holder: id | null, flight: { from, to, at, arrive } | null, exploded: id | null, passes }
 * Events: { type: 'pass', from, to }, { type: 'boom', playerId }
 */
const Input = z.object({ type: z.literal('pass') });
const FLIGHT_MS = 380;

export const patate = defineMiniGame<z.infer<typeof Input>>({
  id: 'patate',
  input: { schema: Input, ratePerSecond: 8 },
  acceptsReports: false,
  stateHz: 20,
  start(ctx) {
    const boomAt = ctx.activeAt + Math.round(ctx.durationMs * ctx.rng.range(0.5, 0.88));
    let holder: string | null = ctx.rng.pick(ctx.participants);
    let flight: { from: string; to: string; at: number; arrive: number } | null = null;
    let exploded: string | null = null;
    let passes = 0;
    let botPassAt = 0;

    const publish = () => ctx.setState({ holder, flight, exploded, passes });
    const planBot = (now: number) => {
      if (holder && ctx.isBot(holder)) botPassAt = now + ctx.rng.range(250, 850) * (1.7 - ctx.skillOf(holder));
    };
    publish();
    planBot(ctx.activeAt);

    const pass = (from: string, now: number) => {
      if (exploded) return reject('over');
      if (holder !== from || flight) return reject('notHolding');
      const others = ctx.participants.filter((id) => id !== from);
      const to = ctx.rng.pick(others);
      flight = { from, to, at: now, arrive: now + FLIGHT_MS };
      holder = null;
      passes += 1;
      ctx.emit({ type: 'pass', from, to });
      publish();
    };

    return {
      onInput(playerId, _input, { now }) {
        return pass(playerId, now);
      },
      onTick(now) {
        if (exploded) return;
        if (flight && now >= flight.arrive) {
          holder = flight.to;
          flight = null;
          publish();
          planBot(now);
        }
        if (now >= boomAt) {
          exploded = holder ?? flight?.to ?? null;
          flight = null;
          ctx.emit({ type: 'boom', playerId: exploded });
          publish();
          return;
        }
        if (holder && ctx.isBot(holder) && now >= botPassAt) pass(holder, now);
      },
      isComplete: () => exploded !== null,
      results() {
        const out: Record<string, RoundOutcome> = {};
        for (const id of ctx.participants) {
          out[id] = id === exploded ? 'failure' : 'success';
          ctx.settle(id, out[id]);
        }
        return out;
      },
    };
  },
});
