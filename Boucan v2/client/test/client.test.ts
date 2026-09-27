import { GAME_RULES, MICROGAMES } from '@boucan/shared';
import { describe, expect, it } from 'vitest';
import { checkRoomCode, errorMessage, ROOM_CODE_MESSAGES } from '../src/app/room-code';
import { loadAudioPrefs } from '../src/engine/audio';
import { MICROGAME_DEFS } from '../src/microgames';

describe('microgames', () => {
  it('the client implements exactly the shared catalog', () => {
    expect(MICROGAME_DEFS.map((d) => d.id).sort()).toEqual(MICROGAMES.map((m) => m.id).sort());
  });

  it('every microgame has a short uppercase instruction', () => {
    for (const def of MICROGAME_DEFS) {
      expect(def.verb, def.id).toBe(def.verb.toUpperCase());
      expect(def.verb.length, def.id).toBeGreaterThan(0);
      expect(def.verb.length, def.id).toBeLessThanOrEqual(24);
    }
  });
});

describe('room code (join field)', () => {
  it('accepts a valid code whatever the case, spaces or dashes', () => {
    expect(checkRoomCode('bcdf')).toEqual({ ok: true, code: 'BCDF' });
    expect(checkRoomCode(' b c-d f ')).toEqual({ ok: true, code: 'BCDF' });
  });

  it('refuses empty, wrong length and impossible characters', () => {
    expect(checkRoomCode('')).toEqual({ ok: false, reason: 'empty' });
    expect(checkRoomCode('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(checkRoomCode('BCD')).toEqual({ ok: false, reason: 'length' });
    expect(checkRoomCode('BCDFG')).toEqual({ ok: false, reason: 'length' });
    // Vowels and look-alikes are never in a code.
    expect(checkRoomCode('BOAT')).toEqual({ ok: false, reason: 'chars' });
    expect(checkRoomCode('B0C1')).toEqual({ ok: false, reason: 'chars' });
  });

  it('accepts every code the server can generate', () => {
    const { alphabet, length } = GAME_RULES.roomCode;
    for (let i = 0; i < alphabet.length; i++) {
      const code = Array.from({ length }, (_, k) => alphabet[(i + k) % alphabet.length]).join('');
      expect(checkRoomCode(code).ok, code).toBe(true);
    }
  });

  it('has a message for every refusal', () => {
    for (const reason of ['empty', 'length', 'chars'] as const) expect(ROOM_CODE_MESSAGES[reason]).toMatch(/\S/);
  });
});

describe('error messages', () => {
  it('explains join failures in plain French', () => {
    expect(errorMessage({ code: 'ROOM_NOT_FOUND' })).toMatch(/Aucune partie/);
    expect(errorMessage({ code: 'ROOM_FULL' })).toMatch(/complète/);
    expect(errorMessage({ code: 'MATCH_IN_PROGRESS' })).toMatch(/commencé/);
    expect(errorMessage({ code: 'CONNECTION_FAILED' })).toMatch(/serveur/);
    expect(errorMessage({ code: 'CONNECTION_LOST' })).toMatch(/serveur/);
  });

  it('never shows a raw code, even for unknown errors', () => {
    for (const e of [null, undefined, new Error('boom'), { code: 'SOMETHING_NEW' }, 'text']) {
      expect(errorMessage(e)).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    }
  });
});

describe('audio preferences', () => {
  const storage = (value: string | null) => ({ getItem: () => value });

  it('defaults to everything on', () => {
    expect(loadAudioPrefs(storage(null))).toEqual({ music: true, sfx: true });
    expect(loadAudioPrefs(null)).toEqual({ music: true, sfx: true });
  });

  it('restores saved choices', () => {
    expect(loadAudioPrefs(storage('{"music":false,"sfx":true}'))).toEqual({ music: false, sfx: true });
    expect(loadAudioPrefs(storage('{"music":true,"sfx":false}'))).toEqual({ music: true, sfx: false });
  });

  it('survives corrupted or unavailable storage', () => {
    expect(loadAudioPrefs(storage('{not json'))).toEqual({ music: true, sfx: true });
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(loadAudioPrefs(throwing)).toEqual({ music: true, sfx: true });
  });
});
