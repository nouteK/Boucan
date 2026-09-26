import { makeError, type ErrorCode, type ErrorPayload } from '@boucan/shared';

/** A refusal the client can understand (maps 1:1 to a contract ErrorCode). */
export class EngineError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorPayload['details'];

  constructor(code: ErrorCode, details?: ErrorPayload['details']) {
    super(code);
    this.name = 'EngineError';
    this.code = code;
    this.details = details;
  }

  toPayload(): ErrorPayload {
    return makeError(this.code, this.details);
  }
}

export function fail(code: ErrorCode, details?: ErrorPayload['details']): never {
  throw new EngineError(code, details);
}
