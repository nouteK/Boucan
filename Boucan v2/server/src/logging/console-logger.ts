import type { LogContext, Logger, LogLevel } from '../engine/logger';

export type LogFormat = 'pretty' | 'json';

const ORDER: Record<LogLevel | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const TAG: Record<LogLevel, string> = { debug: 'DEBUG', info: 'INFO ', warn: 'WARN ', error: 'ERROR' };
/** Context keys printed first, in this order, in pretty mode. */
const KEY_ORDER = ['room', 'match', 'round', 'minigame', 'session', 'player', 'conn'];

/**
 * Logger for Node. `pretty` for humans (dev), `json` = one object per line
 * (production log collectors). Errors go to stderr.
 */
export function createConsoleLogger(options: { level: LogLevel | 'silent'; format: LogFormat }): Logger {
  const min = ORDER[options.level];

  function write(level: LogLevel, message: string, context: LogContext, error?: unknown): void {
    if (ORDER[level] < min) return;
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    if (options.format === 'json') {
      const line: Record<string, unknown> = { t: new Date().toISOString(), level, msg: message, ...context };
      if (error !== undefined) line.err = error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
      stream.write(`${JSON.stringify(line)}\n`);
      return;
    }
    const time = new Date().toISOString().slice(11, 23);
    const keys = Object.keys(context).sort((a, b) => rank(a) - rank(b));
    const ctx = keys
      .filter((k) => context[k] !== undefined)
      .map((k) => `${k}=${format(context[k])}`)
      .join(' ');
    stream.write(`${time} ${TAG[level]} ${message}${ctx ? `  ${ctx}` : ''}\n`);
    if (error !== undefined) stream.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  }

  function make(base: LogContext): Logger {
    return {
      debug: (m, c) => write('debug', m, { ...base, ...c }),
      info: (m, c) => write('info', m, { ...base, ...c }),
      warn: (m, c) => write('warn', m, { ...base, ...c }),
      error: (m, c, e) => write('error', m, { ...base, ...c }, e),
      child: (c) => make({ ...base, ...c }),
    };
  }
  return make({});
}

function rank(key: string): number {
  const i = KEY_ORDER.indexOf(key);
  return i === -1 ? KEY_ORDER.length : i;
}

function format(value: unknown): string {
  if (typeof value === 'string') return /\s/.test(value) ? JSON.stringify(value) : value;
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
