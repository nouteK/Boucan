import { z } from 'zod';
import { defineMiniGame, reject, type RoundOutcome } from '../api';
import { Alternation, Side } from '../kits/duel';

/**
 * DUEL « Le roi de la colline » — one player (drawn at random) is the king on
 * the summit; the others climb both slopes by pressing left, right, left…
 * The king strikes one slope at a time (after a short wind-up everyone can
 * see): climbers near the top on that side tumble halfway down — unless they
 * were holding on (hold) when it landed. A climber reaching the summit
 * dethrones the king; if nobody does in time, the king wins.
 *
 * State : { king, strike: { side, at, phase: 'wind' | 'hit' } | null, climbers: { [id]: { side, height 0..1, stunned, holding } }, result: 'king' | 'climbers' | null }
 * Events: { type: 'windup', side }, { type: 'knock', playerId }, { type: 'held', playerId }, { type: 'summit', playerId }
 */
const Input = z.union([
  z.object({ type: z.literal('climb'), side: Side }),
  z.object({ type: z.literal('hold'), on: z.boolean() }),
  z.object({ type: z.literal('strike'), side: Side }),
]);
const P = {
  climb: 0.03,
  /** Climbers above this height are within reach of the king. */
  reach: 0.68,
  knock: 0.5,
  heldKnock: 0.05,
  /** Holding must have started this long before the blow lands. */
  holdMs: 120,
  windMs: 240,
  recoverMs: 200,
  cooldownMs: 380,
  stunMs: 400,
  showMs: 1200,
};
/** Climb boost when there are few climbers (index = number of climbers). */
const FEW_CLIMBERS = [1, 1.7, 1.05];

export const roi = defineMiniGame<z.infer<typeof Input>>({
  id: 'roi',
  input: { schema: Input, ratePerSecond: 20 },
  acceptsReports: false,
  stateHz: 20,
  start(ctx) {
    const king = ctx.rng.pick(ctx.participants);
    const climberIds = ctx.rng.shuffle(ctx.participants.filter((id) => id !== king));
    const boost = FEW_CLIMBERS[climberIds.length] ?? 1;
    const climbers = new Map(
      climberIds.map((id, i) => [id, { side: (i % 2 ? 1 : -1) as Side, height: 0, stunUntil: 0, holdSince: null as number | null }]),
    );
    const alternation = new Alternation();
    let strike: { side: Side; at: number; phase: 'wind' | 'hit' } | null = null;
    let readyAt = ctx.activeAt + 700;
    let result: 'king' | 'climbers' | null = null;
    let resultAt = 0;
    let last = ctx.activeAt;
    const kingBot = ctx.isBot(king);
    const kingSkill = ctx.skillOf(king);
    let kingPlan: { side: Side; at: number } | null = null;
    const bots = climberIds
      .filter((id) => ctx.isBot(id))
      .map((id) => ({ id, skill: ctx.skillOf(id), next: ctx.activeAt + ctx.rng.range(0, 200), strikeSeen: -1, reaction: 0, letGo: 0 }));

    const publish = (now: number) =>
      ctx.setState({
        king,
        strike,
        climbers: Object.fromEntries(
          [...climbers].map(([id, c]) => [id, { side: c.side, height: c.height, stunned: now < c.stunUntil, holding: c.holdSince !== null }]),
        ),
        result,
      });
    publish(ctx.activeAt);

    const outcomeOf = (id: string): RoundOutcome => (id === king ? (result === 'climbers' ? 'failure' : 'success') : result === 'climbers' ? 'success' : 'failure');
    const finish = (r: 'king' | 'climbers', now: number) => {
      if (result) return;
      result = r;
      resultAt = now;
      for (const id of ctx.participants) ctx.settle(id, outcomeOf(id));
    };

    const climb = (id: string, side: Side, now: number) => {
      const c = climbers.get(id)!;
      if (result || now < c.stunUntil || c.holdSince !== null || !alternation.accept(id, side)) return;
      c.height = Math.min(1, c.height + P.climb * boost);
      if (c.height >= 1) {
        ctx.emit({ type: 'summit', playerId: id });
        finish('climbers', now);
      }
    };
    const hold = (id: string, on: boolean, now: number) => {
      const c = climbers.get(id)!;
      c.holdSince = on && now >= c.stunUntil ? (c.holdSince ?? now) : null;
    };
    const startStrike = (side: Side, now: number) => {
      if (result || strike || now < readyAt) return;
      strike = { side, at: now, phase: 'wind' };
      ctx.emit({ type: 'windup', side });
    };

    return {
      onInput(playerId, input, { now, at }) {
        if (input.type === 'strike') {
          if (playerId !== king) return reject('notKing');
          startStrike(input.side, now);
          return;
        }
        if (playerId === king) return reject('king');
        if (input.type === 'climb') climb(playerId, input.side, now);
        else hold(playerId, input.on, at);
      },
      onTick(now) {
        const dt = Math.max(0, now - last);
        last = now;
        if (result) {
          publish(now);
          return;
        }
        // The blow lands.
        if (strike?.phase === 'wind' && now >= strike.at + P.windMs) {
          strike = { ...strike, at: now, phase: 'hit' };
          for (const [id, c] of climbers) {
            if (c.side !== strike.side || c.height < P.reach) continue;
            if (c.holdSince !== null && now - c.holdSince >= P.holdMs) {
              c.height = Math.max(0, c.height - P.heldKnock);
              ctx.emit({ type: 'held', playerId: id });
            } else {
              c.height = Math.max(0, c.height - P.knock);
              c.stunUntil = now + P.stunMs;
              c.holdSince = null;
              ctx.emit({ type: 'knock', playerId: id });
            }
          }
        } else if (strike?.phase === 'hit' && now >= strike.at + P.recoverMs) {
          strike = null;
          readyAt = now + P.cooldownMs;
        }
        // Bot king: strikes the side with climbers in reach, sometimes at random.
        if (kingBot && !strike && now >= readyAt) {
          if (!kingPlan) {
            const inReach = (s: Side) => [...climbers.values()].filter((c) => c.side === s && c.height > P.reach - 0.04 && c.holdSince === null).length;
            const l = inReach(-1);
            const r = inReach(1);
            if (l || r || ctx.rng.chance(0.004 * dt)) {
              const side: Side = l === r ? (ctx.rng.chance(0.5) ? -1 : 1) : l > r ? -1 : 1;
              kingPlan = { side, at: now + ctx.rng.range(60, 260) * (1.7 - kingSkill) };
            }
          } else if (now >= kingPlan.at) {
            startStrike(kingPlan.side, now);
            kingPlan = null;
          }
        }
        // Bot climbers: climb steadily, hold on when a blow comes their way.
        for (const bot of bots) {
          const c = climbers.get(bot.id)!;
          const danger = strike?.phase === 'wind' && strike.side === c.side && c.height >= P.reach - 0.05;
          if (danger) {
            if (bot.strikeSeen !== strike!.at) {
              bot.strikeSeen = strike!.at;
              bot.reaction = ctx.rng.range(60, 260) * (1.7 - bot.skill);
            }
            if (now - strike!.at > bot.reaction) hold(bot.id, true, now);
            continue;
          }
          if (c.holdSince !== null) {
            if (!bot.letGo) bot.letGo = now + ctx.rng.range(80, 200);
            if (now < bot.letGo) continue;
            bot.letGo = 0;
            hold(bot.id, false, now);
          }
          if (now < bot.next) continue;
          bot.next = now + (1000 / (4.4 + 2.2 * bot.skill)) * ctx.rng.range(0.85, 1.2);
          climb(bot.id, alternation.next(bot.id), now);
        }
        publish(now);
      },
      isComplete: (now) => result !== null && now >= resultAt + P.showMs,
      results(now) {
        finish('king', now);
        return Object.fromEntries(ctx.participants.map((id) => [id, outcomeOf(id)]));
      },
    };
  },
});
