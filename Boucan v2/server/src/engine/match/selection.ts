import { inZone, type MicrogameInfo, type MicrogameKind, type Rng, type ZoneId } from '@boucan/shared';

/**
 * Picks the next microgame of a given kind:
 * - from the stage zone (any zone in "mix");
 * - least played first (every microgame before any repeat);
 * - never the same twice in a row when avoidable; weighted random.
 * Falls back to any zone when the zone has no microgame of that kind.
 */
export function pickMicrogame(
  enabled: readonly MicrogameInfo[],
  kind: MicrogameKind,
  zone: ZoneId | 'mix',
  history: readonly string[],
  rng: Rng,
): MicrogameInfo | null {
  const ofKind = enabled.filter((m) => m.kind === kind);
  if (ofKind.length === 0) return null;
  const inStage = zone === 'mix' ? ofKind : ofKind.filter((m) => inZone(m, zone));
  const candidates = inStage.length > 0 ? inStage : ofKind;

  const last = history[history.length - 1];
  const notLast = candidates.filter((m) => m.id !== last);
  const pool = notLast.length > 0 ? notLast : candidates;
  const played = new Map<string, number>();
  for (const id of history) played.set(id, (played.get(id) ?? 0) + 1);
  const least = Math.min(...pool.map((m) => played.get(m.id) ?? 0));
  const fresh = pool.filter((m) => (played.get(m.id) ?? 0) === least);

  const total = fresh.reduce((sum, m) => sum + (m.weight ?? 1), 0);
  let roll = rng.next() * total;
  for (const m of fresh) {
    roll -= m.weight ?? 1;
    if (roll < 0) return m;
  }
  return fresh[fresh.length - 1]!;
}

/** Zone the microgame is dressed in: the stage zone, or one of its zones in "mix". */
export function roundZone(info: MicrogameInfo, zone: ZoneId | 'mix', rng: Rng, fallback: ZoneId): ZoneId {
  if (zone !== 'mix') return zone;
  if (info.zones === 'all') return fallback;
  return rng.pick(info.zones);
}
