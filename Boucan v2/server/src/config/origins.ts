/**
 * ALLOWED_ORIGINS: which browser pages may open the WebSocket.
 *
 * An entry is an exact origin (`https://jeu.exemple.fr`) or a pattern where
 * `*` stands for exactly ONE hostname label (`https://*.trycloudflare.com`
 * matches `https://abc-def.trycloudflare.com`, not `https://a.b.trycloudflare.com`).
 * Patterns exist for Cloudflare quick tunnels: their random hostname changes
 * each time the tunnel restarts, and an exact origin would then lock every
 * player out while the page itself still loads.
 */

/** scheme://host[:port], host labels may be `*`; IPv6 literal allowed. No path. */
const ORIGIN_ENTRY = /^https?:\/\/(\[[0-9a-f:.]+\]|(\*|[a-z0-9-]+)(\.(\*|[a-z0-9-]+))*)(:\d{1,5})?$/i;

/** Lower-cased, without trailing slash (browsers send origins without one). */
export function normalizeOriginEntry(entry: string): string {
  return entry.trim().replace(/\/+$/, '').toLowerCase();
}

export function isValidOriginEntry(entry: string): boolean {
  return ORIGIN_ENTRY.test(normalizeOriginEntry(entry));
}

export type OriginCheck = (origin: string | undefined) => boolean;

/** null = every origin accepted (no Origin header included). */
export function originMatcher(allowed: readonly string[] | null): OriginCheck {
  if (allowed === null) return () => true;
  const exact = new Set<string>();
  const patterns: RegExp[] = [];
  for (const raw of allowed) {
    const entry = normalizeOriginEntry(raw);
    if (!entry.includes('*')) {
      exact.add(entry);
      continue;
    }
    const source = entry
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[a-z0-9-]+');
    patterns.push(new RegExp(`^${source}$`));
  }
  return (origin) => {
    if (origin === undefined) return false;
    const o = origin.toLowerCase();
    return exact.has(o) || patterns.some((p) => p.test(o));
  };
}
