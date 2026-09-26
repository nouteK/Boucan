/**
 * Transport abstraction: the client does not care whether bytes travel
 * through a real WebSocket or an in-memory pipe to a local server.
 */
export interface TransportHandlers {
  onMessage(data: string): void;
  onClose(code: number, reason: string): void;
}

export interface Transport {
  /** Resolves once the connection is open; rejects if it cannot open. */
  open(handlers: TransportHandlers): Promise<void>;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type TransportFactory = () => Transport;

/** Browser / Node ≥ 22 WebSocket transport. */
export function webSocketTransport(url: string): TransportFactory {
  return () => {
    let ws: WebSocket | null = null;
    return {
      open(handlers) {
        return new Promise((resolve, reject) => {
          const WS = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
          if (!WS) {
            reject(new Error('No global WebSocket (use Node >= 22 or a browser)'));
            return;
          }
          const socket = new WS(url);
          ws = socket;
          let opened = false;
          socket.onopen = () => {
            opened = true;
            resolve();
          };
          socket.onmessage = (event) => {
            if (typeof event.data === 'string') handlers.onMessage(event.data);
          };
          socket.onclose = (event) => {
            if (!opened) reject(new Error(`WebSocket closed before opening (${event.code})`));
            else handlers.onClose(event.code, event.reason);
          };
          socket.onerror = () => {
            if (!opened) reject(new Error(`Cannot connect to ${url}`));
          };
        });
      },
      send(data) {
        if (ws?.readyState === 1) ws.send(data);
      },
      close(code = 1000, reason = '') {
        ws?.close(code, reason);
      },
    };
  };
}
