/**
 * Microgame catalog — the list of every microgame the server can pick, shared
 * by server (selection, durations, authority) and client (one implementation
 * per id). A test checks that both sides implement every entry.
 *
 * To add a microgame: add an entry here, then its client file
 * (client/src/microgames/<id>.ts) — and a server module only for "duel"
 * microgames (server authority). Solo and boss microgames are simulated by
 * the client and only report success / failure.
 */

export const ZONES = ['recre', 'cantine', 'classe'] as const;
export type ZoneId = (typeof ZONES)[number];

/**
 * solo : everyone plays their own copy at the same time (full screen), reports success/failure.
 * boss : longer solo microgame closing a level; success = +1 life, failure = −1 life.
 * duel : every alive player in the same arena, simulated by the server; losers lose a life.
 */
export type MicrogameKind = 'solo' | 'boss' | 'duel';

/**
 * How the microgame is controlled — drives the gesture hint shown with the instruction.
 * alternate = left / right in turn (screen halves or ← →).
 */
export type InputHint = 'tap' | 'mash' | 'hold' | 'move' | 'drag' | 'wait' | 'alternate';

export interface MicrogameInfo {
  id: string;
  kind: MicrogameKind;
  /** Zones where it can be picked ("all" = every zone). */
  zones: readonly ZoneId[] | 'all';
  /** Duration of the playable part at tempo 1 (ms). Divided by the tempo at speed-ups. */
  durationMs: number;
  hint: InputHint;
  /** Relative pick weight (default 1). */
  weight?: number;
}

export const MICROGAMES: readonly MicrogameInfo[] = [
  // ── Cour de récré ─────────────────────────────────────────────
  { id: 'cours', kind: 'solo', zones: ['recre'], durationMs: 4000, hint: 'mash' },
  { id: 'saute', kind: 'solo', zones: ['recre'], durationMs: 4000, hint: 'tap' },
  { id: 'attrape', kind: 'solo', zones: ['recre'], durationMs: 4000, hint: 'move' },
  { id: 'stop', kind: 'solo', zones: ['recre'], durationMs: 4000, hint: 'tap' },
  { id: 'degage', kind: 'solo', zones: ['recre'], durationMs: 4000, hint: 'tap' },
  { id: 'bouge', kind: 'solo', zones: ['recre', 'classe'], durationMs: 4000, hint: 'wait' },
  { id: 'but', kind: 'solo', zones: ['recre'], durationMs: 4000, hint: 'tap' },
  { id: 'baisse', kind: 'solo', zones: ['recre'], durationMs: 4000, hint: 'tap' },
  { id: 'panier', kind: 'solo', zones: ['recre'], durationMs: 4000, hint: 'tap' },
  { id: 'caisse', kind: 'solo', zones: ['recre'], durationMs: 4000, hint: 'mash' },
  { id: 'combo', kind: 'solo', zones: ['recre'], durationMs: 4500, hint: 'alternate' },
  { id: 'glisse', kind: 'solo', zones: ['recre'], durationMs: 5600, hint: 'tap' },
  { id: 'skate', kind: 'solo', zones: ['recre'], durationMs: 5000, hint: 'move' },
  { id: 'lancer', kind: 'solo', zones: ['recre'], durationMs: 7500, hint: 'tap' },
  // ── Cantine ───────────────────────────────────────────────────
  { id: 'plateau', kind: 'solo', zones: ['cantine'], durationMs: 4000, hint: 'tap' },
  { id: 'queue', kind: 'solo', zones: ['cantine'], durationMs: 4000, hint: 'tap' },
  { id: 'puree', kind: 'solo', zones: ['cantine'], durationMs: 4000, hint: 'move' },
  { id: 'devore', kind: 'solo', zones: ['cantine'], durationMs: 4000, hint: 'mash' },
  { id: 'renverse', kind: 'solo', zones: ['cantine'], durationMs: 4000, hint: 'tap' },
  { id: 'soupe', kind: 'solo', zones: ['cantine'], durationMs: 4000, hint: 'tap' },
  { id: 'recette', kind: 'solo', zones: ['cantine'], durationMs: 7000, hint: 'tap' },
  // ── Classe ────────────────────────────────────────────────────
  { id: 'efface', kind: 'solo', zones: ['classe'], durationMs: 4000, hint: 'drag' },
  { id: 'copie', kind: 'solo', zones: ['classe'], durationMs: 4000, hint: 'hold' },
  { id: 'avion', kind: 'solo', zones: ['classe'], durationMs: 4000, hint: 'tap' },
  { id: 'main', kind: 'solo', zones: ['classe'], durationMs: 4000, hint: 'tap' },
  { id: 'taille', kind: 'solo', zones: ['classe'], durationMs: 4000, hint: 'mash' },
  { id: 'gemmes', kind: 'solo', zones: ['classe'], durationMs: 4500, hint: 'tap' },
  { id: 'bulle', kind: 'solo', zones: ['classe'], durationMs: 4000, hint: 'alternate' },
  // ── Duels (tous ensemble, serveur) ────────────────────────────
  { id: 'degaine', kind: 'duel', zones: 'all', durationMs: 6000, hint: 'wait' },
  { id: 'patate', kind: 'duel', zones: 'all', durationMs: 7000, hint: 'tap' },
  { id: 'course', kind: 'duel', zones: 'all', durationMs: 6000, hint: 'mash' },
  { id: 'cristal', kind: 'duel', zones: 'all', durationMs: 6000, hint: 'wait' },
  { id: 'boules', kind: 'duel', zones: 'all', durationMs: 6000, hint: 'tap' },
  { id: 'glace', kind: 'duel', zones: 'all', durationMs: 8000, hint: 'mash' },
  { id: 'corde', kind: 'duel', zones: 'all', durationMs: 7000, hint: 'alternate' },
  { id: 'radeau', kind: 'duel', zones: 'all', durationMs: 9000, hint: 'alternate' },
  { id: 'boxe', kind: 'duel', zones: 'all', durationMs: 9500, hint: 'tap' },
  { id: 'soleil', kind: 'duel', zones: 'all', durationMs: 10000, hint: 'alternate' },
  { id: 'roi', kind: 'duel', zones: 'all', durationMs: 9500, hint: 'alternate' },
  { id: 'gardien', kind: 'duel', zones: 'all', durationMs: 15000, hint: 'tap' },
  { id: 'noir', kind: 'duel', zones: 'all', durationMs: 9000, hint: 'move' },
  // ── Boss (fin de niveau) ──────────────────────────────────────
  { id: 'boss-recre', kind: 'boss', zones: ['recre'], durationMs: 12000, hint: 'tap' },
  { id: 'boss-cantine', kind: 'boss', zones: ['cantine'], durationMs: 12000, hint: 'tap' },
  { id: 'boss-classe', kind: 'boss', zones: ['classe'], durationMs: 12000, hint: 'tap' },
];

export function microgameInfo(id: string): MicrogameInfo | undefined {
  return MICROGAMES.find((m) => m.id === id);
}

export function inZone(info: MicrogameInfo, zone: ZoneId): boolean {
  return info.zones === 'all' || info.zones.includes(zone);
}
