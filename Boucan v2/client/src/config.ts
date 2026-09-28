import type { ZoneId } from '@boucan/shared';

/**
 * Everything visual that can be tuned without touching the game code.
 * Gameplay rules (lives, speed-ups, durations) are on the server
 * (server/src/config/game-config.ts); assets in public/assets/manifest.json.
 */
export const GAME = {
  title: 'BOUCAN',
  /** Logical canvas size; everything is drawn in this space and scaled to the window. */
  width: 1280,
  height: 720,
  /** Display font of the game (same as the menus). Luckiest Guy has a single weight. */
  font: '"Luckiest Guy", "Arial Black", system-ui, sans-serif',
  ink: '#161616',
  paper: '#fff8e8',
  /** Player colour by seat (0-7). */
  seatColors: ['#ff4f7b', '#3fb8ff', '#2fd07a', '#ffb020', '#a36bff', '#ff7a2f', '#20c9c0', '#f25cd8'],
  /** Default character when a player has not picked one (alternates by seat). */
  defaultCharacters: ['chien', 'renard'],
  /** Instruction ("SAUTE !") display time, in game ms at the start of each microgame. */
  instructionMs: 950,
} as const;

/** Look of a world ("zone" in the contract) around the microgames: stage intro, interlude, jingle. */
export interface ZoneTheme {
  name: string;
  /** Colour laid over the world's picture on the stage (keeps the screen and players readable). */
  tint: string;
  /** Colour of the big counter. */
  counter: string;
  /** Short jingle notes (semitones from A4) played at each interlude. */
  jingle: number[];
}

export const ZONE_THEMES: Record<ZoneId, ZoneTheme> = {
  foret: { name: 'LA FORÊT', tint: 'rgba(30,18,70,.38)', counter: '#ffe04a', jingle: [0, 3, 7, 10, 7, 3] },
  ville: { name: 'LA VILLE', tint: 'rgba(10,40,90,.28)', counter: '#ffe04a', jingle: [0, 4, 7, 12, 7, 4] },
  neige: { name: 'LA NEIGE', tint: 'rgba(90,30,70,.3)', counter: '#fff8e8', jingle: [0, 5, 9, 12, 9, 5] },
  futur: { name: 'LE FUTUR', tint: 'rgba(0,60,100,.28)', counter: '#ffe04a', jingle: [0, 2, 7, 11, 14, 11] },
};
