import type { JsonValue, MiniGameSession, PlayerResult, Rng, TypedPayload } from '@boucan/shared';

/**
 * Simulated players ("bots") used by the local server, the bots CLI and the
 * integration check. A bot plays through the public protocol only, exactly
 * like a real client, so it also exercises the contract.
 *
 * Bot behaviours live next to their module (modules/<id>/bot.ts). They are
 * dev tooling: they never run on the production server.
 */
export interface BotApi {
  readonly playerId: string;
  readonly session: MiniGameSession;
  /** Bot-private randomness (NOT the session seed). */
  readonly rng: Rng;
  /** 0 (clumsy) … 1 (excellent). */
  readonly skill: number;
  /** Estimated current server time. */
  now(): number;
  input(input: JsonValue): void;
  report(result: PlayerResult): void;
  onEvent(listener: (event: TypedPayload) => void): void;
  onState(listener: (state: JsonValue) => void): void;
  /** Runs `fn` after `ms`, cancelled automatically when the minigame ends. */
  after(ms: number, fn: () => void): void;
}

export interface BotStrategy {
  /** Called when MINIGAME_ACTIVE starts. */
  play(api: BotApi): void;
}

/** Fallback for modules without a dedicated bot: sends a plausible report, or nothing. */
export const genericBot: BotStrategy = {
  play(api) {
    const duration = api.session.timing.durationMs;
    api.after(api.rng.range(0.3, 0.9) * duration, () => {
      const success = api.rng.chance(0.4 + api.skill * 0.5);
      api.report({
        outcome: success ? 'success' : 'failure',
        timeMs: Math.round(api.rng.range(0.2, 0.9) * duration),
        normalized: success ? api.rng.range(0.4, 1) : api.rng.range(0, 0.4),
      });
    });
  },
};
