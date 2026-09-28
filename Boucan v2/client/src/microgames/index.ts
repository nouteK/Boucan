import type { MicrogameDef } from './api';
import attrape from './games/attrape';
import baisse from './games/baisse';
import bouge from './games/bouge';
import boxe from './games/boxe';
import bulle from './games/bulle';
import but from './games/but';
import caisse from './games/caisse';
import combo from './games/combo';
import corde from './games/corde';
import cours from './games/cours';
import degage from './games/degage';
import degaine from './games/degaine';
import esquive from './games/esquive';
import fusee from './games/fusee';
import gardien from './games/gardien';
import glisse from './games/glisse';
import hautbas from './games/hautbas';
import lancer from './games/lancer';
import laser from './games/laser';
import panier from './games/panier';
import patate from './games/patate';
import ping from './games/ping';
import plateau from './games/plateau';
import puree from './games/puree';
import radeau from './games/radeau';
import roi from './games/roi';
import rythme from './games/rythme';
import saute from './games/saute';
import sauter from './games/sauter';
import skate from './games/skate';
import soleil from './games/soleil';
import soupe from './games/soupe';

/**
 * Every client microgame. To add one: create games/<id>.ts, import it here,
 * and add its entry to the shared catalog (shared/src/contracts/catalog.ts).
 * A test checks that the two lists match.
 */
export const MICROGAME_DEFS: readonly MicrogameDef[] = [
  cours, saute, attrape, bouge, but, combo, baisse, panier, lancer, skate, esquive,
  hautbas, rythme, fusee, laser, caisse, degage, bulle, glisse, plateau, puree, soupe,
  patate, degaine, soleil, roi, gardien, sauter, ping, corde, radeau, boxe,
];

const byId = new Map(MICROGAME_DEFS.map((d) => [d.id, d]));

export function microgameDef(id: string): MicrogameDef | undefined {
  return byId.get(id);
}
