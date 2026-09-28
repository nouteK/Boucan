import type { JsonValue, MicrogameInfo, Rng, TypedPayload } from '@boucan/shared';
import type { SfxName } from '../engine/audio';
import type { GameInput } from '../engine/input';

/**
 * Client side of a microgame. One file per microgame in this folder, one line
 * in ./index.ts, one entry in the shared catalog (shared/src/contracts/catalog.ts).
 *
 * Time is GAME time: it runs `tempo` times faster than real time after each
 * "PLUS VITE !", so a microgame is designed once at normal speed and simply
 * plays faster. `ctx.duration` is the playable length in game ms.
 *
 * Solo / boss: call ctx.win() or ctx.lose() as soon as the outcome is known
 * (the scene keeps playing until the fuse burns out, like in WarioWare).
 * Duel: draw the server state (onState / onEvent) and send inputs (ctx.send).
 */

export interface MgPlayer {
  id: string;
  nickname: string;
  characterId: string | null;
  color: string;
  isMe: boolean;
  alive: boolean;
}

export interface MgContext {
  readonly info: MicrogameInfo;
  /** Deterministic RNG from the round seed: every player gets the same situation. */
  readonly rng: Rng;
  readonly seed: number;
  /** 1 → 3: difficulty, rises at the end of each level. */
  readonly level: number;
  readonly tempo: number;
  /** Playable duration in game ms. */
  readonly duration: number;
  readonly me: MgPlayer;
  /** Participants (duels: the players in the arena). */
  readonly players: readonly MgPlayer[];
  readonly outcome: 'success' | 'failure' | null;
  win(): void;
  lose(): void;
  send(input: JsonValue): void;
  sfx(name: SfxName): void;
  /** Shakes the screen for `ms` real milliseconds. */
  shake(ms: number): void;
  /** Real server time of the start of play (duels align on server timestamps). */
  readonly activeAt: number;
  serverNow(): number;
  /** The player uses a touch screen right now: show on-screen buttons (see pad.ts) rather than key hints. */
  readonly touch: boolean;
}

export interface MgInstance {
  update(dt: number, t: number): void;
  /** Draws the whole 1280×720 scene into the current context. */
  draw(t: number, dt: number): void;
  input?(e: GameInput): void;
  /** Outcome when the time is up and nothing was decided (default: failure). */
  timeout?(): 'success' | 'failure';
  onState?(state: unknown, serverTime: number): void;
  onEvent?(event: TypedPayload, serverTime: number): void;
  /**
   * Frees what the microgame allocated outside its closure (offscreen canvas…).
   * Called once when the next round replaces it or the match view closes.
   * Microgames never add DOM listeners or timers: input and time come from the engine.
   */
  dispose?(): void;
}

export interface MicrogameDef {
  id: string;
  /** Instruction shown at start ("SAUTE !"). Short, imperative, uppercase. */
  verb: string;
  create(ctx: MgContext): MgInstance;
}

export function defineMicrogame(def: MicrogameDef): MicrogameDef {
  return def;
}
