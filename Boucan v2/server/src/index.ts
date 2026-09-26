/**
 * Public surface of @boucan/server for other workspaces (SDK local mode,
 * tools). Node-only pieces (ws transport, console logger) are exported from
 * "./node" so the engine stays importable in a browser.
 */
export { resolveGameConfig, DEFAULT_GAME_CONFIG, type GameConfig, type GameConfigOverrides } from './config/game-config';
export { Gateway, type Connection, type ConnectionHandle, type GatewayOptions } from './gateway/gateway';
export { MiniGameRegistry, toDefinition } from './engine/minigames/registry';
export { MINIGAME_MODULES, MINIGAME_BOTS } from './engine/minigames/catalog';
export { genericBot, type BotApi, type BotStrategy } from './engine/minigames/bot-api';
export type { MiniGameModule, MiniGameContext, MiniGameRuntime, PrepareContext } from './engine/minigames/api';
export { silentLogger, type Logger, type LogContext, type LogLevel } from './engine/logger';
export { SERVER_VERSION } from './version';
