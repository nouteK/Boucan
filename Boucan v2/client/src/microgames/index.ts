import type { MicrogameDef } from './api';
import attrape from './games/attrape';
import avion from './games/avion';
import baisse from './games/baisse';
import bossCantine from './games/boss-cantine';
import bossClasse from './games/boss-classe';
import bossRecre from './games/boss-recre';
import bouge from './games/bouge';
import boules from './games/boules';
import boxe from './games/boxe';
import bulle from './games/bulle';
import but from './games/but';
import caisse from './games/caisse';
import combo from './games/combo';
import copie from './games/copie';
import corde from './games/corde';
import cours from './games/cours';
import course from './games/course';
import cristal from './games/cristal';
import degage from './games/degage';
import degaine from './games/degaine';
import devore from './games/devore';
import efface from './games/efface';
import gardien from './games/gardien';
import gemmes from './games/gemmes';
import glace from './games/glace';
import glisse from './games/glisse';
import lancer from './games/lancer';
import main from './games/main';
import noir from './games/noir';
import panier from './games/panier';
import patate from './games/patate';
import plateau from './games/plateau';
import puree from './games/puree';
import queue from './games/queue';
import radeau from './games/radeau';
import recette from './games/recette';
import renverse from './games/renverse';
import roi from './games/roi';
import saute from './games/saute';
import skate from './games/skate';
import soleil from './games/soleil';
import soupe from './games/soupe';
import stop from './games/stop';
import taille from './games/taille';

/**
 * Every client microgame. To add one: create games/<id>.ts, import it here,
 * and add its entry to the shared catalog (shared/src/contracts/catalog.ts).
 * A test checks that the two lists match.
 */
export const MICROGAME_DEFS: readonly MicrogameDef[] = [
  cours, saute, attrape, stop, degage, bouge, but, baisse, panier, caisse, combo, glisse, skate, lancer,
  plateau, queue, puree, devore, renverse, soupe, recette,
  efface, copie, avion, main, taille, gemmes, bulle,
  degaine, patate, course, cristal, boules, glace, corde, radeau, boxe, soleil, roi, gardien, noir,
  bossRecre, bossCantine, bossClasse,
];

const byId = new Map(MICROGAME_DEFS.map((d) => [d.id, d]));

export function microgameDef(id: string): MicrogameDef | undefined {
  return byId.get(id);
}
