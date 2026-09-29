import { afterEach, describe, expect, it } from 'vitest';
import { MICROGAMES, RoomSnapshot, type Verdict } from '@boucan/shared';
import { DEFAULT_GAME_CONFIG } from '../src/config/game-config';
import { Harness, setupRoom, type TestClient } from './harness';

let harness: Harness;
afterEach(() => harness?.dispose());

const { gamesPerLevel, speedUpEvery, duelEvery } = DEFAULT_GAME_CONFIG.rhythm;

/** Every verdict seen by a client, in order. */
export function verdicts(client: TestClient): Verdict[] {
  const seen = new Map<string, Verdict>();
  for (const m of client.received) {
    if (m.type === 'room.snapshot' && m.payload.match.verdict) seen.set(m.payload.match.verdict.roundId, m.payload.match.verdict);
  }
  return [...seen.values()];
}

export function rounds(client: TestClient) {
  const seen = new Map<string, NonNullable<RoomSnapshot['match']['round']>>();
  for (const m of client.received) {
    if (m.type === 'room.snapshot' && m.payload.match.round) seen.set(m.payload.match.round.roundId, m.payload.match.round);
  }
  return [...seen.values()];
}

describe('lobby', () => {
  it('creates a room with default config and validates the nickname', () => {
    harness = new Harness();
    const host = harness.client();
    const reply = host.ok('room.create', { nickname: '  Léa   la  Terrible ', characterId: 'chien' }) as { snapshot: unknown };
    const snap = RoomSnapshot.parse(reply.snapshot);
    expect(snap.lobby.config).toEqual({ zone: 'mix', lives: 4, length: 'normal' });
    expect(snap.lobby.players[0]).toMatchObject({ nickname: 'Léa la Terrible', characterId: 'chien', isHost: true, isBot: false, lives: 4, alive: true });
    expect(snap.match.phase).toBe('LOBBY');
    expect(harness.client().request('room.create', { nickname: 'C0nn4rd' })).toMatchObject({ ok: false, error: { code: 'NICKNAME_NOT_ALLOWED' } });
  });

  it('host adds server bots (ready, never host); guests cannot; bots can be kicked', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 2, { ready: false });
    expect(players[1]!.request('room.addBot')).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    host.ok('room.addBot');
    host.ok('room.addBot');
    const bots = host.snapshot.lobby.players.filter((p) => p.isBot);
    expect(bots).toHaveLength(2);
    expect(bots.every((b) => b.ready && !b.isHost)).toBe(true);
    expect(bots[0]!.nickname).not.toBe(bots[1]!.nickname);
    host.ok('room.kick', { playerId: bots[0]!.id });
    expect(host.snapshot.lobby.players.filter((p) => p.isBot)).toHaveLength(1);
    for (let i = 0; i < 5; i++) host.ok('room.addBot');
    expect(host.request('room.addBot')).toMatchObject({ ok: false, error: { code: 'ROOM_FULL' } });
  });

  it('only connected humans must be ready to start; config is validated', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 2, { ready: false, bots: 2 });
    expect(host.request('match.configure', { lives: 7 })).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    expect(host.request('match.configure', { zone: 'piscine' as 'prairie' })).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    host.ok('match.configure', { zone: 'desert', lives: 3, length: 'court' });
    expect(host.snapshot.lobby.players.every((p) => p.lives === 3)).toBe(true);
    expect(host.request('match.start')).toMatchObject({ ok: false, error: { code: 'NOT_ALL_READY' } });
    players.forEach((p) => p.ok('player.ready', { ready: true }));
    expect(host.snapshot.lobby.canStart).toBe(true);
    host.ok('match.start');
    expect(host.phase).toBe('STAGE_INTRO');
    expect(host.snapshot.match.zone).toBe('desert');
  });
});

describe('match flow', () => {
  it('solo, all wins: a level of microgames with speed-ups, then results', () => {
    harness = new Harness();
    const { host } = setupRoom(harness, 1, { config: { length: 'court', zone: 'ville' } });
    host.autoplay('win');
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'STAGE_RESULTS');

    const all = rounds(host);
    expect(all).toHaveLength(gamesPerLevel);
    expect(all.map((r) => r.index)).toEqual(all.map((_, i) => i + 1));
    expect(all.every((r) => r.kind === 'solo')).toBe(true); // no duel alone, no boss in the catalog
    expect(all.every((r) => r.zone === 'ville')).toBe(true);
    const speedUps = all.filter((r) => r.speedUp).map((r) => r.index);
    expect(speedUps).toEqual([speedUpEvery + 1, 2 * speedUpEvery + 1]);
    expect(all.at(-1)!.tempo).toBeGreaterThan(1);
    const phases = host.phaseHistory();
    expect(phases[0]).toBe('STAGE_INTRO');
    expect(phases.slice(1, -1)).toEqual(all.flatMap(() => ['INTERLUDE', 'MICROGAME', 'VERDICT']));
    expect(phases.at(-1)).toBe('STAGE_RESULTS');

    const final = host.snapshot.match.final!;
    expect(final.winnerIds).toEqual([host.playerId]);
    expect(final.entries[0]).toMatchObject({ alive: true, lives: 4, wins: gamesPerLevel });
    expect(final.microgamesPlayed).toBe(gamesPerLevel);

    host.ok('match.returnToLobby');
    expect(host.phase).toBe('LOBBY');
    expect(host.me()).toMatchObject({ lives: 4, wins: 0, alive: true, ready: false });
  });

  it('levels rise after their microgames; a boss, when the catalog has one, closes the level (+1 life)', () => {
    harness = new Harness();
    const { host } = setupRoom(harness, 1, { config: { length: 'normal' } });
    host.autoplay('win');
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'STAGE_RESULTS');
    const plain = rounds(host);
    expect(plain).toHaveLength(2 * gamesPerLevel);
    expect(plain[gamesPerLevel]).toMatchObject({ level: 2, levelUp: true });
    harness.dispose();

    harness = new Harness({ catalog: [...MICROGAMES, { id: 'boss-test', kind: 'boss', zones: 'all', durationMs: 5000, hint: 'tap' }] });
    const { host: h2 } = setupRoom(harness, 1, { config: { length: 'court' } });
    h2.autoplay('win');
    h2.ok('match.start');
    harness.advanceUntil(() => h2.phase === 'STAGE_RESULTS');
    const all = rounds(h2);
    expect(all).toHaveLength(gamesPerLevel + 1);
    expect(all.at(-1)).toMatchObject({ kind: 'boss', microgameId: 'boss-test' });
    expect(h2.snapshot.match.final!.entries[0]).toMatchObject({ alive: true, lives: 5 });
  });

  it('solo, all losses: eliminated after `lives` microgames', () => {
    harness = new Harness();
    const { host } = setupRoom(harness, 1, { config: { lives: 3 } });
    host.autoplay('lose');
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'STAGE_RESULTS');
    const v = verdicts(host);
    expect(v).toHaveLength(3);
    expect(v.map((x) => x.entries[0]!.lives)).toEqual([2, 1, 0]);
    expect(v[2]!.entries[0]!.eliminated).toBe(true);
    expect(host.snapshot.match.final!.entries[0]).toMatchObject({ alive: false, eliminatedAt: 3 });
  });

  it('no report = dnf = a life lost', () => {
    harness = new Harness();
    const { host } = setupRoom(harness, 1);
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(host.snapshot.match.verdict!.entries[0]).toMatchObject({ outcome: 'dnf', livesDelta: -1, lives: 3 });
  });

  for (const [humans, bots] of [
    [2, 0],
    [1, 3],
    [2, 6],
  ] as const) {
    it(`${humans} human(s) + ${bots} bot(s): lives, ghosts, duels and a winner`, () => {
      harness = new Harness();
      const { host, players } = setupRoom(harness, humans, { bots, config: { length: 'long' } });
      players.forEach((p) => p.autoplay('random'));
      host.ok('match.start');
      harness.advanceUntil(() => host.phase === 'STAGE_RESULTS');

      const count = humans + bots;
      const final = host.snapshot.match.final!;
      expect(final.entries).toHaveLength(count);
      const alive = final.entries.filter((e) => e.alive);
      // One survivor — or none when the last ones fall on the same microgame (tied winners) — unless all levels were cleared.
      expect(alive.length <= 1 || host.snapshot.match.level > 3).toBe(true);
      if (alive.length === 0) expect(final.winnerIds.length).toBeGreaterThanOrEqual(2);
      expect(final.winnerIds).toContain(final.entries[0]!.playerId);

      // Lives bookkeeping: start − losses + boss bonuses = final lives.
      const v = verdicts(host);
      for (const e of final.entries) {
        const deltas = v.flatMap((x) => x.entries.filter((y) => y.playerId === e.playerId && y.counted).map((y) => y.livesDelta));
        expect(4 + deltas.reduce((a, b) => a + b, 0)).toBe(e.lives);
      }
      // Ghosts keep playing solo games but no longer count; duels only have alive players.
      const all = rounds(host);
      const eliminatedAt = new Map(final.entries.map((e) => [e.playerId, e.eliminatedAt]));
      for (const r of all) {
        if (r.kind !== 'duel') continue;
        expect(r.index % duelEvery).toBe(0);
        for (const id of r.participants) expect((eliminatedAt.get(id) ?? Infinity) >= r.index).toBe(true);
      }
      for (const x of v) {
        for (const e of x.entries) {
          const out = eliminatedAt.get(e.playerId);
          if (!e.counted) expect(out != null && out < x.index).toBe(true);
        }
      }
      expect(all.some((r) => r.kind === 'duel')).toBe(true);
      for (const p of players) expect(p.snapshot.match.final).toEqual(final);
    });
  }

  it('announces timestamps in the interlude; the microgame starts exactly then', () => {
    harness = new Harness();
    const { host } = setupRoom(harness, 1);
    host.autoplay('win');
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'INTERLUDE');
    const interlude = host.snapshot.match;
    const round = interlude.round!;
    expect(round.timing.activeAt).toBe(interlude.phaseEndsAt);
    expect(round.timing.endsAt).toBe(round.timing.activeAt + round.timing.durationMs);
    harness.advanceUntil(() => host.phase === 'MICROGAME');
    const game = host.snapshot.match;
    expect(game.phaseStartedAt).toBe(round.timing.activeAt);
    expect(game.phaseEndsAt).toBe(round.timing.endsAt + DEFAULT_GAME_CONFIG.timings.reportGraceMs);
    harness.advanceUntil(() => Object.keys(host.snapshot.match.round?.progress ?? {}).length > 0);
    expect(host.snapshot.match.round!.progress[host.playerId!]).toBe('success');
    expect(host.phase).toBe('MICROGAME');
  });

  it('refuses duplicate, late and stale reports', () => {
    harness = new Harness();
    const { host } = setupRoom(harness, 1);
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'MICROGAME');
    const roundId = host.snapshot.match.round!.roundId;
    expect(host.request('minigame.report', { roundId: 'm_x.1', result: { outcome: 'success' } })).toMatchObject({ ok: false, error: { code: 'STALE_SESSION' } });
    host.ok('minigame.report', { roundId, result: { outcome: 'success' } });
    expect(host.request('minigame.report', { roundId, result: { outcome: 'failure' } })).toMatchObject({ ok: false, error: { details: { reason: 'duplicate' } } });
    harness.advanceUntil(() => host.phase === 'INTERLUDE');
    expect(host.request('minigame.report', { roundId, result: { outcome: 'success' } })).toMatchObject({ ok: false, error: { code: 'INVALID_PHASE' } });
    expect(host.snapshot.match.verdict!.entries[0]).toMatchObject({ outcome: 'success', livesDelta: 0 });
  });

  it('the host can abort; the room keeps its players', () => {
    harness = new Harness();
    const { host } = setupRoom(harness, 1, { bots: 2 });
    host.ok('match.start');
    harness.advance(3000);
    host.ok('match.abort');
    expect(host.phase).toBe('LOBBY');
    expect(host.snapshot.lobby.players).toHaveLength(3);
    expect(host.events()).toContainEqual({ kind: 'matchAborted', reason: 'host' });
  });
});
