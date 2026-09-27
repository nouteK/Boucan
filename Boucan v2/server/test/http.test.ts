import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSettings } from '../src/config/env';
import { silentLogger } from '../src/engine/logger';
import { parseRange } from '../src/transport/static';
import { createBoucanServer, type BoucanServer } from '../src/transport/ws-server';

/** HTTP side of the production server: serving the built client. */

let server: BoucanServer;
let base: string;
let dir: string;
const audio = Buffer.alloc(1000, 7);

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'boucan-static-'));
  mkdirSync(join(dir, 'assets', 'music'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>BOUCAN</title>');
  writeFileSync(join(dir, 'assets', 'music', 'menu.mp3'), audio);
  writeFileSync(join(dir, 'assets', 'index-AbCdEf12.js'), 'console.log(1)');
  const settings = loadSettings({ NODE_ENV: 'test', PORT: '0', HOST: '127.0.0.1' });
  server = createBoucanServer({ settings, logger: silentLogger, staticDir: dir });
  const { url } = await server.listen();
  base = url.replace(/^ws/, 'http').replace(/\/ws$/, '');
});

afterAll(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Raw request (fetch would normalise the path). */
function raw(path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = request(`${base}${path}`, { headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('static client', () => {
  it('serves the page, and the page for unknown routes', async () => {
    for (const path of ['/', '/room/BCDF']) {
      const res = await raw(path);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.body.toString()).toContain('BOUCAN');
    }
  });

  it('caches hashed bundles forever, everything else is revalidated', async () => {
    expect((await raw('/assets/index-AbCdEf12.js')).headers['cache-control']).toMatch(/immutable/);
    expect((await raw('/assets/music/menu.mp3')).headers['cache-control']).toBe('no-cache');
  });

  it('answers 404 for a missing asset', async () => {
    expect((await raw('/assets/nope.js')).status).toBe(404);
  });

  it('survives a malformed URL (no crash)', async () => {
    expect((await raw('/%E0%A4%A')).status).toBe(404);
    expect((await raw('/health')).status).toBe(200);
  });

  it('never serves files outside the client directory', async () => {
    const res = await raw('/..%2f..%2fpackage.json');
    expect(res.status).toBe(404);
  });

  it('serves byte ranges (Safari needs them to play audio)', async () => {
    const full = await raw('/assets/music/menu.mp3');
    expect(full.status).toBe(200);
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(Number(full.headers['content-length'])).toBe(audio.length);

    const part = await raw('/assets/music/menu.mp3', { Range: 'bytes=0-99' });
    expect(part.status).toBe(206);
    expect(part.headers['content-range']).toBe(`bytes 0-99/${audio.length}`);
    expect(part.body.length).toBe(100);

    const tail = await raw('/assets/music/menu.mp3', { Range: 'bytes=-10' });
    expect(tail.status).toBe(206);
    expect(tail.headers['content-range']).toBe(`bytes 990-999/${audio.length}`);

    const beyond = await raw('/assets/music/menu.mp3', { Range: 'bytes=5000-' });
    expect(beyond.status).toBe(416);
    expect(beyond.headers['content-range']).toBe(`bytes */${audio.length}`);
  });
});

describe('settings', () => {
  it('treats the empty values of .env.example as unset', () => {
    const s = loadSettings({ CLIENT_DIR: '', ALLOWED_ORIGINS: '', BOUCAN_MICROGAMES: '', TRUST_PROXY: '' });
    expect(s.clientDir).toBeNull();
    expect(s.allowedOrigins).toBeNull();
    expect(s.game.microgames.enabled).toBeNull();
    expect(s.trustProxy).toBe(false);
  });

  it('reads TRUST_PROXY', () => {
    expect(loadSettings({ TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(loadSettings({ TRUST_PROXY: '1' }).trustProxy).toBe(true);
    expect(loadSettings({ TRUST_PROXY: 'false' }).trustProxy).toBe(false);
  });
});

describe('parseRange', () => {
  it('reads single ranges and ignores what it does not support', () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange('bytes=-20', 100)).toEqual({ start: 80, end: 99 });
    expect(parseRange('bytes=0-9,20-29', 100)).toBeNull();
    expect(parseRange('bytes=-', 100)).toBe('invalid');
    expect(parseRange('bytes=9-2', 100)).toBe('invalid');
    expect(parseRange('bytes=100-', 100)).toBe('invalid');
  });
});
