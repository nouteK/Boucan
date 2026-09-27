import type { MiniGameModule } from './api';
import { boules } from './modules/boules';
import { boxe } from './modules/boxe';
import { corde } from './modules/corde';
import { course } from './modules/course';
import { cristal } from './modules/cristal';
import { degaine } from './modules/degaine';
import { gardien } from './modules/gardien';
import { glace } from './modules/glace';
import { noir } from './modules/noir';
import { patate } from './modules/patate';
import { radeau } from './modules/radeau';
import { roi } from './modules/roi';
import { soleil } from './modules/soleil';

/**
 * Server modules of the "duel" microgames (shared arena, server authority).
 * Solo / boss microgames need no server code: see shared catalog + kits/local.ts.
 * To add a duel: create modules/<id>.ts, add it below and to the shared catalog.
 */
export const DUEL_MODULES: readonly MiniGameModule[] = [
  degaine,
  patate,
  course,
  cristal,
  boules,
  glace,
  corde,
  radeau,
  boxe,
  soleil,
  roi,
  gardien,
  noir,
];
