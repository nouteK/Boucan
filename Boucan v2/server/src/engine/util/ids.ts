import { GAME_RULES, webCrypto } from '@boucan/shared';

function randomBytes(n: number): Uint8Array {
  return webCrypto().getRandomValues(new Uint8Array(n));
}

function base64url(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (const b of bytes) out += alphabet[b & 63];
  return out;
}

/** Opaque, unguessable session token (resume credential). */
export function newSessionToken(): string {
  return base64url(randomBytes(32));
}

/** Short opaque id with a readable prefix, e.g. "p_x8Kq2mZt". */
export function newId(prefix: string): string {
  return `${prefix}_${base64url(randomBytes(10))}`;
}

export function newRoomCode(): string {
  const { alphabet, length } = GAME_RULES.roomCode;
  return Array.from(randomBytes(length), (b) => alphabet[b % alphabet.length]).join('');
}
