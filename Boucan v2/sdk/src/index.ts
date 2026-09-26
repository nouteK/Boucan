/**
 * @boucan/sdk — reference network client for BOUCAN frontends.
 * Guide: docs/integration/FRONTEND_BACKEND.md.
 *
 *   import { BoucanClient } from '@boucan/sdk';
 *   const client = new BoucanClient({ url: 'ws://localhost:3001/ws', clientName: 'astra-web/0.1' });
 *   await client.connect();
 *   await client.createRoom({ nickname: 'Zoé' });
 *   client.on('snapshot', (s) => render(s));
 *
 * Offline (no server): import { createLocalGame } from '@boucan/sdk/local'.
 */
export {
  BoucanClient,
  type BoucanClientEvents,
  type BoucanClientOptions,
  type ConnectionStatus,
  type SessionStore,
} from './client';
export { BoucanError, type SdkErrorCategory, type SdkErrorCode } from './errors';
export { ServerClock } from './clock';
export { webSocketTransport, type Transport, type TransportFactory, type TransportHandlers } from './transport';
export * from './helpers';
// The whole contract (types, schemas, rules) re-exported for convenience.
export * from '@boucan/shared';
