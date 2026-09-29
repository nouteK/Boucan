import { afterEach, describe, expect, it } from 'vitest';
import { shotTier } from '../src/engine/minigames/modules/gardien';
import { ballX, PING } from '../src/engine/minigames/modules/ping';
import { jumpMs, ropePeriod, SAUTER, sweepTime } from '../src/engine/minigames/modules/sauter';
import { Harness, setupRoom, type TestClient } from './harness';

/** Duels of the OUAF WARE prototype (see docs/adr/0012 → 0014); patate and degaine are in duels.test.ts. */
const NEW_DUELS = ['soleil', 'gardien', 'sauter', 'ping', 'pieces', 'corde', 'radeau', 'boxe'];

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

describe('duels: rounds full of bots always reach a clean verdict', () => {
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

describe('pieces (coin rain)', () => {
  type Pieces = { drops: { at: number; x: number; bomb: boolean }[]; players: Record<string, { x: number; coins: number; stun: boolean }>; winners: string[] | null };

  it('the same drops fall on every lane; coins count, bombs cost and stun', () => {
    harness = duelHarness('pieces');
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    harness.advance(harness.tickMs);
    const { drops } = stateOf<Pieces>(host);
    expect(drops.length).toBeGreaterThan(10);
    expect(drops[0]!.bomb).toBe(false);
    // Player 0 stands still at 0 and catches what falls there; player 1 runs to the far right edge and catches nothing.
    input(players[1]!, round.roundId, { type: 'move', dir: 1 });
    harness.advanceUntil(() => host.phase === 'VERDICT');
    const s = stateOf<Pieces>(host);
    const atZero = drops.filter((d) => Math.abs(d.x) < 0.62);
    const expected = atZero.reduce((c, d) => (d.bomb ? Math.max(0, c - 2) : c + 1), 0);
    expect(s.players[players[0]!.playerId!]!.coins).toBeLessThanOrEqual(atZero.filter((d) => !d.bomb).length);
    expect(s.players[players[0]!.playerId!]!.coins).toBeGreaterThanOrEqual(Math.min(expected, 1));
    const best = Math.max(...Object.values(s.players).map((p) => p.coins));
    const o = outcomes(host);
    for (const [id, p] of Object.entries(s.players)) expect(o[id]).toBe(p.coins === best ? 'success' : 'failure');
  });
});

describe('sauter (jump rope)', () => {
  type Sauter = { start: number; out: Record<string, number>; winners: string[] | null };
  /** Jump so that the rope sweeps under you at the top of the jump. */
  const jumpFor = (sweep: number) => sweepTime(sweep) - jumpMs(ropePeriod(sweep)) / 2;

  it('whoever is on the ground when the rope sweeps is out; the last one jumping wins', () => {
    harness = duelHarness('sauter');
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    harness.advance(harness.tickMs);
    const { start } = stateOf<Sauter>(host);
    harness.advance(start + jumpFor(0) - harness.now);
    input(players[0]!, round.roundId, { type: 'jump' });
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(host.minigameEvents().find((e) => e.type === 'out')).toMatchObject({ playerIds: [players[1]!.playerId], turn: 0 });
    expect(outcomes(host)).toEqual({ [players[0]!.playerId!]: 'success', [players[1]!.playerId!]: 'failure' });
  });

  it('a jump that lands before the rope arrives does not count; knocked out together = tied winners', () => {
    harness = duelHarness('sauter');
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    harness.advance(harness.tickMs);
    const { start } = stateOf<Sauter>(host);
    harness.advance(start - harness.now);
    for (const p of players) input(p, round.roundId, { type: 'jump' });
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(stateOf<Sauter>(host).winners?.sort()).toEqual(players.map((p) => p.playerId!).sort());
    expect(Object.values(outcomes(host))).toEqual(['success', 'success']);
  });

  it('the rope speeds up every turn, down to its fastest period', () => {
    expect(ropePeriod(1)).toBeLessThan(ropePeriod(0));
    expect(ropePeriod(40)).toBe(SAUTER.minPeriod);
    expect(sweepTime(1) - sweepTime(0)).toBe(ropePeriod(1));
  });
});

describe('ping (ping-pong)', () => {
  type Ping = { matches: { ids: [string, string | null]; ball: { from: 0 | 1; x0: number; x1: number; t0: number; d: number } | null; winner: 0 | 1 | null }[] };

  it('an unreturned ball is a point for the hitter; first to 2 wins the match', () => {
    harness = duelHarness('ping');
    const { host } = setupRoom(harness, 2);
    host.ok('match.start');
    toMicrogame(harness, host);
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(host.minigameEvents().filter((e) => e.type === 'point')).toHaveLength(3);
    expect(host.minigameEvents().filter((e) => e.type === 'won')).toHaveLength(1);
    expect(Object.values(outcomes(host)).sort()).toEqual(['failure', 'success']);
  });

  it('a swing in reach and on time sends the ball back (perfect timing = smash)', () => {
    harness = duelHarness('ping');
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    const round = toMicrogame(harness, host);
    harness.advanceUntil(() => stateOf<Ping>(host).matches[0]!.ball !== null);
    const m = stateOf<Ping>(host).matches[0]!;
    const b = m.ball!;
    const receiver = players.find((p) => p.playerId === m.ids[b.from === 0 ? 1 : 0])!;
    harness.advance(Math.round(b.t0 + b.d * PING.smashAt - harness.now));
    input(receiver, round.roundId, { type: 'swing', px: ballX(b as never, harness.now), x1: 0.5 });
    expect(host.minigameEvents().find((e) => e.type === 'hit')).toMatchObject({ side: b.from === 0 ? 1 : 0, smash: true });
    harness.advance(60);
    expect(stateOf<Ping>(host).matches[0]!.ball!.from).toBe(b.from === 0 ? 1 : 0);
  });

  it('an odd player faces the house bot; everyone gets a result', () => {
    harness = duelHarness('ping');
    const { host } = setupRoom(harness, 1, { bots: 2 });
    host.ok('match.start');
    toMicrogame(harness, host);
    harness.advance(harness.tickMs);
    expect(stateOf<Ping>(host).matches.map((m) => m.ids.includes(null))).toEqual([false, true]);
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(host.snapshot.match.verdict!.entries).toHaveLength(3);
  });
});
