/**
 * Integration check — verifies a running BOUCAN server end to end, the way the
 * client uses it (protocol v2), and says WHOSE problem a failure is.
 *
 *   npm run check:integration                          (ws://localhost:3001/ws, 3 players, 3 microgames, then abort)
 *   npm run check:integration -- --url ws://host:3001/ws --players 4 --rounds 5
 *   npm run check:integration -- --full                 (plays a whole short match up to the final ranking)
 *
 * Tip: start the server with BOUCAN_TIME_SCALE=0.3 for a fast run.
 */
import { CONTRACT_REVISION, PROTOCOL_VERSION, type RoomSnapshot } from '@boucan/shared';
import { BoucanClient, BoucanError } from '../src';
import { BotPlayer } from '../src/local';

const args = new Map<string, string>();
process.argv.slice(2).forEach((arg, i, all) => {
  if (arg.startsWith('--')) args.set(arg.slice(2), all[i + 1] && !all[i + 1]!.startsWith('--') ? all[i + 1]! : 'true');
});
const url = args.get('url') ?? process.env.BOUCAN_URL ?? 'ws://localhost:3001/ws';
const players = Math.max(1, Math.min(8, Number(args.get('players') ?? 3)));
const rounds = Math.max(1, Number(args.get('rounds') ?? 3));
const full = args.has('full');
const httpBase = url.replace(/^ws/, 'http').replace(/\/ws$/, '');

type Blame = 'network' | 'protocol' | 'backend' | 'client';
const HINTS: Record<Blame, string> = {
  network: 'Server unreachable: is it running? right host/port? (npm run dev)',
  protocol: 'Client and server disagree on the contract: rebuild so both use the same @boucan/shared (PROTOCOL_VERSION).',
  backend: 'The server misbehaved: check the server logs (LOG_LEVEL=debug).',
  client: 'The request was refused by the game rules: the caller used the API in the wrong state.',
};

let step = 0;
const started = Date.now();
function ok(label: string, detail = ''): void {
  console.log(`  ✓ ${String(++step).padStart(2)}. ${label}${detail ? `  — ${detail}` : ''}`);
}
function fail(label: string, blame: Blame, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`  ✗ ${String(++step).padStart(2)}. ${label}\n\n     ${message}\n     → [${blame.toUpperCase()}] ${HINTS[blame]}\n`);
  process.exit(1);
}
function blameOf(error: unknown): Blame {
  if (!(error instanceof BoucanError)) return 'backend';
  if (error.category === 'network') return 'network';
  if (error.category === 'protocol') return 'protocol';
  if (error.category === 'request') return 'client';
  return 'backend';
}
async function attempt<T>(label: string, fn: () => Promise<T>, detail?: (value: T) => string, blame?: Blame): Promise<T> {
  try {
    const value = await fn();
    ok(label, detail?.(value));
    return value;
  } catch (error) {
    fail(label, blame ?? blameOf(error), error);
  }
}
function waitFor(client: BoucanClient, what: string, predicate: (s: RoomSnapshot) => boolean, timeoutMs: number): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => {
    if (client.snapshot && predicate(client.snapshot)) return resolve(client.snapshot);
    const timer = setTimeout(() => {
      off();
      reject(new Error(`timeout (${timeoutMs} ms) waiting for ${what}; current phase: ${client.snapshot?.match.phase ?? 'none'}`));
    }, timeoutMs);
    const off = client.on('snapshot', (s) => {
      if (predicate(s)) {
        clearTimeout(timer);
        off();
        resolve(s);
      }
    });
  });
}

console.log(`\nBOUCAN integration check → ${url}  (${players} players, ${full ? 'full match' : `${rounds} microgames`}, protocol ${PROTOCOL_VERSION} / ${CONTRACT_REVISION})\n`);

// HTTP reachability and version.
const health = await attempt('server reachable (GET /health)', async () => {
  const res = await fetch(`${httpBase}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as { protocolVersion: number; serverVersion: string; environment: string };
}, (h) => `server ${h.serverVersion}, ${h.environment}`, 'network');
if (health.protocolVersion !== PROTOCOL_VERSION) {
  fail('protocol version', 'protocol', new Error(`server speaks protocol ${health.protocolVersion}, this SDK speaks ${PROTOCOL_VERSION}`));
}
ok('protocol version matches', `v${PROTOCOL_VERSION}`);

// WebSocket + handshake + clock. The host is a bot too, so it plays every round.
const hostBot = new BotPlayer({ url, nickname: 'Testeur', skill: 0.9, autoReady: false });
const host = hostBot.client;
const contractErrors: BoucanError[] = [];
host.on('error', (e) => {
  if (e.code === 'CONTRACT_VIOLATION') contractErrors.push(e);
});
const info = await attempt('WebSocket connected + handshake (hello)', () => host.connect(), (i) => `${i.microgames.length} microgames: ${i.microgames.join(', ')}`);
ok('clock synchronised', `offset ${Math.round(host.clock.offset)} ms, RTT ${host.clock.rtt} ms`);
const t = info.timings;
/** Longest gap between two phases (interlude with every bonus + longest microgame + verdict), with margin. */
const phaseBudget = Math.max(8_000, (t.stageIntroMs + t.interludeMs + t.verdictMs) * 2 + 12_000);

// Server-side nickname validation.
await attempt('server refuses a forbidden nickname', async () => {
  const error = await host.createRoom({ nickname: 'C0nn4rd' }).then(() => null, (e: unknown) => e);
  if (!(error instanceof BoucanError) || error.code !== 'NICKNAME_NOT_ALLOWED') {
    throw new Error(`expected NICKNAME_NOT_ALLOWED, got ${error instanceof BoucanError ? error.code : 'success'}`);
  }
  return error;
}, () => 'NICKNAME_NOT_ALLOWED', 'backend');

// Unknown room code.
await attempt('server refuses an unknown room code', async () => {
  const probe = new BoucanClient({ url, clientName: 'integration-check/probe', autoReconnect: false });
  await probe.connect();
  const error = await probe.joinRoom({ code: 'ZZZZ', nickname: 'Sonde' }).then(() => null, (e: unknown) => e);
  probe.disconnect();
  if (!(error instanceof BoucanError) || error.code !== 'ROOM_NOT_FOUND') {
    throw new Error(`expected ROOM_NOT_FOUND, got ${error instanceof BoucanError ? error.code : 'success'}`);
  }
}, () => 'ROOM_NOT_FOUND', 'backend');

// Room + players.
const code = await attempt('room created', () => hostBot.create({ length: 'court', lives: 3 }), (c) => `code ${c}`);
const bots: BotPlayer[] = [];
await attempt(`${players - 1} other player(s) joined`, async () => {
  for (let i = 1; i < players; i++) {
    const bot = new BotPlayer({ url, nickname: `Testeur ${i + 1}`, skill: 0.8 });
    await bot.join(code);
    bots.push(bot);
  }
});
await attempt('players synchronised on every client', async () => {
  await waitFor(host, `${players} players`, (s) => s.lobby.players.length === players, 5_000);
  for (const bot of bots) {
    await waitFor(bot.client, `${players} players (bot view)`, (s) => s.lobby.players.length === players, 5_000);
    if (bot.client.snapshot!.lobby.players.map((p) => p.nickname).join() !== host.snapshot!.lobby.players.map((p) => p.nickname).join()) {
      throw new Error('clients disagree on the player list');
    }
  }
}, () => host.snapshot!.lobby.players.map((p) => p.nickname).join(', '), 'backend');

// Ready + start.
await attempt('everyone ready, match started', async () => {
  await host.setReady(true);
  await waitFor(host, 'lobby.canStart', (s) => s.lobby.canStart, 5_000);
  await host.startMatch();
});
await attempt('stage intro (STAGE_INTRO)', () => waitFor(host, 'STAGE_INTRO', (s) => s.match.phase === 'STAGE_INTRO', 5_000), (s) => `zone ${s.match.zone}`, 'backend');

// First microgame: announcement, shared timestamps, play, verdict.
const announced = await attempt('microgame announced (INTERLUDE)', () =>
  waitFor(host, 'INTERLUDE', (s) => s.match.phase === 'INTERLUDE' && s.match.round !== null, phaseBudget),
(s) => `${s.match.round!.microgameId} (${s.match.round!.kind}), seed ${s.match.round!.seed}, ${s.match.round!.participants.length} participants`, 'backend');
const first = announced.match.round!;
const botViews = await Promise.all(
  bots.map((b) =>
    waitFor(b.client, 'round (other client)', (s) => s.match.round?.roundId === first.roundId, 3_000).then(
      (s) => s.match.round!.timing.activeAt,
      () => null,
    ),
  ),
);
if (botViews.some((at) => at !== first.timing.activeAt)) {
  fail('same start timestamp for every client', 'backend', new Error(`activeAt differs between clients: ${botViews.join(', ')}`));
}
ok('same start timestamp on every client', `starts in ${Math.round(first.timing.activeAt - host.serverNow())} ms (local clock)`);

let activity = 0;
host.on('minigameEvent', () => activity++);
host.on('minigameState', () => activity++);
host.on('snapshot', (s) => (activity += Object.keys(s.match.round?.progress ?? {}).length));
await attempt('microgame running (MICROGAME)', () => waitFor(host, 'MICROGAME', (s) => s.match.phase === 'MICROGAME', phaseBudget), undefined, 'backend');
const verdict = await attempt('results recorded (VERDICT)', () =>
  waitFor(host, 'VERDICT', (s) => s.match.phase === 'VERDICT' && s.match.verdict?.roundId === first.roundId, phaseBudget),
(s) => s.match.verdict!.entries.map((e) => `${s.lobby.players.find((p) => p.id === e.playerId)?.nickname}:${e.outcome}(${e.lives}♥)`).join(' '), 'backend');
if (verdict.match.verdict!.entries.length !== first.participants.length) {
  fail('one verdict entry per participant', 'backend', new Error(`${verdict.match.verdict!.entries.length} entries for ${first.participants.length} participants`));
}
if (activity === 0) fail('gameplay activity', 'backend', new Error('no microgame report, event or state observed'));
ok('one verdict entry per participant');

// Following microgames.
if (rounds > 1) {
  await attempt(`${rounds} microgames played`, () =>
    waitFor(host, `verdict #${rounds}`, (s) => s.match.phase === 'STAGE_RESULTS' || (s.match.phase === 'VERDICT' && (s.match.verdict?.index ?? 0) >= rounds), rounds * phaseBudget),
  (s) => (s.match.phase === 'STAGE_RESULTS' ? `match over after ${s.match.final!.microgamesPlayed}` : `counter ${s.match.counter}, tempo ×${s.match.tempo.toFixed(2)}`), 'backend');
}

if (full) {
  const final = await attempt('match finished with a final ranking (STAGE_RESULTS)', () =>
    waitFor(host, 'STAGE_RESULTS', (s) => s.match.phase === 'STAGE_RESULTS', 40 * phaseBudget),
  (s) => `${s.match.final!.microgamesPlayed} microgames, winner(s): ${s.match.final!.winnerIds.map((id) => s.lobby.players.find((p) => p.id === id)?.nickname).join(', ') || 'none'}`, 'backend');
  if (final.match.final!.entries.length !== players) fail('one ranking entry per player', 'backend', new Error(`${final.match.final!.entries.length} entries`));
  await attempt('returned to the lobby', async () => {
    await host.returnToLobby();
    await waitFor(host, 'LOBBY', (s) => s.match.phase === 'LOBBY', 5_000);
  });
} else {
  await attempt('host stopped the match, everyone back in the lobby', async () => {
    if (host.snapshot?.match.phase === 'STAGE_RESULTS') await host.returnToLobby();
    else await host.abortMatch();
    await waitFor(host, 'LOBBY', (s) => s.match.phase === 'LOBBY', 5_000);
    for (const bot of bots) await waitFor(bot.client, 'LOBBY (bot view)', (s) => s.match.phase === 'LOBBY', 5_000);
  });
}

if (contractErrors.length > 0) {
  fail('every server message matched the contract', 'protocol', contractErrors[0]);
}
ok('every server message matched the contract');

bots.forEach((b) => b.stop());
hostBot.stop();
console.log(`\n  All good in ${((Date.now() - started) / 1000).toFixed(1)} s.\n`);
process.exit(0);
