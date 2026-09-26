import type { JsonValue, PlayerResult, ScoringSpec } from '@boucan/shared';
import {
  defineMiniGame,
  reject,
  type MiniGameContext,
  type MiniGameModule,
  type PrepareContext,
  type Rejection,
} from '../api';

/**
 * Kit for LOCAL minigames: every client plays on its own from the public
 * seed/params and sends one `minigame.report` at the end. The server only
 * syncs the timing and checks that reports are plausible.
 *
 * Adding a local minigame = one call to defineLocalMiniGame (see modules/).
 */
export interface LocalMiniGameSpec<P extends JsonValue> {
  id: string;
  durationMs: number;
  scoring: ScoringSpec;
  minPlayers?: number;
  maxPlayers?: number;
  weight?: number;
  prepare?(ctx: PrepareContext): P;
  /**
   * Plausibility check of a report (bounds, consistency with params).
   * Return a Rejection to refuse it, or a (possibly corrected) result.
   */
  validateReport?(result: PlayerResult, ctx: MiniGameContext<P>): Rejection | PlayerResult | void;
}

export function defineLocalMiniGame<P extends JsonValue>(spec: LocalMiniGameSpec<P>): MiniGameModule {
  return defineMiniGame<P, never>({
    id: spec.id,
    authority: 'local',
    minPlayers: spec.minPlayers ?? 1,
    maxPlayers: spec.maxPlayers ?? 8,
    durationMs: spec.durationMs,
    scoring: spec.scoring,
    weight: spec.weight,
    acceptsReports: true,
    prepare: spec.prepare,
    start(ctx) {
      const reports = new Map<string, PlayerResult>();
      const allReported = () =>
        ctx.participants.every((id) => reports.has(id) || !ctx.isConnected(id));
      return {
        onReport(playerId, result, now) {
          // Reports make no sense before the game started (clock or client bug).
          if (now < ctx.activeAt) return reject('tooEarly');
          if (result.timeMs !== undefined && result.timeMs > ctx.durationMs + 1_000) {
            return reject('timeOutOfBounds');
          }
          const checked = spec.validateReport?.(result, ctx);
          if (checked && 'reject' in checked) return checked;
          const final = checked ?? result;
          reports.set(playerId, final);
          ctx.markFinished(playerId);
          return final;
        },
        isComplete: allReported,
        isSettled: allReported,
        results: () => Object.fromEntries(reports),
      };
    },
  });
}
