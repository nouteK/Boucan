import { GAME_RULES } from '@boucan/shared';

export type RoomCodeCheck = { ok: true; code: string } | { ok: false; reason: 'empty' | 'length' | 'chars' };

/**
 * Checks a typed room code before asking the server (instant feedback).
 * Case, spaces and dashes are ignored; the alphabet has no vowels and no
 * look-alikes (see GAME_RULES.roomCode).
 */
export function checkRoomCode(input: string): RoomCodeCheck {
  const code = input.replace(/[\s-]+/g, '').toUpperCase();
  const { alphabet, length } = GAME_RULES.roomCode;
  if (code.length === 0) return { ok: false, reason: 'empty' };
  if (code.length !== length) return { ok: false, reason: 'length' };
  if ([...code].some((c) => !alphabet.includes(c))) return { ok: false, reason: 'chars' };
  return { ok: true, code };
}

export const ROOM_CODE_MESSAGES: Record<Exclude<RoomCodeCheck, { ok: true }>['reason'], string> = {
  empty: 'Entre le code de la partie.',
  length: `Le code fait ${GAME_RULES.roomCode.length} caractères.`,
  chars: 'Ce code n’existe pas. Vérifie les lettres.',
};

/** Player-facing message for an SDK / server error. */
export function errorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case 'ROOM_NOT_FOUND':
      return 'Aucune partie avec ce code.';
    case 'ROOM_FULL':
      return 'Cette partie est complète (8 joueurs).';
    case 'MATCH_IN_PROGRESS':
      return 'Cette partie a déjà commencé.';
    case 'SERVER_FULL':
    case 'RATE_LIMITED':
      return 'Le serveur est occupé, réessaie dans un instant.';
    case 'CONNECTION_FAILED':
    case 'CONNECTION_LOST':
    case 'NOT_CONNECTED':
    case 'TIMEOUT':
      return 'Impossible de joindre le serveur. Vérifie ta connexion.';
    case 'PROTOCOL_MISMATCH':
      return 'Le jeu a été mis à jour : recharge la page.';
    case 'NICKNAME_NOT_ALLOWED':
      return "Ce pseudo n'est pas autorisé.";
    case 'NICKNAME_INVALID':
      return 'Pseudo invalide (2 à 16 caractères).';
    case 'NOT_ALL_READY':
      return "Tout le monde n'est pas prêt.";
    default:
      return 'Oups, quelque chose a coincé. Réessaie.';
  }
}
