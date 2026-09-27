import type { ZoneId } from '@boucan/shared';

/**
 * Everything visual that can be tuned without touching the game code.
 * Gameplay rules (lives, speed-ups, durations) are on the server
 * (server/src/config/game-config.ts); assets in public/assets/manifest.json.
 */
export const GAME = {
  title: 'BOUCAN',
  subtitle: "L'école en folie · micro-jeux entre potes",
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

export interface ZoneTheme {
  name: string;
  /** Main background colour of the interlude. */
  bg: string;
  /** Secondary colour (stripes, floor). */
  accent: string;
  /** Colour of the big counter. */
  counter: string;
  /** Short jingle notes (semitones from A4) played at each interlude. */
  jingle: number[];
}

export const ZONE_THEMES: Record<ZoneId, ZoneTheme> = {
  recre: { name: 'COUR DE RÉCRÉ', bg: '#2fb8ff', accent: '#2fd07a', counter: '#ffe04a', jingle: [0, 4, 7, 12, 7, 4] },
  cantine: { name: 'CANTINE', bg: '#ff8a3d', accent: '#ffe6a8', counter: '#fff8e8', jingle: [0, 3, 7, 10, 7, 3] },
  classe: { name: 'CLASSE', bg: '#8a5cff', accent: '#2e5b3f', counter: '#ffe04a', jingle: [0, 5, 9, 12, 9, 5] },
};
