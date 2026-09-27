import { afterEach, describe, expect, it } from 'vitest';
import { defineMiniGame } from '../src/engine/minigames/api';
import { DUEL_MODULES } from '../src/engine/minigames/catalog';
import { MiniGameRegistry } from '../src/engine/minigames/registry';
import { Harness, setupRoom, type TestClient } from './harness';

let harness: Harness;
afterEach(() => harness?.dispose());

/** Every microgame is the given duel (plus one solo so the registry is valid). */
function duelHarness(id: string, options: { rtt?: number } = {}) {
  return new Harness({ enabled: ['cours', id], config: { rhythm: { duelEvery: 1 } }, ...options });
}

function toMicrogame(h: Harness, c: TestClient) {
  h.advanceUntil(() => c.phase === 'MICROGAME');
  return c.snapshot.match.round!;
}

describe('degaine (reaction duel)', () => {
  it('an early press loses; the others win', () => {
    harness = duelHarness('degaine');
    const { host, players } = setupRoom(harness, 3);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    expect(round.kind).toBe('duel');
    host.ok('minigame.input', { roundId: round.roundId, input: { type: 'press' } });
    expect(host.snapshot.match.round!.progress[host.playerId!]).toBe('failure');
    harness.advanceUntil(() => host.minigameEvents().some((e) => e.type === 'signal'));
    harness.advance(200);
    players[1]!.ok('minigame.input', { roundId: round.roundId, input: { type: 'press' } });
    harness.advanceUntil(() => host.phase === 'VERDICT');
    const byId = Object.fromEntries(host.snapshot.match.verdict!.entries.map((e) => [e.playerId, e.outcome]));
    expect(byId[host.playerId!]).toBe('failure');
    expect(byId[players[1]!.playerId!]).toBe('success');
    expect(byId[players[2]!.playerId!]).toBe('failure'); // never pressed
  });

  it('when everyone is clean, the slowest loses (RTT compensated)', () => {
    harness = duelHarness('degaine', { rtt: 100 });
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    harness.advanceUntil(() => host.minigameEvents().some((e) => e.type === 'signal'));
    harness.advance(250);
    players[1]!.ok('minigame.input', { roundId: round.roundId, input: { type: 'press' } });
    harness.advance(100);
    host.ok('minigame.input', { roundId: round.roundId, input: { type: 'press' } });
    // Everyone pressed → ends early.
    harness.advance(harness.tickMs);
    expect(host.phase).toBe('VERDICT');
    const pressed = host.minigameEvents().filter((e) => e.type === 'pressed') as unknown as { playerId: string; ms: number }[];
    expect(pressed.find((p) => p.playerId === players[1]!.playerId)!.ms).toBeGreaterThanOrEqual(150 - harness.tickMs);
    const byId = Object.fromEntries(host.snapshot.match.verdict!.entries.map((e) => [e.playerId, e.outcome]));
    expect(byId).toEqual({ [players[1]!.playerId!]: 'success', [host.playerId!]: 'failure' });
  });
});

describe('patate (hot potato)', () => {
  it('only the holder can throw; whoever holds it at the boom loses', () => {
    harness = duelHarness('patate');
    const { host, players } = setupRoom(harness, 3);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    harness.advance(harness.tickMs);
    const state = () => (host.received.filter((m) => m.type === 'minigame.state').at(-1) as unknown as { payload: { state: { holder: string | null; exploded: string | null } } }).payload.state;
    const holder = state().holder!;
    const other = players.find((p) => p.playerId !== holder)!;
    expect(other.request('minigame.input', { roundId: round.roundId, input: { type: 'pass' } })).toMatchObject({
      ok: false,
      error: { code: 'INPUT_REJECTED', details: { reason: 'notHolding' } },
    });
    players.find((p) => p.playerId === holder)!.ok('minigame.input', { roundId: round.roundId, input: { type: 'pass' } });
    expect(host.minigameEvents().some((e) => e.type === 'pass')).toBe(true);
    harness.advanceUntil(() => host.phase === 'VERDICT');
    const boom = host.minigameEvents().find((e) => e.type === 'boom') as unknown as { playerId: string };
    const losers = host.snapshot.match.verdict!.entries.filter((e) => e.outcome === 'failure').map((e) => e.playerId);
    expect(losers).toEqual([boom.playerId]);
  });

  it('bots throw the bomb around', () => {
    harness = duelHarness('patate');
    const { host } = setupRoom(harness, 1, { bots: 3 });
    host.autoplay('random');
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(host.minigameEvents().filter((e) => e.type === 'pass').length).toBeGreaterThan(1);
    expect(host.snapshot.match.verdict!.entries.filter((e) => e.outcome === 'failure')).toHaveLength(1);
  });
});

describe('course (mash race)', () => {
  it('the last runner loses, the race stops when one is left', () => {
    harness = duelHarness('course');
    const { host, players } = setupRoom(harness, 3);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    const [a, b] = [players[0]!, players[1]!];
    for (let i = 0; i < 70 && host.phase === "MICROGAME"; i++) {
      harness.advance(80);
      a.send('minigame.input', { roundId: round.roundId, input: { type: 'tap' } });
      if (i % 3 !== 0) b.send('minigame.input', { roundId: round.roundId, input: { type: 'tap' } });
    }
    harness.advanceUntil(() => host.phase === 'VERDICT');
    const byId = Object.fromEntries(host.snapshot.match.verdict!.entries.map((e) => [e.playerId, e.outcome]));
    expect(byId[a.playerId!]).toBe('success');
    expect(byId[b.playerId!]).toBe('success');
    expect(byId[players[2]!.playerId!]).toBe('failure');
    expect(host.minigameEvents().filter((e) => e.type === 'finish')).toHaveLength(2);
  });

  it('taps faster than the input rate are refused', () => {
    harness = duelHarness('course');
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    const replies = Array.from({ length: 30 }, () => players[1]!.request('minigame.input', { roundId: round.roundId, input: { type: 'tap' } }));
    expect(replies.some((r) => !r.ok && r.error.code === 'RATE_LIMITED')).toBe(true);
  });
});

describe('robustness', () => {
  it('a duel module that crashes yields a dnf round, the match goes on', () => {
    const broken = defineMiniGame({
      id: 'patate',
      acceptsReports: false,
      start() {
        throw new Error('boom');
      },
    });
    harness = new Harness({
      enabled: ['cours', 'patate'],
      config: { rhythm: { duelEvery: 1 } },
      modules: [broken, ...DUEL_MODULES.filter((m) => m.id !== 'patate')],
    });
    const { host } = setupRoom(harness, 2);
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(host.snapshot.match.verdict!.entries.every((e) => e.outcome === 'dnf')).toBe(true);
    harness.advanceUntil(() => host.phase === 'INTERLUDE' && host.snapshot.match.counter === 2);
  });

  it('boot fails fast when a duel has no server module or an id is unknown', () => {
    expect(() => new MiniGameRegistry([])).toThrow(/no server module/);
    expect(() => new MiniGameRegistry(DUEL_MODULES, ['nope'])).toThrow(/Unknown/);
  });
});
