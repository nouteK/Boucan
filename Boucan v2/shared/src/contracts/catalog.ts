/**
 * Microgame catalog — the list of every microgame the server can pick, shared
 * by server (selection, durations, authority) and client (one implementation
 * per id). A test checks that both sides implement every entry.
 *
 * To add a microgame: add an entry here, then its client file
 * (client/src/microgames/games/<id>.ts) — and a server module only for "duel"
 * microgames (server authority). Solo and boss microgames are simulated by
 * the client and only report success / failure.
 */

/**
 * Worlds ("zones" in the contract): the painted scenes of the game.
 * Every microgame is set in one of them; a match is played in one world or
 * in all of them ("mix").
 */
export const ZONES = ['prairie', 'desert', 'tresor', 'futur', 'ville'] as const;
export type ZoneId = (typeof ZONES)[number];

/**
 * solo : everyone plays their own copy at the same time (full screen), reports success/failure.
 * boss : longer solo microgame closing a level; success = +1 life, failure = −1 life.
 *        Optional: the catalog has none today, a level then ends after its microgames.
 * duel : every alive player in the same arena, simulated by the server; losers lose a life.
 */
export type MicrogameKind = 'solo' | 'boss' | 'duel';

/**
 * How the microgame is controlled — drives the gesture hint shown with the instruction.
 * alternate = left / right in turn (screen halves or ← →); updown = two actions, up (jump) and down (duck).
 */
export type InputHint = 'tap' | 'mash' | 'hold' | 'move' | 'drag' | 'wait' | 'alternate' | 'updown';

export interface MicrogameInfo {
  id: string;
  kind: MicrogameKind;
  /** Worlds it is set in ("all" = any: then dressed in the stage world). */
  zones: readonly ZoneId[] | 'all';
  /** Duration of the playable part at tempo 1 (ms). Divided by the tempo at speed-ups. */
  durationMs: number;
  hint: InputHint;
  /** Relative pick weight (default 1). */
  weight?: number;
  /** Gentle enough for the first rounds of a match (only easy solos are picked at first). */
  easy?: boolean;
}

export const MICROGAMES: readonly MicrogameInfo[] = [
  // ── Solos ─────────────────────────────────────────────────────
  { id: 'cours', kind: 'solo', zones: ['desert'], durationMs: 4000, hint: 'mash', easy: true },
  { id: 'saute', kind: 'solo', zones: ['tresor'], durationMs: 5800, hint: 'tap', easy: true },
  { id: 'attrape', kind: 'solo', zones: ['prairie'], durationMs: 4000, hint: 'move', easy: true },
  { id: 'bouge', kind: 'solo', zones: ['prairie'], durationMs: 4000, hint: 'wait' },
  { id: 'but', kind: 'solo', zones: ['prairie'], durationMs: 4000, hint: 'tap', easy: true },
  { id: 'combo', kind: 'solo', zones: ['tresor'], durationMs: 5400, hint: 'alternate' },
  { id: 'baisse', kind: 'solo', zones: ['prairie'], durationMs: 4000, hint: 'tap', easy: true },
  { id: 'panier', kind: 'solo', zones: ['futur'], durationMs: 4200, hint: 'tap' },
  { id: 'lancer', kind: 'solo', zones: ['futur'], durationMs: 7500, hint: 'tap' },
  { id: 'esquive', kind: 'solo', zones: ['ville'], durationMs: 5600, hint: 'move' },
  { id: 'hautbas', kind: 'solo', zones: ['desert'], durationMs: 6200, hint: 'updown' },
  { id: 'rythme', kind: 'solo', zones: ['prairie'], durationMs: 7600, hint: 'tap', easy: true },
  { id: 'fusee', kind: 'solo', zones: ['desert'], durationMs: 6000, hint: 'move' },
  { id: 'laser', kind: 'solo', zones: ['futur'], durationMs: 5200, hint: 'drag' },
  { id: 'porte', kind: 'solo', zones: ['tresor'], durationMs: 5200, hint: 'tap', easy: true },
  { id: 'ampoule', kind: 'solo', zones: ['futur'], durationMs: 4800, hint: 'alternate' },
  { id: 'gobelet', kind: 'solo', zones: ['tresor'], durationMs: 7200, hint: 'tap', easy: true },
  { id: 'pasteque', kind: 'solo', zones: ['prairie'], durationMs: 5600, hint: 'tap' },
  { id: 'ballon', kind: 'solo', zones: ['desert'], durationMs: 5600, hint: 'hold', easy: true },
  { id: 'photo', kind: 'solo', zones: ['futur'], durationMs: 5200, hint: 'tap', easy: true },
  { id: 'assiettes', kind: 'solo', zones: ['desert'], durationMs: 5000, hint: 'move' },
  { id: 'caisse', kind: 'solo', zones: ['tresor'], durationMs: 4000, hint: 'mash', easy: true },
  { id: 'degage', kind: 'solo', zones: ['prairie'], durationMs: 5200, hint: 'tap' },
  { id: 'bulle', kind: 'solo', zones: ['prairie'], durationMs: 4000, hint: 'alternate' },
  { id: 'glisse', kind: 'solo', zones: ['prairie'], durationMs: 5600, hint: 'tap' },
  { id: 'plateau', kind: 'solo', zones: ['prairie'], durationMs: 5000, hint: 'tap', easy: true },
  { id: 'puree', kind: 'solo', zones: ['prairie'], durationMs: 4200, hint: 'move' },
  { id: 'soupe', kind: 'solo', zones: ['prairie'], durationMs: 4000, hint: 'tap' },
  // ── Duels (tous ensemble, serveur) ────────────────────────────
  { id: 'patate', kind: 'duel', zones: ['tresor'], durationMs: 7000, hint: 'tap' },
  { id: 'degaine', kind: 'duel', zones: ['desert'], durationMs: 6000, hint: 'wait' },
  { id: 'soleil', kind: 'duel', zones: ['prairie'], durationMs: 10000, hint: 'alternate' },
  { id: 'gardien', kind: 'duel', zones: ['ville'], durationMs: 15000, hint: 'tap' },
  { id: 'sauter', kind: 'duel', zones: ['prairie'], durationMs: 14000, hint: 'tap' },
  { id: 'ping', kind: 'duel', zones: ['futur'], durationMs: 16000, hint: 'move' },
  { id: 'pieces', kind: 'duel', zones: ['futur'], durationMs: 10500, hint: 'move' },
  { id: 'corde', kind: 'duel', zones: ['prairie'], durationMs: 7000, hint: 'alternate' },
  { id: 'radeau', kind: 'duel', zones: ['prairie'], durationMs: 9000, hint: 'alternate' },
  { id: 'boxe', kind: 'duel', zones: ['prairie'], durationMs: 9500, hint: 'tap' },
];

export function microgameInfo(id: string): MicrogameInfo | undefined {
  return MICROGAMES.find((m) => m.id === id);
}

export function inZone(info: MicrogameInfo, zone: ZoneId): boolean {
  return info.zones === 'all' || info.zones.includes(zone);
}
