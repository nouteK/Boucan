import { GAME_RULES } from '../contracts/rules';
import { containsBannedTerm } from './moderation';

/**
 * Nickname rules, shared by the frontend (instant feedback) and the server
 * (final say — the server always re-validates).
 *
 * Normalisation: NFKC, whitespace collapsed, trimmed. Allowed characters:
 * letters, combining marks, digits, space and . _ - ! '
 * Refused (never silently rewritten):
 *   empty / tooShort / tooLong / invalidChars / noLetter  → NICKNAME_INVALID
 *   banned term                                          → NICKNAME_NOT_ALLOWED
 */
export type NicknameRejection = 'empty' | 'tooShort' | 'tooLong' | 'invalidChars' | 'noLetter' | 'banned';

export type NicknameCheck =
  | { ok: true; nickname: string }
  | { ok: false; reason: NicknameRejection };

const ALLOWED = /^[\p{L}\p{M}\p{N} ._!'-]+$/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** Number of user-perceived characters. */
export function graphemeLength(value: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    let n = 0;
    for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)) n++;
    return n;
  }
  return Array.from(value).length;
}

export function normalizeNickname(raw: string): string {
  return raw.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function checkNickname(raw: string): NicknameCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' };
  const nickname = normalizeNickname(raw);
  if (nickname.length === 0) return { ok: false, reason: 'empty' };
  // Checked on the raw length first so huge inputs are refused before any costly work.
  if (nickname.length > GAME_RULES.nickname.maxLength * 4) return { ok: false, reason: 'tooLong' };
  const length = graphemeLength(nickname);
  if (length > GAME_RULES.nickname.maxLength) return { ok: false, reason: 'tooLong' };
  if (length < GAME_RULES.nickname.minLength) return { ok: false, reason: 'tooShort' };
  if (!ALLOWED.test(nickname)) return { ok: false, reason: 'invalidChars' };
  if (!HAS_LETTER_OR_DIGIT.test(nickname)) return { ok: false, reason: 'noLetter' };
  if (containsBannedTerm(raw) || containsBannedTerm(nickname)) return { ok: false, reason: 'banned' };
  return { ok: true, nickname };
}

/** Appends a number when a name is taken in the room ("Léa" → "Léa 2"). Case-insensitive. */
export function dedupeNickname(nickname: string, taken: readonly string[]): string {
  const lowered = new Set(taken.map((n) => n.toLocaleLowerCase()));
  if (!lowered.has(nickname.toLocaleLowerCase())) return nickname;
  for (let i = 2; i < 100; i++) {
    const suffix = ` ${i}`;
    const base = Array.from(nickname)
      .slice(0, GAME_RULES.nickname.maxLength - suffix.length)
      .join('')
      .trim();
    const candidate = `${base}${suffix}`;
    if (!lowered.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return nickname;
}
