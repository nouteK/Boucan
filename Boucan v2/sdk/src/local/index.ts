/**
 * Offline development: the real engine in-process + bots.
 * Separate entry point ("@boucan/sdk/local") so production bundles that only
 * import "@boucan/sdk" never ship the server engine.
 */
export { createLocalServer, type LocalServer, type LocalServerOptions } from './local-server';
export { createLocalGame, type LocalGame, type LocalGameOptions } from './local-game';
export { BotPlayer, BOT_NAMES, type BotOptions } from '../bots/bot';
