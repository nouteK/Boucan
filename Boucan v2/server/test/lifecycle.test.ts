import { afterEach, describe, expect, it } from 'vitest';
import { RoomSnapshot } from '@boucan/shared';
import { Harness, setupRoom } from './harness';

let harness: Harness;
afterEach(() => harness?.dispose());

const ROUND_PHASES = [
  'MINIGAME_PREPARING',
  'MINIGAME_COUNTDOWN',
  'MINIGAME_ACTIVE',
  'MINIGAME_ENDING',
  'MINIGAME_RESULTS',
];

function expectedPhases(rounds: number): string[] {
  const out = ['MATCH_STARTING'];
  for (let r = 1; r <= rounds; r++) {
    out.push(...ROUND_PHASES);
    out.push(r < rounds ? 'INTERMISSION' : 'MATCH_RESULTS');
  }
  return out;
}

describe('room creation & lobby', () => {
  it('creates a room, returns a session and a valid snapshot', () => {
    harness = new Harness();
    const host = harness.client();
    const reply = host.ok('room.create', { nickname: '  Léa   la  Terrible ', characterId: 'fox' }) as {
      playerId: string;
      sessionToken: string;
      snapshot: unknown;
    };
    const snapshot = RoomSnapshot.parse(reply.snapshot);
    expect(reply.sessionToken.length).toBeGreaterThan(20);
    expect(snapshot.lobby.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(snapshot.lobby.hostId).toBe(reply.playerId);
    expect(snapshot.match.phase).toBe('LOBBY');
    expect(snapshot.lobby.players).toEqual([
      expect.objectContaining({
        nickname: 'Léa la Terrible',
        characterId: 'fox',
        seat: 0,
        isHost: true,
        ready: false,
        connection: 'connected',
      }),
    ]);
  });

  it('joins with a case-insensitive code, dedupes nicknames and broadcasts to everyone', () => {
    harness = new Harness();
    const host = harness.client();
    host.ok('room.create', { nickname: 'Momo' });
    const code = host.snapshot.lobby.code;
    const guest = harness.client();
    guest.ok('room.join', { code: ` ${code.toLowerCase()} `, nickname: 'momo' });
    expect(guest.snapshot.lobby.players.map((p) => p.nickname)).toEqual(['Momo', 'momo 2']);
    expect(host.snapshot.lobby.players).toHaveLength(2);
    expect(host.events()).toContainEqual({ kind: 'playerJoined', playerId: guest.playerId });
  });

  it('refuses unknown rooms, full rooms and rooms in match', () => {
    harness = new Harness();
    const lost = harness.client();
    expect(lost.request('room.join', { code: 'ZZZZ', nickname: 'Perdu' })).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND', category: 'request' },
    });
    const { code, host } = setupRoom(harness, 8);
    const ninth = harness.client();
    expect(ninth.request('room.join', { code, nickname: 'Neuvième' })).toMatchObject({
      ok: false,
      error: { code: 'ROOM_FULL' },
    });
    host.ok('room.kick', { playerId: host.snapshot.lobby.players[7]!.id });
    host.ok('match.start');
    expect(ninth.request('room.join', { code, nickname: 'Retard' })).toMatchObject({
      ok: false,
      error: { code: 'MATCH_IN_PROGRESS' },
    });
  });

  it('validates nicknames server-side', () => {
    harness = new Harness();
    const c = harness.client();
    const refuse = (nickname: string) => {
      const reply = c.request('room.create', { nickname });
      return reply.ok ? null : { code: reply.error.code, reason: reply.error.details?.reason };
    };
    expect(refuse('')).toEqual({ code: 'NICKNAME_INVALID', reason: 'empty' });
    expect(refuse('A')).toEqual({ code: 'NICKNAME_INVALID', reason: 'tooShort' });
    expect(refuse('x'.repeat(17))).toEqual({ code: 'NICKNAME_INVALID', reason: 'tooLong' });
    expect(refuse('<script>')).toEqual({ code: 'NICKNAME_INVALID', reason: 'invalidChars' });
    expect(refuse('Bob‮evil')).toEqual({ code: 'NICKNAME_INVALID', reason: 'invalidChars' });
    expect(refuse('---')).toEqual({ code: 'NICKNAME_INVALID', reason: 'noLetter' });
    expect(refuse('C0nn4rd')).toEqual({ code: 'NICKNAME_NOT_ALLOWED', reason: undefined });
    expect(refuse('Zoé_42')).toBeNull();
  });

  it('only the host configures and starts; start requires everyone ready', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 3, { ready: false });
    const guest = players[1]!;
    expect(guest.request('match.configure', { rounds: 3 })).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    expect(host.request('match.configure', { rounds: 4 as 3 })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD', category: 'protocol' },
    });
    expect(host.request('match.configure', { minigamePool: ['nope'] })).toMatchObject({
      ok: false,
      error: { code: 'CONFIG_INVALID', details: { reason: 'unknownMinigame' } },
    });
    host.ok('match.configure', { rounds: 3, minigamePool: ['sonnerie'] });
    expect(host.snapshot.lobby.config).toEqual({ rounds: 3, minigamePool: ['sonnerie'] });
    expect(host.request('match.start')).toMatchObject({ ok: false, error: { code: 'NOT_ALL_READY' } });
    for (const p of players) p.ok('player.ready', { ready: true });
    expect(host.snapshot.lobby.canStart).toBe(true);
    expect(guest.request('match.start')).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    host.ok('match.start');
    expect(host.phase).toBe('MATCH_STARTING');
    expect(guest.request('player.ready', { ready: false })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PHASE' },
    });
  });
});

describe('full match (vertical slice)', () => {
  for (const [count, rounds] of [
    [1, 3],
    [2, 5],
    [4, 8],
    [8, 10],
  ] as const) {
    it(`plays ${rounds} rounds with ${count} player(s) and returns to the lobby`, () => {
      harness = new Harness();
      const { host, players } = setupRoom(harness, count, { rounds });
      players.forEach((p, i) => p.autoplay(0.3 + (i % 4) * 0.2));
      host.ok('match.start');
      harness.advanceUntil(() => host.phase === 'MATCH_RESULTS');

      expect(host.phaseHistory()).toEqual(expectedPhases(rounds));
      const snap = host.snapshot;
      expect(snap.match.round).toBe(rounds);
      const final = snap.match.final!;
      expect(final.rounds).toHaveLength(rounds);
      expect(final.standings).toHaveLength(count);
      // Scores = sum of round points, standings sorted and consistent.
      for (const standing of final.standings) {
        const sum = final.rounds.reduce(
          (acc, r) => acc + (r.entries.find((e) => e.playerId === standing.playerId)?.points ?? 0),
          0,
        );
        expect(standing.score).toBe(sum);
        expect(snap.lobby.players.find((p) => p.id === standing.playerId)!.score).toBe(sum);
      }
      const scores = final.standings.map((s) => s.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
      expect(final.winnerIds).toContain(final.standings[0]!.playerId);
      // Every round had every player; bots actually played (not everyone dnf).
      for (const round of final.rounds) {
        expect(round.entries).toHaveLength(count);
        expect(round.solo).toBe(count === 1);
        expect(round.entries.some((e) => e.result.outcome !== 'dnf')).toBe(true);
      }
      // No immediate repeat of a minigame.
      const ids = final.rounds.map((r) => r.minigameId);
      ids.slice(1).forEach((id, i) => expect(id).not.toBe(ids[i]));

      // All clients see the same final state.
      for (const p of players) expect(p.snapshot.match.final).toEqual(final);

      host.ok('match.returnToLobby');
      expect(host.phase).toBe('LOBBY');
      expect(host.snapshot.match.final).toBeNull();
      expect(host.snapshot.lobby.players.every((p) => !p.ready && p.score === 0)).toBe(true);
    });
  }

  it('announces timestamps that clients can animate locally', () => {
    harness = new Harness({ enabled: ['fausse-couleur'] });
    const { host, players } = setupRoom(harness, 2, { rounds: 3 });
    players.forEach((p) => p.autoplay());
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'MINIGAME_COUNTDOWN');
    const countdown = host.snapshot;
    const session = countdown.match.minigame!;
    expect(countdown.match.phaseEndsExactly).toBe(true);
    expect(session.timing.activeAt).toBe(countdown.match.phaseEndsAt);
    expect(session.timing.endsAt).toBe(session.timing.activeAt! + session.timing.durationMs);
    harness.advanceUntil(() => host.phase === 'MINIGAME_ACTIVE');
    const active = host.snapshot;
    // The active phase starts exactly at the announced timestamp, whatever the tick jitter.
    expect(active.match.phaseStartedAt).toBe(session.timing.activeAt);
    expect(active.match.phaseEndsAt).toBe(session.timing.endsAt);
    expect(active.match.phaseEndsExactly).toBe(false);
  });

  it('waits for loading clients within bounds (preparingMin/Max)', () => {
    harness = new Harness({ enabled: ['fausse-couleur'] });
    const { host, players } = setupRoom(harness, 2, { rounds: 3 });
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'MINIGAME_PREPARING');
    const sessionId = host.snapshot.match.minigame!.sessionId;
    harness.advance(400);
    expect(host.phase).toBe('MINIGAME_PREPARING');
    for (const p of players) p.ok('minigame.ready', { sessionId });
    expect(host.snapshot.match.minigame!.readyPlayerIds).toHaveLength(2);
    harness.advance(harness.tickMs);
    expect(host.phase).toBe('MINIGAME_COUNTDOWN');

    // Next round: nobody sends ready → countdown after preparingMaxMs anyway.
    harness.advanceUntil(() => host.phase === 'MINIGAME_PREPARING' && host.snapshot.match.round === 2);
    const startedAt = harness.now;
    harness.advanceUntil(() => host.phase === 'MINIGAME_COUNTDOWN');
    expect(harness.now - startedAt).toBeGreaterThanOrEqual(1_000 - harness.tickMs);
  });

  it('lets the host abort a match', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 2);
    host.ok('match.start');
    harness.advance(500);
    expect(players[1]!.request('match.abort')).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    host.ok('match.abort');
    expect(host.phase).toBe('LOBBY');
    expect(host.events()).toContainEqual({ kind: 'matchAborted', reason: 'host' });
  });

  it('can auto-return to the lobby when matchResultsMs is set', () => {
    harness = new Harness({ config: { timings: { matchResultsMs: 500 } }, enabled: ['fausse-couleur'] });
    const { host, players } = setupRoom(harness, 1, { rounds: 3 });
    players.forEach((p) => p.autoplay());
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'MATCH_RESULTS');
    expect(host.snapshot.match.phaseEndsExactly).toBe(true);
    harness.advance(600);
    expect(host.phase).toBe('LOBBY');
  });

  it('snapshot revisions strictly increase', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 3, { rounds: 3 });
    players.forEach((p) => p.autoplay());
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'MATCH_RESULTS');
    const revs = host.received.flatMap((m) => (m.type === 'room.snapshot' ? [m.payload.rev] : []));
    revs.slice(1).forEach((rev, i) => expect(rev).toBeGreaterThan(revs[i]!));
  });
});
