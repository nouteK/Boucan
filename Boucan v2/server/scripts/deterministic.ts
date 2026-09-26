/**
 * Imported FIRST by the contract generator: replaces Web Crypto randomness
 * with a seeded PRNG so generated ids / codes / tokens are stable and the
 * fixtures only change when the contract or the engine behaviour changes.
 * Never import this from runtime code.
 */
import { createRng } from '@boucan/shared';

const rng = createRng(0xb0ca);
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    getRandomValues<T extends ArrayBufferView>(array: T): T {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(rng.next() * 256);
      return array;
    },
  },
});
