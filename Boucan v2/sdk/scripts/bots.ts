/**
 * Fill a room with simulated players (dev tool).
 *
 *   Join an existing room (you are the host in your UI):
 *     npm run bots -- --code BCDF --count 3
 *
 *   Create a room hosted by a bot, then join it from your UI with the printed code;
 *   the bot host starts when everyone is ready and returns to the lobby after the podium:
 *     npm run bots -- --create --count 3 [--length court|normal|long] [--start-at 4]
 *
 * Options: --url ws://localhost:3001/ws  --skill 0.6
 */
import { GAME_RULES, type MatchLength } from '@boucan/shared';
import { BOT_NAMES, BotPlayer } from '../src/local';

const args = new Map<string, string>();
process.argv.slice(2).forEach((arg, i, all) => {
  if (arg.startsWith('--')) args.set(arg.slice(2), all[i + 1] && !all[i + 1]!.startsWith('--') ? all[i + 1]! : 'true');
});
const url = args.get('url') ?? process.env.BOUCAN_URL ?? 'ws://localhost:3001/ws';
// With --create the bots fill the room (host included); otherwise they join yours.
const count = Math.max(1, Math.min(GAME_RULES.maxPlayers - (args.has('create') ? 0 : 1), Number(args.get('count') ?? 3)));
const skill = Number(args.get('skill') ?? 0.6);
const bots: BotPlayer[] = [];

function log(message: string): void {
  console.log(`[bots] ${message}`);
}

try {
  let code = args.get('code')?.toUpperCase();
  if (args.has('create')) {
    const host = new BotPlayer({
      url,
      nickname: BOT_NAMES[0]!,
      skill,
      autoStartAt: Number(args.get('start-at') ?? count + 1),
      autoReturnAfterMs: 15_000,
    });
    code = await host.create({ length: (args.get('length') ?? 'court') as MatchLength });
    bots.push(host);
    log(`room created: ${code} (bot host starts when ${args.get('start-at') ?? count + 1} players are ready)`);
  }
  if (!code) {
    console.error('Give --code <ROOM> or --create');
    process.exit(1);
  }
  const extra = args.has('create') ? count - 1 : count;
  for (let i = 0; i < extra; i++) {
    const bot = new BotPlayer({ url, nickname: BOT_NAMES[bots.length]!, skill });
    await bot.join(code);
    bots.push(bot);
  }
  log(`${bots.length} bot(s) in room ${code}. Ctrl+C to stop.`);
  for (const bot of bots) {
    bot.client.on('sessionEnded', (reason) => log(`${bot.client.playerId} session ended: ${reason}`));
  }
  bots[0]!.client.on('roomEvent', (e) => {
    if (e.kind === 'phaseChanged') log(`phase ${e.phase} (microgame ${e.counter})`);
  });
} catch (error) {
  console.error(`[bots] ${error instanceof Error ? error.message : error}`);
  bots.forEach((b) => b.stop());
  process.exit(1);
}

process.on('SIGINT', () => {
  bots.forEach((b) => b.stop());
  process.exit(0);
});
