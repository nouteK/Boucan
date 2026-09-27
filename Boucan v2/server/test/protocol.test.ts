import { afterEach, describe, expect, it } from 'vitest';
import { CLOSE_CODES, PROTOCOL_VERSION, ServerInfo } from '@boucan/shared';
import { Harness } from './harness';

let harness: Harness;
afterEach(() => harness?.dispose());

describe('handshake', () => {
  it('replies to hello with a valid ServerInfo', () => {
    harness = new Harness();
    const c = harness.client({ handshake: false });
    const info = ServerInfo.parse(c.ok('hello', { protocolVersion: PROTOCOL_VERSION, client: 'test/1' }));
    expect(info.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(info.microgames).toContain('cours');
    expect(info.microgames).toContain('patate');
    expect(info.serverTime).toBe(harness.now);
  });

  it('refuses any message before hello', () => {
    harness = new Harness();
    const c = harness.client({ handshake: false });
    expect(c.request('room.create', { nickname: 'Momo' })).toMatchObject({
      ok: false,
      error: { code: 'HANDSHAKE_REQUIRED', category: 'protocol' },
    });
  });

  it('refuses another protocol version and closes the connection', () => {
    harness = new Harness();
    const c = harness.client({ handshake: false });
    expect(c.request('hello', { protocolVersion: PROTOCOL_VERSION + 1 })).toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_MISMATCH', details: { serverVersion: PROTOCOL_VERSION } },
    });
    expect(c.closeCode).toBe(CLOSE_CODES.PROTOCOL_MISMATCH);
  });
});

describe('message validation', () => {
  it('answers bad JSON, bad envelopes, unknown types and bad payloads with protocol errors', () => {
    harness = new Harness();
    const c = harness.client();
    c.raw('{not json');
    c.raw(JSON.stringify({ rid: 'x' }));
    c.raw(JSON.stringify({ type: 'teleport', rid: 'r-unknown' }));
    const invalid = c.request('player.ready', { ready: 'yes' as unknown as boolean });
    const errors = c.errors();
    // Without rid → `error` push; with rid (even on a broken envelope) → `reply`.
    expect(errors.map((e) => e.code)).toEqual(['BAD_MESSAGE']);
    expect(errors[0]!.details).toEqual({ reason: 'invalidJson' });
    const broken = c.received.find((m) => m.type === 'reply' && m.rid === 'x');
    expect(broken).toMatchObject({ ok: false, error: { code: 'BAD_MESSAGE', details: { reason: 'invalidEnvelope' } } });
    const unknown = c.received.find((m) => m.type === 'reply' && m.rid === 'r-unknown');
    expect(unknown).toMatchObject({ ok: false, error: { code: 'UNKNOWN_MESSAGE', category: 'protocol' } });
    expect(invalid).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD', category: 'protocol', details: { path: 'ready' } },
    });
  });

  it('game-rule refusals are category "request"', () => {
    harness = new Harness();
    const c = harness.client();
    expect(c.request('player.ready', { ready: true })).toMatchObject({
      ok: false,
      error: { code: 'NOT_IN_ROOM', category: 'request' },
    });
  });

  it('refuses oversized messages', () => {
    harness = new Harness();
    const c = harness.client();
    c.raw(JSON.stringify({ type: 'room.create', payload: { nickname: 'x'.repeat(20_000) } }));
    expect(c.errors().at(-1)).toMatchObject({ code: 'BAD_MESSAGE', details: { reason: 'tooLarge' } });
  });

  it('closes connections that keep sending garbage', () => {
    harness = new Harness();
    const c = harness.client();
    for (let i = 0; i < 40 && c.isOpen; i++) c.raw('garbage');
    expect(c.closeCode).toBe(CLOSE_CODES.TOO_MANY_ERRORS);
  });

  it('rate-limits floods', () => {
    harness = new Harness();
    const c = harness.client();
    const replies = Array.from({ length: 100 }, () => c.request('time.sync', { t0: 1 }));
    expect(replies.filter((r) => !r.ok && r.error.code === 'RATE_LIMITED').length).toBeGreaterThan(0);
    expect(c.isOpen).toBe(true);
    harness.advance(2_000);
    expect(c.request('time.sync', { t0: 1 }).ok).toBe(true);
  });

  it('time.sync echoes t0 with the server time', () => {
    harness = new Harness();
    const c = harness.client();
    expect(c.ok('time.sync', { t0: 123.5 })).toEqual({ t0: 123.5, serverTime: harness.now });
  });

  it('refuses a second room on the same connection', () => {
    harness = new Harness();
    const c = harness.client();
    c.ok('room.create', { nickname: 'Momo' });
    expect(c.request('room.create', { nickname: 'Momo' })).toMatchObject({
      ok: false,
      error: { code: 'ALREADY_IN_ROOM' },
    });
  });
});
