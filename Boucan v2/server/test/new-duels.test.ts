import { afterEach, describe, expect, it } from 'vitest';
import { shotTier } from '../src/engine/minigames/modules/gardien';
import { Harness, setupRoom, type TestClient } from './harness';

/** Duels integrated from the OUAF WARE prototype (see docs/adr/0012-nouveaux-mini-jeux.md). */
const NEW_DUELS = ['cristal', 'boules', 'glace', 'corde', 'radeau', 'boxe', 'soleil', 'roi', 'gardien', 'noir'];

let harness: Harness;
afterEach(() => harness?.dispose());

function duelHarness(id: string, seed = 42, options: { rtt?: number } = {}) {
  return new Harness({ enabled: ['cours', id], config: { seed, rhythm: { duelEvery: 1 } }, ...options });
}

function toMicrogame(h: Harness, c: TestClient) {
  h.advanceUntil(() => c.phase === 'MICROGAME');
  return c.snapshot.match.round!;
}

/** Latest shared state of the current duel. */
function stateOf<T>(c: TestClient): T {
  const m = c.received.filter((x) => x.type === 'minigame.state').at(-1) as { payload: { state: T } } | undefined;
  if (!m) throw new Error('no state yet');
  return m.payload.state;
}

function outcomes(c: TestClient): Record<string, string> {
  return Object.fromEntries(c.snapshot.match.verdict!.entries.map((e) => [e.playerId, e.outcome]));
}

const input = (c: TestClient, roundId: string, payload: Record<string, unknown>) => c.send('minigame.input', { roundId, input: payload as never });

describe('new duels: rounds full of bots always reach a clean verdict', () => {
  for (const id of NEW_DUELS) {
    it(id, () => {
      for (const seed of [1, 7, 42]) {
        harness = duelHarness(id, seed);
        const { host } = setupRoom(harness, 1, { bots: 4 });
        host.ok('match.start');
        const round = toMicrogame(harness, host);
        expect(round.microgameId).toBe(id);
        expect(round.kind).toBe('duel');
        harness.advanceUntil(() => host.phase === 'VERDICT', round.timing.durationMs + 2000);
        const entries = host.snapshot.match.verdict!.entries;
        expect(entries).toHaveLength(5);
        for (const e of entries) expect(['success', 'failure'], `${id} seed ${seed}`).toContain(e.outcome);
        harness.dispose();
      }
    });
  }
});

describe('cristal (last crystal)', () => {
  it('an early grab loses; the fastest get the crystals; empty hands lose', () => {
    harness = duelHarness('cristal');
    const { host, players } = setupRoom(harness, 3);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    input(players[0]!, round.roundId, { type: 'grab' });
    harness.advanceUntil(() => host.minigameEvents().some((e) => e.type === 'open'));
    harness.advance(200);
    input(players[1]!, round.roundId, { type: 'grab' });
    harness.advanceUntil(() => host.phase === 'VERDICT');
    const byId = outcomes(host);
    expect(byId[players[0]!.playerId!]).toBe('failure');
    expect(byId[players[1]!.playerId!]).toBe('success');
    expect(byId[players[2]!.playerId!]).toBe('failure');
  });
});

describe('boules (snowball fight)', () => {
  it('ducking before each impact dodges everything; the most hit loses', () => {
    harness = duelHarness('boules');
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    harness.advance(harness.tickMs);
    const { impacts } = stateOf<{ impacts: number[] }>(host);
    for (const impact of impacts) {
      harness.advanceUntil(() => harness.now >= impact - 200);
      input(players[0]!, round.roundId, { type: 'duck' });
    }
    harness.advanceUntil(() => host.phase === 'VERDICT');
    const dodges = host.minigameEvents().filter((e) => e.type === 'dodge' && e.playerId === players[0]!.playerId);
    expect(dodges).toHaveLength(impacts.length);
    expect(outcomes(host)).toEqual({ [players[0]!.playerId!]: 'success', [players[1]!.playerId!]: 'failure' });
  });
});

describe('glace (ice race)', () => {
  it('pushing too hard makes you slip; a steady skater finishes first', () => {
    harness = duelHarness('glace');
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    for (let i = 0; i < 12; i++) input(players[1]!, round.roundId, { type: 'push' });
    harness.advance(harness.tickMs);
    expect(host.minigameEvents().some((e) => e.type === 'slip' && e.playerId === players[1]!.playerId)).toBe(true);
    for (let t = 0; t < 7000 && host.phase === 'MICROGAME'; t += 250) {
      input(players[0]!, round.roundId, { type: 'push' });
      harness.advance(250);
    }
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(outcomes(host)[players[0]!.playerId!]).toBe('success');
  });
});

describe('corde (tug of war)', () => {
  it('only alternating pulls count, and the pulling team wins', () => {
    harness = duelHarness('corde');
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    harness.advance(harness.tickMs);
    const puller = players[0]!;
    for (let i = 0; i < 5; i++) input(puller, round.roundId, { type: 'pull', side: -1 });
    harness.advance(harness.tickMs);
    expect(Math.abs(stateOf<{ rope: number }>(host).rope)).toBeLessThan(0.05);
    for (let i = 0; i < 40 && host.phase === 'MICROGAME'; i++) {
      input(puller, round.roundId, { type: 'pull', side: i % 2 ? -1 : 1 });
      harness.advance(100);
    }
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(outcomes(host)).toEqual({ [puller.playerId!]: 'success', [players[1]!.playerId!]: 'failure' });
  });
});

describe('radeau (rafting)', () => {
  it('a raft rushing into a rapid capsizes; the raft that arrives first wins', () => {
    harness = duelHarness('radeau');
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    let side = 1;
    for (let t = 0; host.phase === 'MICROGAME' && t < 12_000; t += 90) {
      input(players[0]!, round.roundId, { type: 'paddle', side: (side = -side) });
      harness.advance(90);
    }
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(host.minigameEvents().some((e) => e.type === 'capsize')).toBe(true);
    expect(outcomes(host)).toEqual({ [players[0]!.playerId!]: 'success', [players[1]!.playerId!]: 'failure' });
  });
});

describe('boxe (boxing)', () => {
  it('three clean punches knock the other out; a guard blocks', () => {
    harness = duelHarness('boxe');
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    harness.advanceUntil(() => host.minigameEvents().some((e) => e.type === 'bell'));
    const [a, b] = [players[0]!, players[1]!];
    input(b, round.roundId, { type: 'guard', on: true });
    harness.advance(100);
    input(a, round.roundId, { type: 'punch' });
    harness.advance(400);
    expect(host.minigameEvents().some((e) => e.type === 'block')).toBe(true);
    input(b, round.roundId, { type: 'guard', on: false });
    for (let i = 0; i < 12 && host.phase === 'MICROGAME'; i++) {
      input(a, round.roundId, { type: 'punch' });
      harness.advance(1000);
    }
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(host.minigameEvents().some((e) => e.type === 'ko' && e.playerId === b.playerId)).toBe(true);
    expect(outcomes(host)).toEqual({ [a.playerId!]: 'success', [b.playerId!]: 'failure' });
  });

  it('an odd player boxes the training bomb', () => {
    harness = duelHarness('boxe');
    const { host } = setupRoom(harness, 3);
    host.ok('match.start');
    toMicrogame(harness, host);
    harness.advance(harness.tickMs);
    const { fights } = stateOf<{ fights: { a: { id: string | null }; b: { id: string | null } }[] }>(host);
    expect(fights).toHaveLength(2);
    expect(fights.flatMap((f) => [f.a.id, f.b.id]).filter((id) => id === null)).toHaveLength(1);
  });
});

describe('soleil (red light, green light)', () => {
  it('a runner who reaches an idle lookout wins; moving while watched is caught', () => {
    harness = duelHarness('soleil');
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    harness.advance(harness.tickMs);
    const { lookout } = stateOf<{ lookout: string }>(host);
    const runner = players.find((p) => p.playerId !== lookout)!;
    for (let i = 0; i < 30 && host.phase === 'MICROGAME'; i++) {
      input(runner, round.roundId, { type: 'step', side: i % 2 ? 1 : -1 });
      harness.advance(120);
    }
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(outcomes(host)).toEqual({ [runner.playerId!]: 'success', [lookout]: 'failure' });
  });

  it('stepping while the lookout watches gets you caught', () => {
    harness = duelHarness('soleil', 3);
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    harness.advance(harness.tickMs);
    const { lookout } = stateOf<{ lookout: string }>(host);
    const guard = players.find((p) => p.playerId === lookout)!;
    const runner = players.find((p) => p.playerId !== lookout)!;
    harness.advance(1000);
    input(guard, round.roundId, { type: 'turn' });
    harness.advance(600);
    input(runner, round.roundId, { type: 'step', side: 1 });
    harness.advance(harness.tickMs);
    expect(host.minigameEvents().some((e) => e.type === 'caught' && e.playerId === runner.playerId)).toBe(true);
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(outcomes(host)).toEqual({ [runner.playerId!]: 'failure', [lookout]: 'success' });
  });
});

describe('roi (king of the hill)', () => {
  it('the king knocks back a climber in reach, unless they hold on', () => {
    harness = duelHarness('roi');
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    harness.advance(harness.tickMs);
    const { king, climbers } = stateOf<{ king: string; climbers: Record<string, { side: -1 | 1; height: number }> }>(host);
    const kingC = players.find((p) => p.playerId === king)!;
    const climber = players.find((p) => p.playerId !== king)!;
    const side = climbers[climber.playerId!]!.side;
    const height = () => stateOf<{ climbers: Record<string, { height: number }> }>(host).climbers[climber.playerId!]!.height;
    for (let i = 0; height() < 0.75; i++) {
      input(climber, round.roundId, { type: 'climb', side: i % 2 ? 1 : -1 });
      harness.advance(60);
    }
    const before = height();
    input(climber, round.roundId, { type: 'hold', on: true });
    harness.advance(200);
    input(kingC, round.roundId, { type: 'strike', side });
    harness.advance(400);
    expect(host.minigameEvents().some((e) => e.type === 'held')).toBe(true);
    expect(height()).toBeGreaterThan(before - 0.1);
    input(climber, round.roundId, { type: 'hold', on: false });
    harness.advance(600);
    input(kingC, round.roundId, { type: 'strike', side });
    harness.advance(400);
    expect(host.minigameEvents().some((e) => e.type === 'knock')).toBe(true);
    expect(height()).toBeLessThan(before - 0.3);
  });
});

describe('gardien (penalties)', () => {
  it('shot tiers follow the power bar', () => {
    expect(shotTier(0.2)).toBe('weak');
    expect(shotTier(0.84)).toBe('perfect');
    expect(shotTier(0.9)).toBe('strong');
    expect(shotTier(0.6)).toBe('normal');
    expect(shotTier(0.97)).toBe('over');
  });

  it('an early dive the right way saves the shot', () => {
    harness = duelHarness('gardien');
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    harness.advance(harness.tickMs);
    const { keeper } = stateOf<{ keeper: string }>(host);
    const k = players.find((p) => p.playerId === keeper)!;
    const shooter = players.find((p) => p.playerId !== keeper)!;
    harness.advance(1000);
    input(shooter, round.roundId, { type: 'aim', dir: 'L' });
    input(k, round.roundId, { type: 'dive', dir: 'L' });
    harness.advance(300);
    input(shooter, round.roundId, { type: 'shoot' });
    harness.advanceUntil(() => host.phase === 'VERDICT');
    const res = host.minigameEvents().find((e) => e.type === 'saved' || e.type === 'goal' || e.type === 'miss')!;
    expect(['saved', 'miss']).toContain(res.type);
    expect(outcomes(host)).toEqual({ [shooter.playerId!]: 'failure', [keeper]: 'success' });
  });
});

describe('noir (hide and seek)', () => {
  it('the hunter catches a prey right in front of them', () => {
    harness = duelHarness('noir');
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    harness.advance(harness.tickMs);
    const s = stateOf<{ hunter: string; players: Record<string, { x: number }> }>(host);
    const hunter = players.find((p) => p.playerId === s.hunter)!;
    const prey = players.find((p) => p.playerId !== s.hunter)!;
    const pos = () => stateOf<{ players: Record<string, { x: number }> }>(host).players;
    const dir = pos()[prey.playerId!]!.x > pos()[hunter.playerId!]!.x ? 1 : -1;
    input(hunter, round.roundId, { type: 'move', dir });
    harness.advanceUntil(() => Math.abs(pos()[prey.playerId!]!.x - pos()[hunter.playerId!]!.x) < 90, 8000);
    input(hunter, round.roundId, { type: 'move', dir: 0 });
    input(hunter, round.roundId, { type: 'grab' });
    harness.advance(300);
    expect(host.minigameEvents().some((e) => e.type === 'caught' && e.playerId === prey.playerId)).toBe(true);
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(outcomes(host)).toEqual({ [prey.playerId!]: 'failure', [hunter.playerId!]: 'success' });
  });
});
