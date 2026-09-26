import { errorCategory, type ErrorCategory, type ErrorCode, type ErrorPayload } from '@boucan/shared';

/**
 * Every failure surfaced by the SDK. `category` says whose problem it is:
 *   network  : cannot reach the server / connection lost / request timeout
 *   protocol : client and server disagree on the contract (adapter bug or version drift)
 *   request  : refused by the game rules (normal gameplay situation, show it to the player)
 *   rate     : slow down
 *   server   : backend bug (see server logs)
 */
export type SdkErrorCategory = ErrorCategory | 'network';
export type SdkErrorCode = ErrorCode | 'NOT_CONNECTED' | 'CONNECTION_FAILED' | 'CONNECTION_LOST' | 'TIMEOUT' | 'CONTRACT_VIOLATION';

export class BoucanError extends Error {
  readonly code: SdkErrorCode;
  readonly category: SdkErrorCategory;
  readonly details: ErrorPayload['details'];
  /** Message type that caused it, when known. */
  readonly about: string | undefined;

  constructor(code: SdkErrorCode, category: SdkErrorCategory, message: string, details?: ErrorPayload['details'], about?: string) {
    super(`[${category}] ${code}: ${message}`);
    this.name = 'BoucanError';
    this.code = code;
    this.category = category;
    this.details = details;
    this.about = about;
  }

  static fromPayload(payload: ErrorPayload & { about?: string }, about?: string): BoucanError {
    return new BoucanError(payload.code, errorCategory(payload.code), payload.message, payload.details, payload.about ?? about);
  }

  static network(code: 'NOT_CONNECTED' | 'CONNECTION_FAILED' | 'CONNECTION_LOST' | 'TIMEOUT', message: string, about?: string): BoucanError {
    return new BoucanError(code, 'network', message, undefined, about);
  }
}
