import { afterEach, describe, expect, it } from 'vitest';
import { createBoucanServer, loadSettings, type BoucanServer } from '@boucan/server/node';
import { silentLogger } from '@boucan/server';
import { BoucanClient, BoucanError, phaseProgress, type RoomSnapshot } from '../src';
import { BotPlayer, createLocalGame, type LocalGame } from '../src/local';

/** End-to-end: real WebSocket server + SDK clients + bots, real time (durations scaled down). */

let server: BoucanServer | null = null;
const cleanup: (() => void)[] = [];
afterEach(async () => {
  cleanup.splice(0).forEach((fn) => fn());
  await server?.close();
  server = null;
});

async function startServer(timeScale = 0.12): Promise<string> {
  const settings = loadSettings({ NODE_ENV: 'test', PORT: '0', HOST: '127.0.0.1', BOUCAN_TIME_SCALE: String(timeScale) });
  server = createBoucanServer({ settings, logger: silentLogger });
  const { url } = await server.listen();
  return url;
}

function waitFor(client: BoucanClient, predicate: (s: RoomSnapshot) => boolean, timeoutMs = 30_000): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => {
    if (client.snapshot && predicate(client.snapshot)) return resolve(client.snapshot);
    const timer = setTimeout(() => {
      off();
      reject(new Error(`waitFor timed out in phase ${client.snapshot?.match.phase}`));
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

/** Plays every solo microgame by reporting a success halfway. */
function autoWin(client: BoucanClient): void {
  let played: string | null = null;
  client.on('snapshot', (s) => {
    const r = s.match.round;
    if (s.match.phase !== 'MICROGAME' || !r || r.kind === 'duel' || played === r.roundId) return;
    played = r.roundId;
    setTimeout(() => void client.reportResult({ outcome: 'success' }, r.roundId).catch(() => {}), r.timing.durationMs / 2);
  });
}

describe('WebSocket end-to-end', () => {
  it('plays a whole stage: humans, client bots and server bots', async () => {
    const url = await startServer();
    const client = new BoucanClient({ url, clientName: 'e2e' });
    cleanup.push(() => client.disconnect());
    const info = await client.connect();
    expect(info.protocolVersion).toBe(2);
    expect(client.clock.synced).toBe(true);

    const { snapshot } = await client.createRoom({ nickname: 'Testeur', config: { length: 'court', lives: 3 } });
    const bots = Array.from({ length: 3 }, (_, i) => new BotPlayer({ url, nickname: `Client ${i + 1}`, skill: 0.6 }));
    cleanup.push(() => bots.forEach((b) => b.stop()));
    await Promise.all(bots.map((b) => b.join(snapshot.lobby.code)));
    await client.addBot();
    await client.addBot();
    autoWin(client);

    const seen = new Set<string>();
    client.on('snapshot', (s) => seen.add(s.match.phase));
    await client.setReady(true);
    await waitFor(client, (s) => s.lobby.players.length === 6 && s.lobby.canStart);
    await client.startMatch();

    const interlude = await waitFor(client, (s) => s.match.phase === 'INTERLUDE');
    const p = phaseProgress(interlude, client.serverNow());
    expect(p.remainingMs).toBeGreaterThan(0);
    expect(interlude.match.round!.timing.activeAt).toBe(interlude.match.phaseEndsAt);

    const final = await waitFor(client, (s) => s.match.phase === 'STAGE_RESULTS', 80_000);
    expect(final.match.final!.entries).toHaveLength(6);
    for (const phase of ['STAGE_INTRO', 'INTERLUDE', 'MICROGAME', 'VERDICT']) expect(seen).toContain(phase);
    await client.returnToLobby();
    await waitFor(client, (s) => s.match.phase === 'LOBBY');
  }, 100_000);

  it('reports refusals as typed BoucanErrors with a category', async () => {
    const url = await startServer();
    const client = new BoucanClient({ url });
    cleanup.push(() => client.disconnect());
    await client.connect();
    const error = await client.joinRoom({ code: 'ZZZZ', nickname: 'Zoé' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BoucanError);
    expect(error).toMatchObject({ code: 'ROOM_NOT_FOUND', category: 'request', about: 'room.join' });
  });

  it('reconnects after a network drop and resumes the same seat', async () => {
    const url = await startServer(1);
    const client = new BoucanClient({ url });
    cleanup.push(() => client.disconnect());
    await client.connect();
    const { playerId } = await client.createRoom({ nickname: 'Résiliente' });
    const statuses: string[] = [];
    client.on('status', (s) => statuses.push(s));
    (client as unknown as { transport: { close(code: number): void } }).transport.close(4999);
    await new Promise((r) => setTimeout(r, 50));
    await waitFor(client, (s) => s.lobby.players[0]!.connection === 'connected' && statuses.includes('connected'), 10_000);
    expect(statuses).toContain('reconnecting');
    expect(client.playerId).toBe(playerId);
  });

  it('refuses a client speaking another protocol version', async () => {
    const url = await startServer();
    const ws = new WebSocket(url);
    await new Promise((r) => (ws.onopen = r));
    const reply = new Promise<unknown>((r) => (ws.onmessage = (e) => r(JSON.parse(String(e.data)))));
    const closed = new Promise<number>((r) => (ws.onclose = (e) => r(e.code)));
    ws.send(JSON.stringify({ type: 'hello', rid: '1', payload: { protocolVersion: 99 } }));
    expect(await reply).toMatchObject({ ok: false, error: { code: 'PROTOCOL_MISMATCH', category: 'protocol' } });
    expect(await closed).toBe(4000);
  });

  it('serves /health and /api/info', async () => {
    const url = await startServer();
    const http = url.replace('ws://', 'http://').replace('/ws', '');
    const health = await (await fetch(`${http}/health`)).json();
    expect(health).toMatchObject({ status: 'ok', protocolVersion: 2 });
    const info = await (await fetch(`${http}/api/info`)).json();
    expect(info.microgames.length).toBeGreaterThan(10);
  });
});

describe('local game (no server)', () => {
  let game: LocalGame | null = null;
  afterEach(() => {
    game?.dispose();
    game = null;
  });

  it('plays a whole stage in-process with server bots', async () => {
    game = await createLocalGame({ bots: 3, timeScale: 0.12, match: { length: 'court' } });
    const { client } = game;
    autoWin(client);
    await client.setReady(true);
    await client.startMatch();
    const final = await waitFor(client, (s) => s.match.phase === 'STAGE_RESULTS', 80_000);
    expect(final.match.final!.entries).toHaveLength(4);
  }, 100_000);
});
