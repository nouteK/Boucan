import type { BotStrategy } from '../../bot-api';

/** Reproduces the sequence with skill-dependent mistakes, then reports. */
export const interroSurpriseBot: BotStrategy = {
  play(api) {
    const { length } = api.session.params as { length: number };
    const duration = api.session.timing.durationMs;
    const timeMs = Math.round(api.rng.range(0.25, 0.8) * duration * (1.3 - api.skill * 0.6));
    api.after(Math.min(timeMs, duration - 200), () => {
      const errors = api.rng.int(0, Math.round((1 - api.skill) * 3));
      const score = Math.max(0, length - errors);
      api.report({
        outcome: score === length ? 'success' : 'failure',
        score,
        errors,
        timeMs: Math.min(timeMs, duration - 200),
      });
    });
  },
};
