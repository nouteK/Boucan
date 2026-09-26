import { z } from 'zod';
import type { PlayerResult } from '@boucan/shared';
import { defineMiniGame, reject } from '../../api';

/**
 * « Course dans le couloir » — RELAY authority (reference implementation).
 *
 * Concept (Notion): race down the corridor by rhythmic tapping. Each client
 * simulates its own runner (obstacles derived from the public seed) and
 * streams its progress; the server validates it (monotonic, speed cap),
 * relays everybody's position as shared state (~10 Hz) and stamps finish
 * times with lag-compensated server time — so the ranking is fair and
 * consistent for everybody.
 *
 * Input:  { type: "progress", distance }            (≤ 15 per second)
 * State:  { runners: { [playerId]: { distance, finished } } }
 * Event:  { type: "runnerFinished", playerId, place, timeMs }
 */
const Input = z.object({ type: z.literal('progress'), distance: z.number().min(0).max(10_000) });

export interface CourseParams {
  [key: string]: number;
  /** Track length (arbitrary units). */
  length: number;
  /** Max legit speed (units / second); faster progress is clamped. */
  maxSpeed: number;
  /** Seed-derived obstacle count (clients place them with createRng(seed)). */
  obstacles: number;
}

/** Allowed excess over maxSpeed (network jitter, client frame timing). */
export const SPEED_TOLERANCE = 1.1;
export const DISTANCE_SLACK = 3;
/** Share of the time limit a perfect run needs. */
const FASTEST_RUN = 0.4;

interface Runner {
  distance: number;
  lastAt: number;
  finishedAt: number | null;
}

export const courseCouloir = defineMiniGame<CourseParams, z.infer<typeof Input>>({
  id: 'course-couloir',
  authority: 'relay',
  minPlayers: 1,
  maxPlayers: 8,
  durationMs: 20_000,
  scoring: {
    strategy: 'placement',
    rankBy: [
      { metric: 'timeMs', order: 'asc' },
      { metric: 'score', order: 'desc' },
    ],
    // Unfinished runners are ranked by distance.
    failures: 'ranked',
  },
  input: { schema: Input, ratePerSecond: 15 },
  acceptsReports: false,
  stateHz: 10,
  // Speed is derived from the effective duration so the race stays winnable whatever the
  // time scale: a perfect run takes FASTEST_RUN of the time limit.
  prepare: ({ rng, durationMs }) => ({
    length: 100,
    maxSpeed: Math.round((100 / ((durationMs * FASTEST_RUN) / 1000)) * 10) / 10,
    obstacles: rng.int(4, 7),
  }),
  start(ctx) {
    const { length, maxSpeed } = ctx.params;
    const runners = new Map<string, Runner>(
      ctx.participants.map((id) => [id, { distance: 0, lastAt: ctx.activeAt, finishedAt: null }]),
    );
    let finishers = 0;

    const publish = () =>
      ctx.setState({
        runners: Object.fromEntries(
          [...runners].map(([id, r]) => [
            id,
            { distance: Math.round(r.distance * 10) / 10, finished: r.finishedAt !== null },
          ]),
        ),
      });
    publish();

    return {
      onInput(playerId, input, { at }) {
        const runner = runners.get(playerId)!;
        if (runner.finishedAt !== null) return reject('finished');
        if (input.distance < runner.distance) return reject('backwards');
        // Soft anti-cheat: progress beyond what maxSpeed allows since the start is
        // clamped, not refused (absolute cap: spamming inputs gains nothing).
        const allowed = (maxSpeed * SPEED_TOLERANCE * Math.max(0, at - ctx.activeAt)) / 1000 + DISTANCE_SLACK;
        runner.distance = Math.max(runner.distance, Math.min(input.distance, allowed, length));
        runner.lastAt = Math.max(runner.lastAt, at);
        if (runner.distance >= length) {
          runner.finishedAt = at;
          finishers += 1;
          ctx.markFinished(playerId);
          ctx.emit({ type: 'runnerFinished', playerId, place: finishers, timeMs: at - ctx.activeAt });
        }
        publish();
      },
      isComplete: () =>
        ctx.participants.every((id) => runners.get(id)!.finishedAt !== null || !ctx.isConnected(id)),
      results() {
        const out: Record<string, PlayerResult> = {};
        for (const [id, r] of runners) {
          if (r.finishedAt !== null) {
            const timeMs = r.finishedAt - ctx.activeAt;
            out[id] = {
              outcome: 'success',
              timeMs,
              score: length,
              normalized: Math.min(1, Math.max(0, (ctx.durationMs - timeMs) / (ctx.durationMs * 0.6))),
            };
          } else if (r.distance > 0 || ctx.isConnected(id)) {
            out[id] = { outcome: 'failure', score: Math.round(r.distance), normalized: (r.distance / length) * 0.3 };
          }
        }
        return out;
      },
    };
  },
});
