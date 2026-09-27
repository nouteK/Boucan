import { afterEach, describe, expect, it } from 'vitest';
import { CLOSE_CODES } from '@boucan/shared';
import { DEFAULT_GAME_CONFIG } from '../src/config/game-config';
import { Harness, setupRoom } from './harness';

let harness: Harness;
afterEach(() => harness?.dispose());

const { lobbyGraceMs, matchGraceMs, hostTransferMs, emptyRoomTtlMs } = DEFAULT_GAME_CONFIG.reconnect;

describe('lobby disconnections', () => {
  it('keeps the seat during the grace period and resumes with the token', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 2);
    const guest = players[1]!;
    const token = guest.sessionToken!;
    guest.close();
    expect(host.snapshot.lobby.players[1]!.connection).toBe('disconnected');
    expect(host.events()).toContainEqual({ kind: 'playerDisconnected', playerId: guest.playerId });
    harness.advance(lobbyGraceMs - 1_000);
    const back = harness.client();
    back.ok('room.resume', { sessionToken: token });
    expect(back.playerId).toBe(guest.playerId);
    expect(host.snapshot.lobby.players[1]).toMatchObject({ connection: 'connected', seat: 1, ready: true });
  });

  it('removes the player after the grace period; the token then fails', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 2);
    const guest = players[1]!;
    const token = guest.sessionToken!;
    guest.close();
    harness.advance(lobbyGraceMs + 100);
    expect(host.snapshot.lobby.players).toHaveLength(1);
    expect(host.events()).toContainEqual({ kind: 'playerLeft', playerId: guest.playerId, reason: 'timeout' });
    expect(harness.client().request('room.resume', { sessionToken: token })).toMatchObject({
      ok: false,
      error: { code: 'SESSION_NOT_FOUND' },
    });
  });

  it('frees disconnected seats when the match starts', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 3);
    players[2]!.close();
    host.ok('match.start');
    expect(host.snapshot.lobby.players).toHaveLength(2);
  });

  it('a second connection with the same token replaces the first', () => {
    harness = new Harness();
    const { players } = setupRoom(harness, 2);
    const guest = players[1]!;
    const tab2 = harness.client();
    tab2.ok('room.resume', { sessionToken: guest.sessionToken! });
    expect(guest.received.at(-1)).toEqual({ type: 'session.ended', payload: { reason: 'replaced' } });
    expect(guest.closeCode).toBe(CLOSE_CODES.SESSION_REPLACED);
    expect(tab2.snapshot.lobby.players[1]!.connection).toBe('connected');
  });

  it('kicked players get session.ended and lose their seat', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 3);
    const target = players[2]!;
    expect(players[1]!.request('room.kick', { playerId: target.playerId! })).toMatchObject({
      ok: false,
      error: { code: 'NOT_HOST' },
    });
    host.ok('room.kick', { playerId: target.playerId! });
    expect(target.received.at(-1)).toEqual({ type: 'session.ended', payload: { reason: 'kicked' } });
    expect(host.snapshot.lobby.players).toHaveLength(2);
    expect(target.request('player.ready', { ready: true })).toMatchObject({ ok: false, error: { code: 'NOT_IN_ROOM' } });
  });

  it('leave frees the seat for someone else', () => {
    harness = new Harness();
    const { host, players, code } = setupRoom(harness, 2);
    players[1]!.ok('room.leave');
    expect(host.snapshot.lobby.players).toHaveLength(1);
    const newcomer = harness.client();
    newcomer.ok('room.join', { code, nickname: 'Nouveau' });
    expect(newcomer.snapshot.lobby.players[1]!.seat).toBe(1);
  });
});

describe('host', () => {
  it('passes the host role immediately when the host leaves', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 3);
    const next = players[1]!;
    host.ok('room.leave');
    expect(next.snapshot.lobby.hostId).toBe(next.playerId);
    expect(next.events()).toContainEqual({ kind: 'hostChanged', hostId: next.playerId, previousHostId: host.playerId });
  });

  it('passes the host role after hostTransferMs when the host disconnects', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 2);
    const next = players[1]!;
    host.close();
    harness.advance(hostTransferMs - 500);
    expect(next.snapshot.lobby.hostId).toBe(host.playerId);
    harness.advance(1_000);
    expect(next.snapshot.lobby.hostId).toBe(next.playerId);
    next.ok('match.start');
  });

  it('host disconnection mid-match does not stop the match', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 3, { config: { length: 'court', lives: 3 } });
    players.forEach((p) => p.autoplay('random'));
    host.ok('match.start');
    harness.advance(500);
    host.close();
    const other = players[1]!;
    harness.advanceUntil(() => other.phase === 'STAGE_RESULTS');
    expect(other.snapshot.lobby.hostId).toBe(other.playerId);
    other.ok('match.returnToLobby');
  });
});

describe('match disconnections', () => {
  it('a player disconnected during a microgame is dnf (a life lost), the match goes on, they can come back', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 3);
    players.forEach((p) => p.autoplay('win'));
    const quitter = players[2]!;
    const token = quitter.sessionToken!;
    host.ok('match.start');
    harness.advanceUntil(() => host.phase === 'MICROGAME');
    quitter.close();
    harness.advanceUntil(() => host.phase === 'VERDICT');
    expect(host.snapshot.match.verdict!.entries.find((e) => e.playerId === quitter.playerId)).toMatchObject({
      outcome: 'dnf',
      livesDelta: -1,
    });
    const back = harness.client().autoplay('win');
    back.ok('room.resume', { sessionToken: token });
    harness.advanceUntil(() => host.phase === 'VERDICT' && host.snapshot.match.counter === 3);
    expect(host.snapshot.match.verdict!.entries.find((e) => e.playerId === quitter.playerId)!.outcome).not.toBe('dnf');
    expect(back.me()).toMatchObject({ lives: 3, alive: true });
  });

  it('a player gone for good forfeits: marked left, eliminated, kept in the ranking, purged in the lobby', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 2, { bots: 1 });
    players.forEach((p) => p.autoplay('win'));
    host.ok('match.start');
    const quitter = players[1]!;
    harness.advanceUntil(() => host.phase === 'MICROGAME');
    quitter.close();
    harness.advance(matchGraceMs + 100);
    expect(host.snapshot.lobby.players[1]).toMatchObject({ connection: 'left', alive: false });
    harness.advanceUntil(() => host.phase === 'STAGE_RESULTS');
    expect(host.snapshot.match.final!.entries.map((e) => e.playerId)).toContain(quitter.playerId);
    host.ok('match.returnToLobby');
    expect(host.snapshot.lobby.players.map((p) => p.id)).not.toContain(quitter.playerId);
  });

  it('an explicit leave mid-match marks the player left and eliminated immediately', () => {
    harness = new Harness();
    const { host, players } = setupRoom(harness, 3, { config: { length: 'court' } });
    players.forEach((p) => p.autoplay('random'));
    host.ok('match.start');
    harness.advance(300);
    players[2]!.ok('room.leave');
    expect(host.snapshot.lobby.players[2]).toMatchObject({ connection: 'left', alive: false, lives: 0 });
    harness.advanceUntil(() => host.phase === 'STAGE_RESULTS');
  });

  it('a match with nobody connected is closed after emptyRoomTtlMs', () => {
    harness = new Harness();
    const { host, players, code } = setupRoom(harness, 2);
    host.ok('match.start');
    players.forEach((p) => p.close());
    harness.advance(emptyRoomTtlMs - 1_000);
    expect(harness.gateway.manager.getRoom(code)).toBeDefined();
    harness.advance(2_000);
    expect(harness.gateway.manager.getRoom(code)).toBeUndefined();
  });

  it('an empty lobby is closed once the lobby grace has removed everyone', () => {
    harness = new Harness();
    const { players, code } = setupRoom(harness, 2);
    players.forEach((p) => p.close());
    harness.advance(lobbyGraceMs + 100);
    expect(harness.gateway.manager.getRoom(code)).toBeUndefined();
  });

  it('a solo player who leaves mid-match aborts nothing but the room is cleaned up', () => {
    harness = new Harness();
    const { host, code } = setupRoom(harness, 1);
    host.ok('match.start');
    host.ok('room.leave');
    harness.advance(1_000);
    expect(harness.gateway.manager.getRoom(code)).toBeUndefined();
  });
});
