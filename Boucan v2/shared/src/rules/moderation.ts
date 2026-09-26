import bannedWords from './banned-words.json';

/**
 * Nickname word filter (ported from V1, where it was well tested).
 *
 * A name is folded (case, accents, look-alikes: 0→o, 1→i, @→a, $→s…) and
 * then matched with patterns where every letter may be stretched: "fuck"
 * also catches "fuuuuck", but "nigger" (double g) does not catch "Niger".
 * `substring` terms match anywhere in the letters ("f.u.c.k" is caught);
 * `word` terms only match a whole word (split on spaces, punctuation and
 * camelCase), so "Dispute", "Cocktail" or "Violette" stay allowed.
 *
 * The list lives in banned-words.json. Edit it there, then run the tests.
 */

interface CategoryList {
  substring?: string[];
  word?: string[];
  digits?: string[];
}

interface BannedWordsFile {
  categories: Record<string, CategoryList>;
  allow: string[];
}

const LOOKALIKES: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  '3': 'e',
  '€': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  $: 's',
  '7': 't',
  '8': 'b',
  '9': 'g',
};

function fold(value: string): string {
  return Array.from(
    value
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .replace(/ß/g, 'ss'),
  )
    .map((c) => LOOKALIKES[c] ?? c)
    .join('');
}

/** Letters of a name, folded. Standalone numbers ("Léa 93") are dropped; glued digits ("c0nn4rd") are read as letters. */
export function lettersOf(value: string): string {
  const withoutNumbers = value.replace(/(^|[^\p{L}])\p{N}+(?=$|[^\p{L}])/gu, '$1');
  return fold(withoutNumbers).replace(/[^a-z]/g, '');
}

/** Words of a name, folded ("GrosPD_du 93" → gros, pd, du). */
export function wordsOf(value: string): string[] {
  const words = value
    .normalize('NFKC')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}@$€!|]+/u)
    .map(lettersOf)
    .filter(Boolean);
  // "p u t e" / "f.d.p": single letters spelled out also count as one word.
  if (words.length > 1 && words.every((w) => w.length === 1)) words.push(words.join(''));
  return words;
}

function stretchable(term: string): string {
  return (term.match(/(.)\1*/g) ?? [])
    .map((run) => (run.length === 1 ? `${run}+` : `${run[0]}{${run.length},}`))
    .join('');
}

function union(terms: Iterable<string>, anchored: boolean): RegExp | null {
  const parts = [...new Set([...terms].map(lettersOf).filter(Boolean))].map(stretchable);
  if (parts.length === 0) return null;
  parts.sort((a, b) => b.length - a.length);
  const body = parts.join('|');
  return new RegExp(anchored ? `^(?:${body})$` : `(?:${body})`);
}

function compile(file: BannedWordsFile) {
  const substrings: string[] = [];
  const words: string[] = [];
  const digits: string[] = [];
  for (const list of Object.values(file.categories)) {
    substrings.push(...(list.substring ?? []));
    words.push(...(list.word ?? []));
    digits.push(...(list.digits ?? []).map((d) => d.replace(/\D/g, '')).filter(Boolean));
  }
  const allowParts = file.allow.map(lettersOf).filter(Boolean).map(stretchable);
  return {
    substring: union(substrings, false),
    word: union(words, true),
    allow: allowParts.length ? new RegExp(`(?:${allowParts.join('|')})`, 'g') : null,
    digits,
  };
}

const LIST = compile(bannedWords as BannedWordsFile);

/** True when the name contains a banned term. Never says which one. */
export function containsBannedTerm(name: string): boolean {
  const digits = name.replace(/\D/g, '');
  if (digits && LIST.digits.some((d) => digits.includes(d))) return true;

  const words = wordsOf(name);
  const letters = lettersOf(name);
  if (LIST.word && (words.some((w) => LIST.word!.test(w)) || LIST.word.test(letters))) {
    return true;
  }
  if (!LIST.substring) return false;
  const rest = LIST.allow ? letters.replace(LIST.allow, '·') : letters;
  return LIST.substring.test(rest);
}
