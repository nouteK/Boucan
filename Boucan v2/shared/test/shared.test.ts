import { describe, expect, it } from 'vitest';
import {
  canTransition,
  checkNickname,
  CLIENT_MESSAGES,
  createRng,
  dedupeNickname,
  ERROR_CODES,
  errorCategory,
  MATCH_PHASES,
  PHASE_TRANSITIONS,
  RoomCode,
} from '../src';

describe('rng (contract: identical on every client)', () => {
  it('produces pinned values — changing them is a breaking protocol change', () => {
    const r = createRng(12345);
    expect([r.next(), r.next(), r.int(1, 100), r.seed()]).toEqual([
      0.9797282677609473, 0.3067522644996643, 49, 3513001552,
    ]);
    expect(createRng(0).shuffle([1, 2, 3, 4, 5, 6])).toEqual([6, 3, 4, 5, 1, 2]);
  });
});

describe('nickname rules', () => {
  const reason = (raw: string) => {
    const c = checkNickname(raw);
    return c.ok ? c.nickname : c.reason;
  };

  it('normalises whitespace and unicode', () => {
    expect(reason('  Léa    Dupont ')).toBe('Léa Dupont');
    expect(reason('ＺＯＥ')).toBe('ZOE'); // NFKC folds full-width letters
  });

  it('refuses with an explicit reason', () => {
    expect(reason('')).toBe('empty');
    expect(reason('   ')).toBe('empty');
    expect(reason('Z')).toBe('tooShort');
    expect(reason('abcdefghijklmnopq')).toBe('tooLong');
    expect(reason('a<b>')).toBe('invalidChars');
    expect(reason('zero​width')).toBe('invalidChars');
    expect(reason('..')).toBe('noLetter');
    expect(reason('connard')).toBe('banned');
    expect(reason('c.o.n.n.a.r.d')).toBe('banned');
  });

  it('keeps legitimate names that contain banned substrings', () => {
    for (const name of ['Dispute', 'Cocktail', 'Violette', 'Salopette', 'Léa 93']) {
      expect(checkNickname(name).ok, name).toBe(true);
    }
  });

  it('counts graphemes, not code units', () => {
    expect(reason('👨‍👩‍👧‍👦'.repeat(2))).toBe('invalidChars'); // emoji not allowed…
    expect(reason('é'.normalize('NFD').repeat(16))).toBe('é'.repeat(16)); // …but combining marks count once
  });

  it('dedupes case-insensitively within the length limit', () => {
    expect(dedupeNickname('Momo', ['momo', 'Momo 2'])).toBe('Momo 3');
    expect(dedupeNickname('abcdefghijklmnop', ['ABCDEFGHIJKLMNOP'])).toBe('abcdefghijklmn 2');
  });
});

describe('contract invariants', () => {
  it('every phase has transitions and the machine is closed', () => {
    for (const phase of MATCH_PHASES) {
      for (const next of PHASE_TRANSITIONS[phase]) expect(MATCH_PHASES).toContain(next);
    }
    expect(canTransition('LOBBY', 'STAGE_INTRO')).toBe(true);
    expect(canTransition('LOBBY', 'MICROGAME')).toBe(false);
  });

  it('every error code has a category', () => {
    for (const code of Object.keys(ERROR_CODES) as (keyof typeof ERROR_CODES)[]) {
      expect(['protocol', 'request', 'rate', 'server']).toContain(errorCategory(code));
    }
  });

  it('message catalog entries are complete', () => {
    for (const [type, spec] of Object.entries(CLIENT_MESSAGES)) {
      expect(type).toMatch(/^[a-z]+(\.[a-zA-Z]+)?$/);
      expect(spec.payload).toBeDefined();
      expect(spec.reply).toBeDefined();
    }
  });

  it('room codes are normalised on input', () => {
    expect(RoomCode.parse(' bcdf ')).toBe('BCDF');
    expect(RoomCode.safeParse('ABCD').success).toBe(false); // vowels excluded from the alphabet
  });
});
