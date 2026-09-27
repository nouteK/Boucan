/**
 * Public surface of @boucan/server for other workspaces (SDK local mode,
 * tools). Node-only pieces (ws transport, console logger) are exported from
 * "./node" so the engine stays importable in a browser.
 */
export { resolveGameConfig, DEFAULT_GAME_CONFIG, type GameConfig, type GameConfigOverrides } from './config/game-config';
export { Gateway, type Connection, type ConnectionHandle, type GatewayOptions } from './gateway/gateway';
export { MiniGameRegistry } from './engine/minigames/registry';
export { DUEL_MODULES } from './engine/minigames/catalog';
export type { MiniGameModule, MiniGameContext, MiniGameRuntime } from './engine/minigames/api';
export { silentLogger, type Logger, type LogContext, type LogLevel } from './engine/logger';
export { SERVER_VERSION } from './version';
