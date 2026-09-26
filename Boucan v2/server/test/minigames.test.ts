import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineMiniGame } from '../src/engine/minigames/api';
import { MINIGAME_MODULES } from '../src/engine/minigames/catalog';
import { defineLocalMiniGame } from '../src/engine/minigames/kits/local';
import { MiniGameRegistry } from '../src/engine/minigames/registry';
import { DISTANCE_SLACK, SPEED_TOLERANCE } from '../src/engine/minigames/modules/course-couloir';
import { Harness, setupRoom, type TestClient } from './harness';

let harness: Harness;
afterEach(() => harness?.dispose());

function startAndActivate(h: Harness, host: TestClient, players: TestClient[]) {
  host.ok('match.start');
  h.advanceUntil(() => host.phase === 'MINIGAME_PREPARING');
  const sessionId = host.snapshot.match.minigame!.sessionId;
  for (const p of players) p.ok('minigame.ready', { sessionId });
  h.advanceUntil(() => host.phase === 'MINIGAME_ACTIVE');
  return sessionId;
}

describe('sonnerie (server authority)', () => {
  it('judges presses on the server with RTT compensation; fake bells trap early presses', () => {
    harness = new Harness({ enabled: ['sonnerie'], rtt: 100 });
    const { host, players } = setupRoom(harness, 2, { rounds: 3 });
    const [early, good] = players as [TestClient, TestClient];
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'MINIGAME_PREPARING');
    const session = host.snapshot.match.minigame!;
    // The bell time is secret: public params never reveal it.
    expect(session.params).toEqual({ maxFakeBells: 2 });
    expect(early.request('minigame.input', { sessionId: session.sessionId, input: { type: 'press' } })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PHASE' },
    });
    for (const p of players) p.ok('minigame.ready', { sessionId: session.sessionId });
    harness.advanceUntil(() => host.phase === 'MINIGAME_ACTIVE');

    early.ok('minigame.input', { sessionId: session.sessionId, input: { type: 'press' } });
    expect(early.request('minigame.input', { sessionId: session.sessionId, input: { type: 'press' } })).toMatchObject({
      ok: false,
      error: { code: 'INPUT_REJECTED', details: { reason: 'alreadyPressed' } },
    });
    expect(good.request('minigame.input', { sessionId: session.sessionId, input: { type: 'jump' } })).toMatchObject({
      ok: false,
      error: { code: 'INPUT_REJECTED', details: { reason: 'invalid' } },
    });
    expect(
      good.request('minigame.report', { sessionId: session.sessionId, result: { outcome: 'success' } }),
    ).toMatchObject({ ok: false, error: { code: 'REPORT_REJECTED', details: { reason: 'notAccepted' } } });

    harness.advanceUntil(() => good.minigameEvents().some((e) => e.type === 'bellRang' && e.kind === 'real'));
    harness.advance(300);
    good.ok('minigame.input', { sessionId: session.sessionId, input: { type: 'press' } });
    // Everyone pressed after the real bell → the minigame ends early.
    harness.advance(harness.tickMs);
    expect(host.phase).toBe('MINIGAME_ENDING');

    harness.advanceUntil(() => host.phase === 'MINIGAME_RESULTS');
    const [first, second] = host.snapshot.match.lastRound!.entries;
    expect(first).toMatchObject({ playerId: good.playerId, rank: 1, points: 10, result: { outcome: 'success' } });
    // 300 ms after the bell, minus 100 ms RTT (± one tick).
    expect(first!.result.timeMs).toBeGreaterThanOrEqual(200);
    expect(first!.result.timeMs).toBeLessThanOrEqual(200 + harness.tickMs);
    expect(second).toMatchObject({
      playerId: early.playerId,
      rank: 2,
      points: 0,
      result: { outcome: 'failure', stats: { falseStart: true } },
    });
    expect(host.minigameEvents()).toContainEqual({ type: 'playerPressed', playerId: early.playerId, verdict: 'early' });
  });
});

describe('course-couloir (relay authority)', () => {
  it('relays throttled shared state, clamps impossible progress, stamps finish times', () => {
    harness = new Harness({ enabled: ['course-couloir'] });
    const { host, players } = setupRoom(harness, 2, { rounds: 3 });
    const [runner, cheater] = players as [TestClient, TestClient];
    const sessionId = startAndActivate(harness, host, players);
    const params = host.snapshot.match.minigame!.params as { length: number; maxSpeed: number };

    cheater.ok('minigame.input', { sessionId, input: { type: 'progress', distance: params.length } });
    expect(
      cheater.request('minigame.input', { sessionId, input: { type: 'progress', distance: 0 } }),
    ).toMatchObject({ ok: false, error: { code: 'INPUT_REJECTED', details: { reason: 'backwards' } } });

    const statesBefore = host.received.filter((m) => m.type === 'minigame.state').length;
    const start = harness.now;
    while (host.phase === 'MINIGAME_ACTIVE') {
      harness.advance(100);
      const distance = ((harness.now - start) / 1000) * params.maxSpeed * 0.9;
      runner.send('minigame.input', { sessionId, input: { type: 'progress', distance } });
      cheater.send('minigame.input', { sessionId, input: { type: 'progress', distance: params.length } });
    }
    const states = host.received.flatMap((m) => (m.type === 'minigame.state' ? [m.payload] : []));
    const elapsedS = (harness.now - start) / 1000;
    expect(states.length - statesBefore).toBeLessThanOrEqual(Math.ceil(elapsedS * 10) + 2);
    states.slice(1).forEach((s, i) => expect(s.seq).toBe(states[i]!.seq + 1));

    harness.advanceUntil(() => host.phase === 'MINIGAME_RESULTS');
    const finished = host.minigameEvents().filter((e) => e.type === 'runnerFinished');
    expect(finished).toHaveLength(2);
    const entries = host.snapshot.match.lastRound!.entries;
    // The cheater cannot beat the speed cap: at best a tie-ish time, never a teleport.
    const cheaterTime = entries.find((e) => e.playerId === cheater.playerId)!.result.timeMs!;
    const fastest = ((params.length - DISTANCE_SLACK) / (params.maxSpeed * SPEED_TOLERANCE)) * 1000;
    expect(cheaterTime).toBeGreaterThanOrEqual(fastest - harness.tickMs);
  });
});

describe('local minigames (client reports)', () => {
  it('validates reports: bounds, duplicates, dnf reserved, stale session', () => {
    harness = new Harness({ enabled: ['interro-surprise'] });
    const { host, players } = setupRoom(harness, 2, { rounds: 3 });
    const sessionId = startAndActivate(harness, host, players);
    const { length } = host.snapshot.match.minigame!.params as { length: number };
    const [a, b] = players as [TestClient, TestClient];
    const refuse = (c: TestClient, result: object, sid = sessionId) => {
      const r = c.request('minigame.report', { sessionId: sid, result: result as never });
      return r.ok ? 'ok' : `${r.error.code}:${r.error.details?.reason ?? ''}`;
    };
    expect(refuse(a, { outcome: 'dnf' })).toBe('REPORT_REJECTED:dnfReserved');
    expect(refuse(a, { outcome: 'failure', score: length + 1 })).toBe('REPORT_REJECTED:scoreOutOfBounds');
    expect(refuse(a, { outcome: 'success', score: 1, timeMs: 10 })).toBe('REPORT_REJECTED:inconsistentOutcome');
    expect(refuse(a, { outcome: 'weird' })).toBe('INVALID_PAYLOAD:');
    expect(refuse(a, { outcome: 'success', timeMs: 999_999 })).toBe('REPORT_REJECTED:timeOutOfBounds');
    expect(refuse(a, { outcome: 'success', score: length, timeMs: 1_000 }, 'm_old.r1')).toBe('STALE_SESSION:');
    expect(refuse(a, { outcome: 'success', score: length, timeMs: 4_000 })).toBe('ok');
    expect(refuse(a, { outcome: 'success', score: length, timeMs: 1_000 })).toBe('REPORT_REJECTED:duplicate');
    expect(host.snapshot.match.minigame!.finishedPlayerIds).toEqual([a.playerId]);
    // Last report → the minigame ends before its deadline.
    const endsAt = host.snapshot.match.minigame!.timing.endsAt!;
    expect(refuse(b, { outcome: 'failure', score: length - 2, errors: 2, timeMs: 3_000 })).toBe('ok');
    harness.advance(harness.tickMs);
    expect(host.phase).toBe('MINIGAME_ENDING');
    expect(host.snapshot.match.minigame!.timing.endedAt!).toBeLessThan(endsAt);
    harness.advanceUntil(() => host.phase === 'MINIGAME_RESULTS');
    expect(host.snapshot.match.lastRound!.entries.map((e) => [e.playerId, e.rank, e.points])).toEqual([
      [a.playerId, 1, 10],
      [b.playerId, 2, 7],
    ]);
  });

  it('missing reports become dnf after the report grace', () => {
    harness = new Harness({ enabled: ['fausse-couleur'] });
    const { host, players } = setupRoom(harness, 2, { rounds: 3 });
    const sessionId = startAndActivate(harness, host, players);
    players[0]!.ok('minigame.report', { sessionId, result: { outcome: 'success', timeMs: 900 } });
    harness.advanceUntil(() => host.phase === 'MINIGAME_ENDING');
    harness.advanceUntil(() => host.phase === 'MINIGAME_RESULTS');
    const entries = host.snapshot.match.lastRound!.entries;
    expect(entries[0]).toMatchObject({ result: { outcome: 'success' }, points: 6 });
    expect(entries[1]).toMatchObject({ result: { outcome: 'dnf' }, points: 0 });
  });
});

describe('module isolation & extensibility', () => {
  it('a module crashing in start() yields a dnf round; the match continues', () => {
    const broken = defineMiniGame({
      id: 'broken',
      authority: 'server',
      minPlayers: 1,
      maxPlayers: 8,
      durationMs: 1_000,
      scoring: { strategy: 'placement', rankBy: [{ metric: 'score', order: 'desc' }] },
      acceptsReports: false,
      start() {
        throw new Error('boom');
      },
    });
    harness = new Harness({ modules: [broken] });
    const { host, players } = setupRoom(harness, 2, { rounds: 3 });
    players.forEach((p) => p.autoplay());
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'MATCH_RESULTS');
    for (const round of host.snapshot.match.final!.rounds) {
      expect(round.entries.every((e) => e.result.outcome === 'dnf' && e.points === 0)).toBe(true);
    }
  });

  it('a module throwing in onInput answers INTERNAL without breaking the round', () => {
    const fragile = defineMiniGame({
      id: 'fragile',
      authority: 'server',
      minPlayers: 1,
      maxPlayers: 8,
      durationMs: 1_000,
      scoring: { strategy: 'placement', rankBy: [{ metric: 'score', order: 'desc' }] },
      acceptsReports: false,
      input: { schema: z.object({ type: z.literal('x') }), ratePerSecond: 10 },
      start: () => ({
        onInput() {
          throw new Error('oops');
        },
        results: () => ({}),
      }),
    });
    harness = new Harness({ modules: [fragile] });
    const { host, players } = setupRoom(harness, 1, { rounds: 3 });
    const sessionId = startAndActivate(harness, host, players);
    expect(host.request('minigame.input', { sessionId, input: { type: 'x' } })).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL', category: 'server' },
    });
    harness.advanceUntil(() => host.phase === 'MATCH_RESULTS');
  });

  it('a new minigame plugs in with one definition, no engine change', () => {
    const tapRace = defineLocalMiniGame({
      id: 'tap-race',
      durationMs: 2_000,
      scoring: { strategy: 'normalized', rankBy: [{ metric: 'score', order: 'desc' }] },
    });
    harness = new Harness({ modules: [...MINIGAME_MODULES, tapRace], enabled: ['tap-race'] });
    const { host, players } = setupRoom(harness, 2, { rounds: 3 });
    const sessionId = startAndActivate(harness, host, players);
    players[0]!.ok('minigame.report', { sessionId, result: { outcome: 'success', score: 50, normalized: 0.5 } });
    players[1]!.ok('minigame.report', { sessionId, result: { outcome: 'success', score: 90, normalized: 0.9 } });
    harness.advanceUntil(() => host.phase === 'MINIGAME_RESULTS');
    expect(host.snapshot.match.lastRound!.entries.map((e) => e.points)).toEqual([9, 5]);
  });

  it('the registry rejects invalid modules at boot', () => {
    const ok = MINIGAME_MODULES[0]!;
    expect(() => new MiniGameRegistry([ok, ok])).toThrow(/Duplicate/);
    expect(() => new MiniGameRegistry([{ ...ok, id: 'Bad Id' }])).toThrow(/invalid id/);
    expect(() => new MiniGameRegistry([{ ...ok, scoring: { strategy: 'nope', rankBy: [] } as never }])).toThrow(
      /scoring/,
    );
    expect(() => new MiniGameRegistry([ok], ['ghost'])).toThrow(/Unknown/);
  });

  it('refuses a start when no enabled minigame fits the player count', () => {
    const duo = defineLocalMiniGame({
      id: 'duo',
      minPlayers: 2,
      durationMs: 1_000,
      scoring: { strategy: 'placement', rankBy: [{ metric: 'score', order: 'desc' }] },
    });
    harness = new Harness({ modules: [duo] });
    const { host } = setupRoom(harness, 1);
    expect(host.snapshot.lobby.canStart).toBe(false);
    expect(host.request('match.start')).toMatchObject({
      ok: false,
      error: { code: 'CONFIG_INVALID', details: { reason: 'noEligibleMinigame' } },
    });
  });
});
