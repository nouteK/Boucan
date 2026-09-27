import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROTOCOL_VERSION } from '@boucan/shared';
import { loadSettings } from './config/env';
import { createConsoleLogger } from './logging/console-logger';
import { createBoucanServer } from './transport/ws-server';
import { SERVER_VERSION } from './version';

/** Process entry point: `npm run dev` (watch) or `npm start` (built). */
async function main(): Promise<void> {
  const settings = loadSettings();
  const logger = createConsoleLogger({ level: settings.logLevel, format: settings.logFormat });
  const staticDir = settings.clientDir ?? resolve(process.cwd(), '../client/dist');
  const server = createBoucanServer({ settings, logger, staticDir: existsSync(staticDir) ? staticDir : undefined });
  const { url, port } = await server.listen();
  logger.info('BOUCAN server listening', {
    ws: url,
    health: `http://localhost:${port}/health`,
    env: settings.environment,
    protocol: PROTOCOL_VERSION,
    client: existsSync(staticDir) ? `http://localhost:${port}/` : 'not built (npm run build)',
    version: SERVER_VERSION,
    microgames: server.gateway.serverInfo('boot').microgames.length,
  });

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('shutting down', { signal });
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
