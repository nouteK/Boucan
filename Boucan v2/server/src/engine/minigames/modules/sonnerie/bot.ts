import type { BotStrategy } from '../../bot-api';

/** Waits for the real bell (sometimes falls for a fake one), presses after a human-like delay. */
export const sonnerieBot: BotStrategy = {
  play(api) {
    let pressed = false;
    const press = (delay: number) => {
      if (pressed) return;
      pressed = true;
      api.after(delay, () => api.input({ type: 'press' }));
    };
    api.onEvent((event) => {
      if (event.type !== 'bellRang') return;
      if (event.kind === 'real') press(api.rng.range(180, 420) * (1.4 - api.skill * 0.6));
      else if (api.rng.chance(0.25 * (1 - api.skill))) press(api.rng.range(150, 300));
    });
  },
};
