import { z } from 'zod';

/**
 * Match state machine (server-driven). One value tells the client what to show.
 *
 *  LOBBY ──start──► STAGE_INTRO ──► INTERLUDE ──► MICROGAME ──► VERDICT ──┐
 *    ▲                                  ▲                                   │
 *    │                                  └──────────── next microgame ◄──────┘
 *    └──── returnToLobby ◄──── STAGE_RESULTS ◄──── (one survivor / last level done)
 *
 * INTERLUDE : the stage scene with every player; the counter, "PLUS VITE !",
 *             "BOSS !" banners; the next microgame is already announced
 *             (id, seed, activeAt) so clients start it exactly on time.
 * MICROGAME : everyone plays (solo/boss: own copy; duel: shared arena).
 * VERDICT   : who succeeded / failed, lives lost, eliminations.
 */
export const MATCH_PHASES = [
  'LOBBY',
  'STAGE_INTRO',
  'INTERLUDE',
  'MICROGAME',
  'VERDICT',
  'STAGE_RESULTS',
] as const;

export const MatchPhase = z.enum(MATCH_PHASES);
export type MatchPhase = z.infer<typeof MatchPhase>;

export const PHASE_TRANSITIONS: Readonly<Record<MatchPhase, readonly MatchPhase[]>> = {
  LOBBY: ['STAGE_INTRO'],
  STAGE_INTRO: ['INTERLUDE', 'LOBBY'],
  INTERLUDE: ['MICROGAME', 'LOBBY'],
  MICROGAME: ['VERDICT', 'LOBBY'],
  VERDICT: ['INTERLUDE', 'STAGE_RESULTS', 'LOBBY'],
  STAGE_RESULTS: ['LOBBY'],
};

export function canTransition(from: MatchPhase, to: MatchPhase): boolean {
  return PHASE_TRANSITIONS[from].includes(to);
}
