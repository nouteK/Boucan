import { createRng, microgameInfo, type JsonValue } from '@boucan/shared';
import type { ArrowKey, GameInput } from '../src/engine/input';
import type { MgContext, MgInstance, MgPlayer } from '../src/microgames/api';
import { MICROGAME_DEFS } from '../src/microgames';

/** Test helpers shared by the microgame tests (fake canvas, players, random input). */

/** A 2D context that accepts every call (no canvas in Node). */
export function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop() {} };
  const state: Record<string | symbol, unknown> = { canvas: { width: 1280, height: 720 }, globalAlpha: 1, lineWidth: 1 };
  return new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return (s: string) => ({ width: String(s).length * 20 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => gradient;
      return () => undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

export const PLAYERS: MgPlayer[] = [
  { id: 'p1', nickname: 'Moi', characterId: 'chien', color: '#ff4f7b', isMe: true, alive: true },
  { id: 'p2', nickname: 'Bip', characterId: 'renard', color: '#3fb8ff', isMe: false, alive: true },
  { id: 'p3', nickname: 'Zoé', characterId: null, color: '#2fd07a', isMe: false, alive: true },
  { id: 'p4', nickname: 'Tic', characterId: 'chien', color: '#ffb020', isMe: false, alive: true },
];

export interface Harnessed {
  ctx: MgContext;
  instance: MgInstance;
  outcome(): 'success' | 'failure' | null;
  sent: JsonValue[];
  clock: { t: number };
}

export function harness(id: string, seed: number, level: number, players = PLAYERS, touch = false): Harnessed {
  const info = microgameInfo(id)!;
  const def = MICROGAME_DEFS.find((d) => d.id === id)!;
  let outcome: 'success' | 'failure' | null = null;
  const sent: JsonValue[] = [];
  const clock = { t: 0 };
  const ctx: MgContext = {
    info,
    rng: createRng(seed),
    seed,
    level,
    tempo: 1,
    duration: info.durationMs,
    me: players[0]!,
    players,
    get outcome() {
      return outcome;
    },
    win: () => void (outcome ??= 'success'),
    lose: () => void (outcome ??= 'failure'),
    send: (input) => void sent.push(input),
    sfx: () => {},
    shake: () => {},
    activeAt: 0,
    serverNow: () => clock.t,
    touch,
  };
  return { ctx, instance: def.create(ctx), outcome: () => outcome, sent, clock };
}

const KEYS: ArrowKey[] = ['left', 'right', 'up', 'down'];

export function randomInput(r: () => number): GameInput {
  const x = r() * 1280;
  const y = r() * 720;
  const key = KEYS[Math.floor(r() * 4)]!;
  const k = r();
  if (k < 0.35) return { type: 'down', x, y };
  if (k < 0.5) return { type: 'up', x, y };
  if (k < 0.6) return { type: 'down', x: null, y: null };
  if (k < 0.8) return { type: 'key', key, repeat: r() < 0.2 };
  if (k < 0.9) return { type: 'keyup', key };
  return { type: 'move', x, y, pressed: r() < 0.5 };
}
