import type { MiniGameModule } from './api';
import { boxe } from './modules/boxe';
import { corde } from './modules/corde';
import { degaine } from './modules/degaine';
import { gardien } from './modules/gardien';
import { patate } from './modules/patate';
import { ping } from './modules/ping';
import { radeau } from './modules/radeau';
import { roi } from './modules/roi';
import { sauter } from './modules/sauter';
import { soleil } from './modules/soleil';

/**
 * Server modules of the "duel" microgames (shared arena, server authority).
 * Solo / boss microgames need no server code: see shared catalog + kits/local.ts.
 * To add a duel: create modules/<id>.ts, add it below and to the shared catalog.
 */
export const DUEL_MODULES: readonly MiniGameModule[] = [patate, degaine, soleil, roi, gardien, sauter, ping, corde, radeau, boxe];
