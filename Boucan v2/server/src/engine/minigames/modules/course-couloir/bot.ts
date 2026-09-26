import type { BotStrategy } from '../../bot-api';

/** Runs at a skill-dependent pace, streaming progress ~10 times per second. */
export const courseCouloirBot: BotStrategy = {
  play(api) {
    const { length, maxSpeed } = api.session.params as { length: number; maxSpeed: number };
    const speed = maxSpeed * (0.55 + api.skill * 0.4) * api.rng.range(0.9, 1.05);
    const start = api.now();
    const step = () => {
      const distance = Math.min(length, ((api.now() - start) / 1000) * speed);
      api.input({ type: 'progress', distance });
      if (distance < length) api.after(100, step);
    };
    api.after(100, step);
  },
};
