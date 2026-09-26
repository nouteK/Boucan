import type { BotStrategy } from '../../bot-api';

export const fausseCouleurBot: BotStrategy = {
  play(api) {
    const duration = api.session.timing.durationMs;
    const timeMs = Math.round(api.rng.range(0.15, 0.7) * duration);
    api.after(timeMs, () =>
      api.report({ outcome: api.rng.chance(0.5 + api.skill * 0.4) ? 'success' : 'failure', timeMs }),
    );
  },
};
