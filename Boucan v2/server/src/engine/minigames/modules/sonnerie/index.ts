import { z } from 'zod';
import type { PlayerResult } from '@boucan/shared';
import { defineMiniGame, reject } from '../../api';

/**
 * « Sonnerie ! » — SERVER authority (reference implementation).
 *
 * Concept (Notion): press as soon as the real school bell rings; fake bells
 * are traps. Timing is competitive and the bell moment is secret, so the
 * server decides when bells ring (secretRng — not derivable from the public
 * seed), announces them as semantic events and judges the presses.
 *
 * Events (to the room):
 *   { type: "bellRang", kind: "fake" | "real" }
 *   { type: "playerPressed", playerId, verdict: "early" | "onTime", reactionMs? }
 * Input: { type: "press" }
 *
 * Lag compensation: the client saw the bell one-way-latency after we sent it
 * and its press reached us one-way-latency after it happened, so
 * reaction ≈ receivedAt − bellSentAt − RTT (RTT measured by the transport,
 * capped). No client clock is trusted.
 */
const Input = z.object({ type: z.literal('press') });

export interface SonnerieParams {
  [key: string]: number;
  /** Upper bound of fake bells (the actual count is secret). */
  maxFakeBells: number;
}

interface Press {
  verdict: 'early' | 'onTime';
  reactionMs?: number;
}

const FAKE_MIN_OFFSET = 0.12;
const REAL_WINDOW = [0.3, 0.72] as const;

export const sonnerie = defineMiniGame<SonnerieParams, z.infer<typeof Input>>({
  id: 'sonnerie',
  authority: 'server',
  minPlayers: 1,
  maxPlayers: 8,
  durationMs: 7_000,
  scoring: { strategy: 'placement', rankBy: [{ metric: 'timeMs', order: 'asc' }] },
  input: { schema: Input, ratePerSecond: 5 },
  acceptsReports: false,
  prepare: () => ({ maxFakeBells: 2 }),
  start(ctx) {
    const { secretRng, activeAt, durationMs } = ctx;
    const realAt = activeAt + Math.round(secretRng.range(REAL_WINDOW[0], REAL_WINDOW[1]) * durationMs);
    const fakeCount = secretRng.int(0, ctx.params.maxFakeBells);
    const fakes: number[] = [];
    for (let i = 0; i < fakeCount; i++) {
      const at = activeAt + Math.round(secretRng.range(FAKE_MIN_OFFSET, REAL_WINDOW[0]) * durationMs);
      if (fakes.every((f) => Math.abs(f - at) > 500) && realAt - at > 500) fakes.push(at);
    }
    fakes.sort((a, b) => a - b);

    let realSentAt: number | null = null;
    const presses = new Map<string, Press>();

    return {
      onTick(now) {
        while (fakes.length > 0 && now >= fakes[0]!) {
          fakes.shift();
          ctx.emit({ type: 'bellRang', kind: 'fake' });
        }
        if (realSentAt === null && now >= realAt) {
          realSentAt = now;
          ctx.emit({ type: 'bellRang', kind: 'real' });
        }
      },
      onInput(playerId, _input, { now }) {
        if (presses.has(playerId)) return reject('alreadyPressed');
        const reaction = realSentAt === null ? -1 : now - realSentAt - ctx.rttOf(playerId);
        const press: Press = reaction < 0 ? { verdict: 'early' } : { verdict: 'onTime', reactionMs: Math.round(reaction) };
        presses.set(playerId, press);
        ctx.markFinished(playerId);
        ctx.emit({ type: 'playerPressed', playerId, ...press });
      },
      isComplete: () =>
        ctx.participants.every((id) => presses.has(id) || !ctx.isConnected(id)) &&
        (realSentAt !== null || [...presses.values()].every((p) => p.verdict === 'early')),
      results() {
        const out: Record<string, PlayerResult> = {};
        for (const id of ctx.participants) {
          const press = presses.get(id);
          if (press?.verdict === 'onTime') {
            const r = press.reactionMs!;
            out[id] = { outcome: 'success', timeMs: r, normalized: clamp01((800 - r) / 600) };
          } else if (press?.verdict === 'early') {
            out[id] = { outcome: 'failure', stats: { falseStart: true } };
          } else if (ctx.isConnected(id)) {
            out[id] = { outcome: 'failure', stats: { noPress: true } };
          }
          // Disconnected without pressing: omitted → dnf.
        }
        return out;
      },
    };
  },
});

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
