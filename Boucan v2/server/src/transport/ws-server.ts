import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { PROTOCOL_VERSION } from '@boucan/shared';
import type { ServerSettings } from '../config/env';
import type { Logger } from '../engine/logger';
import type { MiniGameModule } from '../engine/minigames/api';
import { DUEL_MODULES } from '../engine/minigames/catalog';
import { MiniGameRegistry } from '../engine/minigames/registry';
import { newId } from '../engine/util/ids';
import { Gateway } from '../gateway/gateway';
import { SERVER_VERSION } from '../version';
import { createStaticHandler } from './static';

/** WebSocket endpoint path. */
export const WS_PATH = '/ws';

export interface BoucanServerOptions {
  settings: ServerSettings;
  logger: Logger;
  /** Override the duel modules (tests). */
  modules?: readonly MiniGameModule[];
  /** Built client to serve (client/dist). */
  staticDir?: string;
  clock?: () => number;
}

export interface BoucanServer {
  readonly http: HttpServer;
  readonly gateway: Gateway;
  listen(port?: number, host?: string): Promise<{ port: number; url: string }>;
  close(): Promise<void>;
}

interface Tracked {
  ws: WebSocket;
  alive: boolean;
  pingSentAt: number;
  rtt: number | null;
}

/**
 * Node transport: HTTP (health/info) + WebSocket (the game protocol) on one
 * port. Everything protocol-related is delegated to the Gateway.
 */
export function createBoucanServer(options: BoucanServerOptions): BoucanServer {
  const { settings, logger } = options;
  const config = settings.game;
  const startedAt = Date.now();
  const registry = new MiniGameRegistry(options.modules ?? DUEL_MODULES, config.microgames.enabled);
  const serveStatic = options.staticDir ? createStaticHandler(options.staticDir) : null;
  const gateway = new Gateway({
    config,
    registry,
    logger,
    serverVersion: SERVER_VERSION,
    environment: settings.environment,
    clock: options.clock,
  });

  const tracked = new Set<Tracked>();
  const perIp = new Map<string, number>();

  // A bad HTTP request must never take the game down.
  const http = createServer((req, res) => {
    try {
      handleHttp(req, res);
    } catch (error) {
      logger.error('http request failed', { url: req.url?.slice(0, 200) }, error);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'internal error' }));
    }
  });

  function handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const path = (req.url ?? '/').split('?')[0];
    const origin = req.headers.origin;
    const cors = origin && originAllowed(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'method not allowed' });
    if (path === '/health') {
      return json(200, {
        status: 'ok',
        protocolVersion: PROTOCOL_VERSION,
        serverVersion: SERVER_VERSION,
        environment: settings.environment,
        uptimeS: Math.round((Date.now() - startedAt) / 1000),
        rooms: gateway.manager.roomCount,
        players: gateway.manager.playerCount,
        connections: gateway.connectionCount,
      });
    }
    if (path === '/api/info') {
      const { connectionId: _unused, ...info } = gateway.serverInfo('http');
      return json(200, { ...info, websocketPath: WS_PATH });
    }
    if (serveStatic?.(req, res)) return;
    json(404, { error: 'not found', hint: `WebSocket endpoint is ${WS_PATH}; see /health and /api/info` });
  }

  function originAllowed(origin: string | undefined): boolean {
    if (settings.allowedOrigins === null) return true;
    return origin !== undefined && settings.allowedOrigins.includes(origin);
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: config.network.maxMessageBytes });

  http.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '/').split('?')[0];
    const reject = (status: number, text: string) => {
      socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (path !== WS_PATH) return reject(404, 'Not Found');
    if (!originAllowed(req.headers.origin)) {
      logger.warn('websocket origin refused', { origin: req.headers.origin });
      return reject(403, 'Forbidden');
    }
    const ip = clientIp(req);
    if ((perIp.get(ip) ?? 0) >= config.limits.maxConnectionsPerIp) {
      logger.warn('too many connections from ip', { ip });
      return reject(429, 'Too Many Requests');
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip));
  });

  /** Behind a proxy every socket comes from the proxy: trust its headers only when told to. */
  function clientIp(req: IncomingMessage): string {
    if (settings.trustProxy) {
      const header = req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'];
      const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim();
      if (first) return first;
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  function onConnection(ws: WebSocket, ip: string): void {
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    const t: Tracked = { ws, alive: true, pingSentAt: 0, rtt: null };
    tracked.add(t);
    const handle = gateway.open({
      id: newId('c'),
      remoteAddress: ip,
      send: (data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      },
      close: (code, reason) => ws.close(code, reason),
      rttMs: () => t.rtt,
    });
    ws.on('message', (data, isBinary) => {
      handle.receive(isBinary ? '\u0000binary' : data.toString());
    });
    ws.on('pong', () => {
      t.alive = true;
      const sample = Date.now() - t.pingSentAt;
      // Exponential moving average smooths out spikes.
      t.rtt = t.rtt === null ? sample : Math.round(t.rtt * 0.7 + sample * 0.3);
    });
    ws.on('close', () => {
      tracked.delete(t);
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n <= 0) perIp.delete(ip);
      else perIp.set(ip, n);
      handle.closed();
    });
    ws.on('error', (error) => logger.warn('websocket error', { error: error.message }));
    // First RTT sample right away so lag compensation is available early.
    t.pingSentAt = Date.now();
    ws.ping();
  }

  // Heartbeat: detects dead sockets and measures RTT.
  const heartbeat = setInterval(() => {
    for (const t of tracked) {
      if (!t.alive) {
        t.ws.terminate();
        continue;
      }
      t.alive = false;
      t.pingSentAt = Date.now();
      t.ws.ping();
    }
  }, config.network.heartbeatMs);

  const ticker = setInterval(() => gateway.tick(), config.network.tickMs);

  return {
    http,
    gateway,
    listen(port = settings.port, host = settings.host) {
      return new Promise((resolve, reject) => {
        http.once('error', reject);
        http.listen(port, host, () => {
          http.off('error', reject);
          const actual = (http.address() as AddressInfo).port;
          const shown = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
          resolve({ port: actual, url: `ws://${shown}:${actual}${WS_PATH}` });
        });
      });
    },
    close() {
      clearInterval(heartbeat);
      clearInterval(ticker);
      gateway.shutdown();
      for (const t of tracked) t.ws.terminate();
      wss.close();
      return new Promise((resolve) => http.close(() => resolve()));
    },
  };
}
