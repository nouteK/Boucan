import { DUEL_MODULES, silentLogger, type MiniGameContext } from '@boucan/server';
import { createRng, microgameInfo, MICROGAMES, type JsonValue, type TypedPayload } from '@boucan/shared';
import { describe, expect, it } from 'vitest';
import { setContext } from '../src/engine/draw';
import type { MgContext } from '../src/microgames/api';
import { MICROGAME_DEFS } from '../src/microgames';
import { fakeContext, PLAYERS, randomInput } from './support';

/**
 * Every duel end to end without a network: the real server module runs with
 * bots, the client renderer gets its states and events, and "my" random
 * inputs go through the module's input schema — like the real round runner.
 */
const TICK = 25;

function playDuel(id: string, seed: number, players = PLAYERS) {
  const info = microgameInfo(id)!;
  const module = DUEL_MODULES.find((m) => m.id === id)!;
  const def = MICROGAME_DEFS.find((d) => d.id === id)!;
  const me = players[0]!.id;
  let now = 0;
  let state: JsonValue | undefined;
  let stateSent: JsonValue | undefined;
  const events: TypedPayload[] = [];
  const settled = new Map<string, string>();
  const rejected: string[] = [];
  const ctx: MiniGameContext = {
    roundId: 'r1',
    info,
    seed,
    level: 1,
    tempo: 1,
    participants: players.map((p) => p.id),
    activeAt: 0,
    endsAt: info.durationMs,
    durationMs: info.durationMs,
    rng: createRng(seed * 7 + 1),
    logger: silentLogger,
    isConnected: () => true,
    isBot: (pid) => pid !== me,
    skillOf: (pid) => (pid === me ? 0 : 0.7),
    rttOf: () => 0,
    setState: (s) => void (state = s),
    emit: (e) => void events.push(e),
    settle: (pid, o) => void settled.set(pid, o),
  };
  const runtime = module.start(ctx);
  const clientCtx: MgContext = {
    info,
    rng: createRng(seed),
    seed,
    level: 1,
    tempo: 1,
    duration: info.durationMs,
    me: players[0]!,
    players,
    outcome: null,
    win: () => {},
    lose: () => {},
    send: (input) => {
      const parsed = module.input!.schema.safeParse(input);
      if (!parsed.success) throw new Error(`${id}: the client sent an input the server refuses: ${JSON.stringify(input)}`);
      const verdict = runtime.onInput?.(me, parsed.data, { now, at: now });
      if (verdict && 'reject' in verdict) rejected.push(verdict.reject);
    },
    sfx: () => {},
    shake: () => {},
    activeAt: 0,
    serverNow: () => now,
    // Half the runs as on a phone: on-screen buttons drawn and hit-tested.
    touch: seed % 2 === 0,
  };
  const instance = def.create(clientCtx);
  const r = createRng(seed * 13);
  for (now = 0; now <= info.durationMs; now += TICK) {
    runtime.onTick?.(now);
    if (state !== stateSent) {
      stateSent = state;
      instance.onState?.(JSON.parse(JSON.stringify(state)), now);
    }
    for (const e of events.splice(0)) instance.onEvent?.(JSON.parse(JSON.stringify(e)), now);
    if (r.next() < 0.3) instance.input?.(randomInput(() => r.next()));
    instance.update(TICK, now);
    instance.draw(now, TICK);
    if (runtime.isComplete?.(now)) break;
  }
  const results = runtime.results(now);
  instance.dispose?.();
  return { results, settled, rejected, endedAt: now };
}

describe('every duel: server module + client renderer', () => {
  setContext(fakeContext());
  const duels = MICROGAMES.filter((m) => m.kind === 'duel');
  for (const info of duels) {
    it(info.id, () => {
      for (const seed of [1, 2, 3]) {
        for (const n of [2, 3, 5]) {
          const players = PLAYERS.slice(0, Math.min(n, PLAYERS.length)).concat(
            Array.from({ length: Math.max(0, n - PLAYERS.length) }, (_, i) => ({ ...PLAYERS[1]!, id: `x${i}`, nickname: `Bot ${i}` })),
          );
          const { results } = playDuel(info.id, seed, players);
          for (const p of players) expect(['success', 'failure'], `${info.id} seed ${seed} n ${n} ${p.id}`).toContain(results[p.id]);
        }
      }
    });
  }
});
