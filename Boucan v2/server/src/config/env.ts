import { z } from 'zod';
import type { LogLevel } from '../engine/logger';
import type { LogFormat } from '../logging/console-logger';
import { resolveGameConfig, type GameConfig } from './game-config';

/**
 * Environment variables → validated runtime settings. The only place that
 * reads process.env. Documented in .env.example and README.md.
 */
const csv = z
  .string()
  .optional()
  .transform((v) =>
    v === undefined || v.trim() === ''
      ? null
      : v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
  );

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
  LOG_FORMAT: z.enum(['pretty', 'json']).optional(),
  ALLOWED_ORIGINS: csv,
  BOUCAN_MINIGAMES: csv,
  BOUCAN_TIME_SCALE: z.coerce.number().positive().max(10).default(1),
  MAX_ROOMS: z.coerce.number().int().positive().optional(),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().positive().optional(),
});

export interface ServerSettings {
  environment: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: LogLevel | 'silent';
  logFormat: LogFormat;
  /** null = every origin accepted. */
  allowedOrigins: string[] | null;
  game: GameConfig;
}

export function loadSettings(env: Record<string, string | undefined> = process.env): ServerSettings {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${lines}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  if (production && e.BOUCAN_TIME_SCALE !== 1) throw new Error('BOUCAN_TIME_SCALE must be 1 in production');
  return {
    environment: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL ?? (e.NODE_ENV === 'test' ? 'warn' : 'info'),
    logFormat: e.LOG_FORMAT ?? (production ? 'json' : 'pretty'),
    allowedOrigins: e.ALLOWED_ORIGINS,
    game: resolveGameConfig(
      {
        minigames: { enabled: e.BOUCAN_MINIGAMES },
        limits: {
          ...(e.MAX_ROOMS !== undefined && { maxRooms: e.MAX_ROOMS }),
          ...(e.MAX_CONNECTIONS_PER_IP !== undefined && { maxConnectionsPerIp: e.MAX_CONNECTIONS_PER_IP }),
        },
      },
      e.BOUCAN_TIME_SCALE,
    ),
  };
}
