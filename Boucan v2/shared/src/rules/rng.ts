/**
 * Deterministic PRNG (mulberry32) shared by server and clients.
 *
 * Part of the contract: a minigame announced with `seed` S must produce the
 * same sequence on every client and on the server. Do not change the
 * algorithm without bumping PROTOCOL_VERSION (tests pin known outputs).
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  /** Derives an independent seed (e.g. one per sub-system) from this generator. */
  seed(): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('Rng.pick on empty list');
      return items[Math.floor(next() * items.length)]!;
    },
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    seed: () => Math.floor(next() * 0x100000000) >>> 0,
  };
}

/** Non-deterministic 32-bit seed (crypto quality where available). */
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  webCrypto().getRandomValues(buf);
  return buf[0]!;
}

/** Web Crypto, available in browsers and Node ≥ 19 without imports. */
export function webCrypto(): { getRandomValues<T extends ArrayBufferView>(array: T): T } {
  const c = (globalThis as { crypto?: { getRandomValues<T extends ArrayBufferView>(a: T): T } }).crypto;
  if (!c) throw new Error('Web Crypto API not available');
  return c;
}
