/** Node-only exports (tests, tools). */
export { createBoucanServer, WS_PATH, type BoucanServer, type BoucanServerOptions } from './transport/ws-server';
export { createConsoleLogger } from './logging/console-logger';
export { loadSettings, type ServerSettings } from './config/env';
