import type { MicrogameInfo } from '@boucan/shared';
import { reject, type MiniGameModule, type RoundOutcome } from '../api';

/**
 * Generic server side of every solo / boss microgame: clients play their own
 * copy and report success or failure as soon as it is decided. Bots are
 * simulated here: each decides at a random moment, succeeding with a
 * probability that drops with speed and level.
 */
export function localModule(info: MicrogameInfo): MiniGameModule {
  return {
    id: info.id,
    acceptsReports: true,
    start(ctx) {
      const outcomes = new Map<string, RoundOutcome>();
      const botPlans = ctx.participants
        .filter((id) => ctx.isBot(id))
        .map((id) => {
          const chance = botSuccessChance(ctx.skillOf(id), ctx.tempo, ctx.level, info.kind === 'boss');
          return {
            id,
            at: ctx.activeAt + ctx.durationMs * ctx.rng.range(0.25, 0.95),
            outcome: (ctx.rng.chance(chance) ? 'success' : 'failure') as RoundOutcome,
          };
        });

      const settle = (id: string, outcome: RoundOutcome) => {
        outcomes.set(id, outcome);
        ctx.settle(id, outcome);
      };

      return {
        onReport(playerId, result, now) {
          if (now < ctx.activeAt) return reject('tooEarly');
          settle(playerId, result.outcome);
        },
        onTick(now) {
          for (const plan of botPlans) {
            if (!outcomes.has(plan.id) && now >= plan.at) settle(plan.id, plan.outcome);
          }
        },
        results() {
          return Object.fromEntries(outcomes);
        },
      };
    },
  };
}

/** Probability that a bot of `skill` wins a microgame. Tuned to feel human, not perfect. */
export function botSuccessChance(skill: number, tempo: number, level: number, boss: boolean): number {
  const p = skill - (tempo - 1) * 0.25 - (level - 1) * 0.06 - (boss ? 0.15 : 0);
  return Math.min(0.95, Math.max(0.1, p));
}
