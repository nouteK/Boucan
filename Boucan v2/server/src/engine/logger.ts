/**
 * Logging interface used by the engine. The engine never writes to the
 * console itself: the host (Node server, in-browser local server, tests)
 * injects an implementation. Context fields make every line traceable to a
 * room / match / round / minigame / player.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  room?: string;
  match?: string;
  round?: number;
  minigame?: string;
  session?: string;
  player?: string;
  conn?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext, error?: unknown): void;
  /** Returns a logger that adds `context` to every line. */
  child(context: LogContext): Logger;
}

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLogger;
  },
};
