import type { MatchConfig } from '@boucan/shared';
import { BoucanClient } from '../client';
import { createLocalServer, type LocalServer, type LocalServerOptions } from './local-server';

export interface LocalGameOptions extends LocalServerOptions {
  /** Server bots joining the room (0–7). Default 3. */
  bots?: number;
  nickname?: string;
  characterId?: string;
  /** Initial match configuration of the room. */
  match?: Partial<MatchConfig>;
}

export interface LocalGame {
  /** YOUR client, host of the room — exactly like online. */
  client: BoucanClient;
  server: LocalServer;
  code: string;
  dispose(): void;
}

/**
 * A playable room without any server: the real engine runs in the page,
 * `client` is the host, server bots fill the seats. Used by the game's
 * offline mode and for development.
 */
export async function createLocalGame(options: LocalGameOptions = {}): Promise<LocalGame> {
  const server = createLocalServer(options);
  const client = new BoucanClient({ transport: server.transport, clientName: 'local-game', validateIncoming: false });
  await client.connect();
  const joined = await client.createRoom({
    nickname: options.nickname ?? 'Moi',
    ...(options.characterId !== undefined && { characterId: options.characterId }),
    ...(options.match !== undefined && { config: options.match }),
  });
  for (let i = 0; i < Math.max(0, Math.min(7, options.bots ?? 3)); i++) await client.addBot();
  return {
    client,
    server,
    code: joined.snapshot.lobby.code,
    dispose() {
      client.disconnect();
      server.stop();
    },
  };
}
