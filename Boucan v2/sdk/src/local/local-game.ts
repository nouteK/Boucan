import type { MatchConfig } from '@boucan/shared';
import { BOT_NAMES, BotPlayer } from '../bots/bot';
import { BoucanClient } from '../client';
import { createLocalServer, type LocalServer, type LocalServerOptions } from './local-server';

export interface LocalGameOptions extends LocalServerOptions {
  /** Bots joining the room (0–7). Default 3. */
  bots?: number;
  nickname?: string;
  characterId?: string;
  /** Initial match configuration of the room. */
  match?: Partial<MatchConfig>;
  /** Added to every bot's skill (−1 … 1). */
  botSkill?: number;
}

export interface LocalGame {
  /** YOUR client, host of the room. Drive the UI with it exactly like online. */
  client: BoucanClient;
  server: LocalServer;
  bots: BotPlayer[];
  code: string;
  dispose(): void;
}

/**
 * One call to get a playable room without any server: the real engine runs
 * in-process, `client` is the host, bots fill the other seats and play every
 * minigame. Ready up and start from your UI; bots follow.
 *
 *   const game = await createLocalGame({ bots: 7, timeScale: 0.5 });
 *   game.client.on('snapshot', render);
 */
export async function createLocalGame(options: LocalGameOptions = {}): Promise<LocalGame> {
  const server = createLocalServer(options);
  const client = new BoucanClient({ transport: server.transport, clientName: 'local-game' });
  await client.connect();
  const joined = await client.createRoom({
    nickname: options.nickname ?? 'Moi',
    ...(options.characterId !== undefined && { characterId: options.characterId }),
    ...(options.match !== undefined && { config: options.match }),
  });
  const code = joined.snapshot.lobby.code;
  const bots: BotPlayer[] = [];
  const count = Math.max(0, Math.min(7, options.bots ?? 3));
  for (let i = 0; i < count; i++) {
    const skill = Math.min(1, Math.max(0, 0.3 + ((i * 0.37) % 0.6) + (options.botSkill ?? 0)));
    const bot = new BotPlayer({ transport: server.transport, nickname: BOT_NAMES[i]!, skill });
    await bot.join(code);
    bots.push(bot);
  }
  return {
    client,
    server,
    bots,
    code,
    dispose() {
      bots.forEach((b) => b.stop());
      client.disconnect();
      server.stop();
    },
  };
}
