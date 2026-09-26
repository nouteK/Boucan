import {
  Gateway,
  MINIGAME_MODULES,
  MiniGameRegistry,
  resolveGameConfig,
  SERVER_VERSION,
  silentLogger,
  type GameConfig,
  type GameConfigOverrides,
  type Logger,
  type MiniGameModule,
} from '@boucan/server';
import type { TransportFactory, TransportHandlers } from '../transport';

export interface LocalServerOptions {
  /** Game config overrides (timings, scoring…). */
  config?: GameConfigOverrides;
  /** Multiplies phase and minigame durations (0.5 = twice as fast). */
  timeScale?: number;
  /** Simulated one-way network latency (ms). Default 0. */
  latencyMs?: number;
  modules?: readonly MiniGameModule[];
  logger?: Logger;
}

export interface LocalServer {
  readonly config: GameConfig;
  readonly gateway: Gateway;
  /** Transport factory to give to `new BoucanClient({ transport })`. */
  readonly transport: TransportFactory;
  stop(): void;
}

let counter = 0;

/**
 * The REAL backend engine running in-process (browser or Node), behind an
 * in-memory transport. Same rules, same messages, no network: the frontend
 * can be developed and demoed without starting the server.
 */
export function createLocalServer(options: LocalServerOptions = {}): LocalServer {
  const config = resolveGameConfig(options.config, options.timeScale ?? 1);
  const gateway = new Gateway({
    config,
    registry: new MiniGameRegistry(options.modules ?? MINIGAME_MODULES, config.minigames.enabled),
    logger: options.logger ?? silentLogger,
    serverVersion: `${SERVER_VERSION}-local`,
    environment: 'development',
  });
  const ticker = setInterval(() => gateway.tick(), config.network.tickMs);
  const latency = options.latencyMs ?? 0;
  // Always asynchronous, like a real network (never re-entrant).
  const later = (fn: () => void) => (latency > 0 ? void setTimeout(fn, latency) : queueMicrotask(fn));

  const transport: TransportFactory = () => {
    let handle: ReturnType<Gateway['open']> | null = null;
    let handlers: TransportHandlers | null = null;
    let open = false;
    const closeFromServer = (code: number, reason: string) => {
      if (!open) return;
      open = false;
      later(() => handlers?.onClose(code, reason));
    };
    return {
      open(h) {
        handlers = h;
        open = true;
        handle = gateway.open({
          id: `local-${++counter}`,
          remoteAddress: 'local',
          send: (data) => later(() => open && h.onMessage(data)),
          close: closeFromServer,
          rttMs: () => latency * 2,
        });
        return Promise.resolve();
      },
      send(data) {
        if (open) later(() => handle?.receive(data));
      },
      close(code = 1000, reason = '') {
        if (!open) return;
        open = false;
        handle?.closed();
        later(() => handlers?.onClose(code, reason));
      },
    };
  };

  return {
    config,
    gateway,
    transport,
    stop() {
      clearInterval(ticker);
      gateway.shutdown();
    },
  };
}
