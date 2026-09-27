import { MICROGAMES, type MicrogameInfo } from '@boucan/shared';
import type { MiniGameModule } from './api';
import { localModule } from './kits/local';

/**
 * Maps the shared catalog to server modules: solo/boss entries get the
 * generic local module, duel entries must have a registered server module.
 * Validated at boot so a missing module fails fast, not mid-match.
 */
export class MiniGameRegistry {
  private readonly modules = new Map<string, MiniGameModule>();
  private readonly infos: MicrogameInfo[];

  constructor(
    duelModules: readonly MiniGameModule[],
    enabled: readonly string[] | null = null,
    catalog: readonly MicrogameInfo[] = MICROGAMES,
  ) {
    const duels = new Map(duelModules.map((m) => [m.id, m]));
    if (enabled !== null) {
      const unknown = enabled.filter((id) => !catalog.some((m) => m.id === id));
      if (unknown.length > 0) throw new Error(`Unknown microgame id(s) enabled: ${unknown.join(', ')}`);
    }
    this.infos = catalog.filter((m) => enabled === null || enabled.includes(m.id));
    for (const info of this.infos) {
      if (info.kind === 'duel') {
        const module = duels.get(info.id);
        if (!module) throw new Error(`Duel "${info.id}" has no server module`);
        this.modules.set(info.id, module);
      } else {
        this.modules.set(info.id, localModule(info));
      }
    }
    if (!this.infos.some((m) => m.kind === 'solo')) throw new Error('At least one solo microgame must be enabled');
  }

  module(id: string): MiniGameModule | undefined {
    return this.modules.get(id);
  }

  /** Enabled catalog entries. */
  enabled(): readonly MicrogameInfo[] {
    return this.infos;
  }

  ids(): string[] {
    return this.infos.map((m) => m.id);
  }
}
