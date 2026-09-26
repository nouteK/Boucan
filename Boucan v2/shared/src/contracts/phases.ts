import { z } from 'zod';

/**
 * Room / match state machine. The server is the only one allowed to change
 * the phase; clients read `match.phase` from snapshots. Full description:
 * docs/architecture/GAME_LIFECYCLE.md.
 *
 *  LOBBY ─start→ MATCH_STARTING → MINIGAME_PREPARING → MINIGAME_COUNTDOWN
 *    ↑                               ↑                        ↓
 *    │                          INTERMISSION            MINIGAME_ACTIVE
 *    │                               ↑                        ↓
 *    │                               └── MINIGAME_RESULTS ← MINIGAME_ENDING
 *    │                                         ↓ (last round)
 *    └──────────── returnToLobby ──────── MATCH_RESULTS
 */
export const MATCH_PHASES = [
  'LOBBY',
  'MATCH_STARTING',
  'MINIGAME_PREPARING',
  'MINIGAME_COUNTDOWN',
  'MINIGAME_ACTIVE',
  'MINIGAME_ENDING',
  'MINIGAME_RESULTS',
  'INTERMISSION',
  'MATCH_RESULTS',
] as const;

export const MatchPhase = z.enum(MATCH_PHASES);
export type MatchPhase = z.infer<typeof MatchPhase>;

/** Legal transitions. Anything else is a server bug. */
export const PHASE_TRANSITIONS: Readonly<Record<MatchPhase, readonly MatchPhase[]>> = {
  LOBBY: ['MATCH_STARTING'],
  MATCH_STARTING: ['MINIGAME_PREPARING', 'LOBBY'],
  MINIGAME_PREPARING: ['MINIGAME_COUNTDOWN', 'LOBBY'],
  MINIGAME_COUNTDOWN: ['MINIGAME_ACTIVE', 'LOBBY'],
  MINIGAME_ACTIVE: ['MINIGAME_ENDING', 'LOBBY'],
  MINIGAME_ENDING: ['MINIGAME_RESULTS', 'LOBBY'],
  MINIGAME_RESULTS: ['INTERMISSION', 'MATCH_RESULTS', 'LOBBY'],
  INTERMISSION: ['MINIGAME_PREPARING', 'LOBBY'],
  MATCH_RESULTS: ['LOBBY'],
};

export function canTransition(from: MatchPhase, to: MatchPhase): boolean {
  return PHASE_TRANSITIONS[from].includes(to);
}

/** Phases during which a minigame session exists (`match.minigame` is not null). */
export const MINIGAME_PHASES: readonly MatchPhase[] = [
  'MINIGAME_PREPARING',
  'MINIGAME_COUNTDOWN',
  'MINIGAME_ACTIVE',
  'MINIGAME_ENDING',
  'MINIGAME_RESULTS',
];

export function isInMatch(phase: MatchPhase): boolean {
  return phase !== 'LOBBY';
}
