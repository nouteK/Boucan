import type { MiniGameModule } from './api';
import type { BotStrategy } from './bot-api';
import { courseCouloir } from './modules/course-couloir';
import { courseCouloirBot } from './modules/course-couloir/bot';
import { fausseCouleur } from './modules/fausse-couleur';
import { fausseCouleurBot } from './modules/fausse-couleur/bot';
import { interroSurprise } from './modules/interro-surprise';
import { interroSurpriseBot } from './modules/interro-surprise/bot';
import { sonnerie } from './modules/sonnerie';
import { sonnerieBot } from './modules/sonnerie/bot';

/**
 * Every server-side minigame module. To add a minigame: create
 * modules/<id>/index.ts (+ optional bot.ts) and add ONE line below.
 * To remove one: delete its line (or disable it with BOUCAN_MINIGAMES).
 */
export const MINIGAME_MODULES: readonly MiniGameModule[] = [
  sonnerie,
  interroSurprise,
  courseCouloir,
  fausseCouleur,
];

/** Dev-only simulated players, by minigame id (fallback: genericBot). */
export const MINIGAME_BOTS: Readonly<Record<string, BotStrategy>> = {
  sonnerie: sonnerieBot,
  'interro-surprise': interroSurpriseBot,
  'course-couloir': courseCouloirBot,
  'fausse-couleur': fausseCouleurBot,
};
