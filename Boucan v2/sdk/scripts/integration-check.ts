/**
 * Integration check — verifies a running BOUCAN server end to end, the way a
 * frontend uses it, and says WHOSE problem a failure is.
 *
 *   npm run check:integration                         (ws://localhost:3001/ws, 3 players, 3 rounds)
 *   npm run check:integration -- --url ws://host:3001/ws --players 4 --rounds 3
 *
 * Tip: start the server with BOUCAN_TIME_SCALE=0.2 for a ~20 s run.
 */
import { CONTRACT_REVISION, PROTOCOL_VERSION } from '@boucan/shared';
import { BoucanClient, BoucanError, type RoomSnapshot } from '../src';
import { BotPlayer } from '../src/local';

const args = new Map<string, string>();
process.argv.slice(2).forEach((arg, i, all) => {
  if (arg.startsWith('--')) args.set(arg.slice(2), all[i + 1] && !all[i + 1]!.startsWith('--') ? all[i + 1]! : 'true');
});
const url = args.get('url') ?? process.env.BOUCAN_URL ?? 'ws://localhost:3001/ws';
const players = Math.max(1, Math.min(8, Number(args.get('players') ?? 3)));
const rounds = Number(args.get('rounds') ?? 3);
const httpBase = url.replace(/^ws/, 'http').replace(/\/ws$/, '');

type Blame = 'network' | 'protocol' | 'backend' | 'frontend';
const HINTS: Record<Blame, string> = {
  network: 'Server unreachable: is it running? right host/port? (npm run dev)',
  protocol: 'Client and server disagree on the contract: update the SDK/frontend or the server so PROTOCOL_VERSION matches, then read docs/handoff/CLAUDE_TO_ASTRA.md.',
  backend: 'The server misbehaved: check the server logs (LOG_LEVEL=debug) — backend bug, report it to Claude.',
  frontend: 'The request was refused by the game rules: the caller used the API in the wrong state (frontend logic).',
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
  if (error.category === 'request') return 'frontend';
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

console.log(`\nBOUCAN integration check → ${url}  (${players} players, ${rounds} rounds, SDK protocol ${PROTOCOL_VERSION} / ${CONTRACT_REVISION})\n`);

// 1–2. HTTP reachability and version.
const health = await attempt('server reachable (GET /health)', async () => {
  const res = await fetch(`${httpBase}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as { protocolVersion: number; contractRevision: string; serverVersion: string; environment: string };
}, (h) => `server ${h.serverVersion}, ${h.environment}`, 'network');

if (health.protocolVersion !== PROTOCOL_VERSION) {
  fail('protocol version', 'protocol', new Error(`server speaks protocol ${health.protocolVersion}, this SDK speaks ${PROTOCOL_VERSION}`));
}
ok('protocol version matches', `v${PROTOCOL_VERSION}${health.contractRevision !== CONTRACT_REVISION ? ` (revision server ${health.contractRevision} ≠ SDK ${CONTRACT_REVISION}: compatible)` : ''}`);

// 3–4. WebSocket + handshake + clock.
const host = new BoucanClient({ url, clientName: 'integration-check', autoReconnect: false });
const contractErrors: BoucanError[] = [];
host.on('error', (e) => {
  if (e.code === 'CONTRACT_VIOLATION') contractErrors.push(e);
});
const info = await attempt('WebSocket connected + handshake (hello)', () => host.connect(), (i) => `${i.minigames.length} minigames: ${i.minigames.map((m) => `${m.id}(${m.authority})`).join(', ')}`);
ok('clock synchronised', `offset ${Math.round(host.clock.offset)} ms, RTT ${host.clock.rtt} ms`);
const scale = info.timings.countdownMs / 3000;
const budget = (ms: number) => Math.max(5_000, ms);

// 5. Server-side nickname validation.
await attempt('server refuses a forbidden nickname', async () => {
  const error = await host.createRoom({ nickname: 'C0nn4rd' }).then(() => null, (e: unknown) => e);
  if (!(error instanceof BoucanError) || error.code !== 'NICKNAME_NOT_ALLOWED') {
    throw new Error(`expected NICKNAME_NOT_ALLOWED, got ${error instanceof BoucanError ? error.code : 'success'}`);
  }
  return error;
}, () => 'NICKNAME_NOT_ALLOWED', 'backend');

// 6–7. Room + players.
const created = await attempt('room created', () => host.createRoom({ nickname: 'Testeur', config: { rounds } }), (r) => `code ${r.snapshot.lobby.code}`);
const code = created.snapshot.lobby.code;
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

// 8. Ready + start.
host.on('snapshot', (s) => {
  const session = s.match.minigame;
  if (s.match.phase === 'MINIGAME_PREPARING' && session && !session.readyPlayerIds.includes(host.playerId!)) {
    void host.minigameReady(session.sessionId).catch(() => {});
  }
});
await attempt('everyone ready, match started', async () => {
  await host.setReady(true);
  await waitFor(host, 'lobby.canStart', (s) => s.lobby.canStart, 5_000);
  await host.startMatch();
});

// 9–12. Minigame announcement, shared timestamps, activity, results.
const announced = await attempt('minigame announced (MINIGAME_PREPARING)', () =>
  waitFor(host, 'MINIGAME_PREPARING', (s) => s.match.phase === 'MINIGAME_PREPARING', budget(info.timings.matchStartingMs + 5_000)),
(s) => `${s.match.minigame!.minigameId}, seed ${s.match.minigame!.seed}, ${s.match.minigame!.participants.length} participants`, 'backend');

const countdown = await attempt('common start timestamp received (MINIGAME_COUNTDOWN)', () =>
  waitFor(host, 'MINIGAME_COUNTDOWN', (s) => s.match.phase === 'MINIGAME_COUNTDOWN', budget(info.timings.preparingMaxMs + 5_000)),
(s) => `starts in ${Math.round(s.match.minigame!.timing.activeAt! - host.serverNow())} ms (local clock)`, 'backend');
const botViews = await Promise.all(
  bots.map((b) =>
    waitFor(b.client, 'countdown (other client)', (s) => s.match.minigame?.timing.activeAt != null, 3_000).then(
      (s) => s.match.minigame!.timing.activeAt,
      () => null,
    ),
  ),
);
if (botViews.some((t) => t !== countdown.match.minigame!.timing.activeAt)) {
  fail('same timestamp for every client', 'backend', new Error(`activeAt differs between clients: ${botViews.join(', ')}`));
}
ok('same timestamp on every client', `activeAt ${countdown.match.minigame!.timing.activeAt}`);

let activity = 0;
host.on('minigameEvent', () => activity++);
host.on('minigameState', () => activity++);
host.on('snapshot', (s) => (activity += s.match.minigame?.finishedPlayerIds.length ?? 0));
const firstResults = await attempt('actions received & results recorded (MINIGAME_RESULTS)', () =>
  waitFor(host, 'MINIGAME_RESULTS', (s) => s.match.phase === 'MINIGAME_RESULTS', budget(25_000 * scale + 10_000)),
(s) => s.match.lastRound!.entries.map((e) => `${host.snapshot!.lobby.players.find((p) => p.id === e.playerId)?.nickname}:${e.result.outcome}+${e.points}`).join(' '), 'backend');
if (firstResults.match.lastRound!.entries.length !== announced.match.minigame!.participants.length) {
  fail('one result per participant', 'backend', new Error('missing entries in lastRound'));
}
if (activity === 0) fail('gameplay activity', 'backend', new Error('no minigame event/state/finish observed'));
ok('scores updated', firstResults.match.standings.map((s) => `#${s.rank} ${s.score}`).join(', '));

// 13–15. Next rounds, final ranking, back to lobby.
if (rounds > 1) {
  await attempt('next minigame started (round 2)', () =>
    waitFor(host, 'round 2', (s) => s.match.round === 2, budget(info.timings.resultsMs + info.timings.intermissionMs + 5_000)),
  (s) => s.match.minigame?.minigameId ?? '', 'backend');
}
const final = await attempt('match finished with a final ranking (MATCH_RESULTS)', () =>
  waitFor(host, 'MATCH_RESULTS', (s) => s.match.phase === 'MATCH_RESULTS', budget(rounds * (40_000 * scale + 5_000))),
(s) => `winner(s): ${s.match.final!.winnerIds.map((id) => s.lobby.players.find((p) => p.id === id)?.nickname).join(', ')}`, 'backend');
if (final.match.final!.rounds.length !== rounds) fail('round count', 'backend', new Error(`expected ${rounds} rounds, got ${final.match.final!.rounds.length}`));
await attempt('returned to the lobby', async () => {
  await host.returnToLobby();
  await waitFor(host, 'LOBBY', (s) => s.match.phase === 'LOBBY', 5_000);
});

if (contractErrors.length > 0) {
  fail('every server message matched the contract', 'protocol', contractErrors[0]);
}
ok('every server message matched the contract');

bots.forEach((b) => b.stop());
host.disconnect();
console.log(`\n  All good in ${((Date.now() - started) / 1000).toFixed(1)} s.\n`);
process.exit(0);
