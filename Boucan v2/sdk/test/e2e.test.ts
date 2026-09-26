import { afterEach, describe, expect, it } from 'vitest';
import { createBoucanServer, loadSettings, type BoucanServer } from '@boucan/server/node';
import { silentLogger } from '@boucan/server';
import { BoucanClient, BoucanError, phaseProgress, type RoomSnapshot } from '../src';
import { BotPlayer, createLocalGame, type LocalGame } from '../src/local';

/**
 * End-to-end: real WebSocket server + SDK clients + bots, real time
 * (durations scaled down). This is the network vertical slice.
 */

let server: BoucanServer | null = null;
const cleanup: (() => void)[] = [];
afterEach(async () => {
  cleanup.splice(0).forEach((fn) => fn());
  await server?.close();
  server = null;
});

async function startServer(timeScale = 0.08): Promise<string> {
  const settings = loadSettings({ NODE_ENV: 'test', PORT: '0', HOST: '127.0.0.1', BOUCAN_TIME_SCALE: String(timeScale) });
  server = createBoucanServer({ settings, logger: silentLogger });
  const { url } = await server.listen();
  return url;
}

function waitFor(client: BoucanClient, predicate: (s: RoomSnapshot) => boolean, timeoutMs = 25_000): Promise<RoomSnapshot> {
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

describe('WebSocket end-to-end', () => {
  it('runs the full vertical slice with 8 players (1 client + 7 bots)', async () => {
    const url = await startServer();
    const client = new BoucanClient({ url, clientName: 'e2e' });
    cleanup.push(() => client.disconnect());
    const info = await client.connect();
    expect(info.protocolVersion).toBe(1);
    expect(client.clock.synced).toBe(true);
    expect(Math.abs(client.serverNow() - Date.now())).toBeLessThan(1_000);

    const { snapshot } = await client.createRoom({ nickname: 'Astra', config: { rounds: 3 } });
    const bots = Array.from({ length: 7 }, (_, i) => new BotPlayer({ url, nickname: `Bot ${i + 1}`, skill: 0.8 }));
    cleanup.push(() => bots.forEach((b) => b.stop()));
    await Promise.all(bots.map((b) => b.join(snapshot.lobby.code)));

    await client.setReady(true);
    await waitFor(client, (s) => s.lobby.players.length === 8 && s.lobby.canStart);
    // Subscribe BEFORE starting: the MATCH_STARTING snapshot arrives before the reply to match.start.
    const seenPhases = new Set<string>();
    client.on('snapshot', (s) => seenPhases.add(s.match.phase));
    await client.startMatch();

    // Play our own seat too: ready + a report for local games (inputs for the others are optional).
    client.on('snapshot', (s) => {
      const session = s.match.minigame;
      if (!session) return;
      if (s.match.phase === 'MINIGAME_PREPARING' && !session.readyPlayerIds.includes(client.playerId!)) {
        void client.minigameReady().catch(() => {});
      }
    });

    const countdown = await waitFor(client, (s) => s.match.phase === 'MINIGAME_COUNTDOWN');
    const progress = phaseProgress(countdown, client.serverNow());
    expect(progress.exact).toBe(true);
    expect(progress.remainingMs).toBeGreaterThan(0);

    const final = await waitFor(client, (s) => s.match.phase === 'MATCH_RESULTS', 60_000);
    expect(final.match.final!.rounds).toHaveLength(3);
    expect(final.match.final!.standings).toHaveLength(8);
    for (const phase of ['MATCH_STARTING', 'MINIGAME_PREPARING', 'MINIGAME_ACTIVE', 'MINIGAME_RESULTS', 'INTERMISSION']) {
      expect(seenPhases).toContain(phase);
    }
    // Bots really played: some non-dnf results in every round.
    for (const round of final.match.final!.rounds) {
      expect(round.entries.filter((e) => e.result.outcome !== 'dnf').length).toBeGreaterThanOrEqual(5);
    }
    await client.returnToLobby();
    await waitFor(client, (s) => s.match.phase === 'LOBBY');
  }, 90_000);

  it('reports refusals as typed BoucanErrors with a category', async () => {
    const url = await startServer();
    const client = new BoucanClient({ url });
    cleanup.push(() => client.disconnect());
    await client.connect();
    const error = await client.joinRoom({ code: 'ZZZZ', nickname: 'Zoé' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BoucanError);
    expect(error).toMatchObject({ code: 'ROOM_NOT_FOUND', category: 'request', about: 'room.join' });
    const bad = await client.createRoom({ nickname: '<b>' }).catch((e: unknown) => e);
    expect(bad).toMatchObject({ code: 'NICKNAME_INVALID', details: { reason: 'invalidChars' } });
  });

  it('reconnects after a network drop and resumes the same seat', async () => {
    const url = await startServer(1);
    const client = new BoucanClient({ url });
    cleanup.push(() => client.disconnect());
    await client.connect();
    const { playerId } = await client.createRoom({ nickname: 'Résiliente' });
    const statuses: string[] = [];
    client.on('status', (s) => statuses.push(s));
    // Simulate a network drop: the server-side socket dies.
    const transport = (client as unknown as { transport: { close(code: number): void } }).transport;
    transport.close(4999);
    await new Promise((r) => setTimeout(r, 50));
    await waitFor(client, (s) => s.lobby.players[0]!.connection === 'connected' && statuses.includes('connected'), 10_000);
    expect(statuses).toContain('reconnecting');
    expect(client.playerId).toBe(playerId);
    expect(client.snapshot!.lobby.players).toHaveLength(1);
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
    expect(health).toMatchObject({ status: 'ok', protocolVersion: 1 });
    const info = await (await fetch(`${http}/api/info`)).json();
    expect(info.minigames.length).toBeGreaterThan(0);
    expect(info.websocketPath).toBe('/ws');
  });
});

describe('local game (no server)', () => {
  let game: LocalGame | null = null;
  afterEach(() => {
    game?.dispose();
    game = null;
  });

  it('plays a whole match in-process with bots', async () => {
    game = await createLocalGame({ bots: 3, timeScale: 0.08, match: { rounds: 3 } });
    const { client } = game;
    await waitFor(client, (s) => s.lobby.players.length === 4 && s.lobby.players.slice(1).every((p) => p.ready));
    client.on('snapshot', (s) => {
      if (s.match.phase === 'MINIGAME_PREPARING') void client.minigameReady().catch(() => {});
    });
    await client.setReady(true);
    await client.startMatch();
    const final = await waitFor(client, (s) => s.match.phase === 'MATCH_RESULTS', 60_000);
    expect(final.match.final!.standings).toHaveLength(4);
  }, 90_000);
});
