import { MiniGameDefinition, MiniGameId, ScoringSpec } from '@boucan/shared';
import type { MiniGameModule } from './api';

/**
 * Holds the registered modules and which ones are playable. Validates every
 * module at boot so a broken definition fails fast instead of mid-match.
 */
export class MiniGameRegistry {
  private readonly modules = new Map<string, MiniGameModule>();
  private readonly enabledIds: ReadonlySet<string>;

  constructor(modules: readonly MiniGameModule[], enabled: readonly string[] | null = null) {
    for (const module of modules) {
      validateModule(module);
      if (this.modules.has(module.id)) throw new Error(`Duplicate minigame id "${module.id}"`);
      this.modules.set(module.id, module);
    }
    if (enabled !== null) {
      const unknown = enabled.filter((id) => !this.modules.has(id));
      if (unknown.length > 0) throw new Error(`Unknown minigame id(s) enabled: ${unknown.join(', ')}`);
    }
    this.enabledIds = new Set(enabled ?? this.modules.keys());
    if (this.enabledIds.size === 0) throw new Error('No minigame enabled');
  }

  get(id: string): MiniGameModule | undefined {
    return this.modules.get(id);
  }

  isEnabled(id: string): boolean {
    return this.enabledIds.has(id);
  }

  /** Playable modules, in registration order. */
  enabled(): MiniGameModule[] {
    return [...this.modules.values()].filter((m) => this.enabledIds.has(m.id));
  }

  /** Public definitions of the playable modules (sent in the hello reply). */
  definitions(durationScale = 1): MiniGameDefinition[] {
    return this.enabled().map((m) => toDefinition(m, durationScale));
  }
}

export function effectiveDuration(module: MiniGameModule, durationScale: number): number {
  return Math.max(100, Math.round(module.durationMs * durationScale));
}

export function toDefinition(module: MiniGameModule, durationScale = 1): MiniGameDefinition {
  return {
    id: module.id,
    authority: module.authority,
    minPlayers: module.minPlayers,
    maxPlayers: module.maxPlayers,
    durationMs: effectiveDuration(module, durationScale),
    scoring: module.scoring,
    acceptsReports: module.acceptsReports,
    acceptsInputs: module.input !== undefined,
    inputRate: module.input?.ratePerSecond ?? 0,
  };
}

function validateModule(module: MiniGameModule): void {
  const where = `minigame "${String(module.id)}"`;
  if (!MiniGameId.safeParse(module.id).success) throw new Error(`${where}: invalid id`);
  if (!ScoringSpec.safeParse(module.scoring).success) throw new Error(`${where}: invalid scoring spec`);
  if (module.minPlayers < 1 || module.maxPlayers < module.minPlayers) {
    throw new Error(`${where}: invalid player range`);
  }
  if (!(module.durationMs > 0)) throw new Error(`${where}: invalid duration`);
  if (module.input && !(module.input.ratePerSecond > 0)) throw new Error(`${where}: invalid input rate`);
  if (!MiniGameDefinition.safeParse(toDefinition(module)).success) {
    throw new Error(`${where}: definition does not match the contract`);
  }
}
