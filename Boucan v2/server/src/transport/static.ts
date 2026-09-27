import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

/**
 * Serves the built client (client/dist) so production is a single process:
 * the game page and the WebSocket on the same port. Unknown paths fall back
 * to index.html. Returns false when the request is not for a static file.
 * Supports byte ranges (Safari only plays audio served with 206 responses).
 */
export function createStaticHandler(dir: string): ((req: IncomingMessage, res: ServerResponse) => boolean) | null {
  const root = resolve(dir);
  if (!existsSync(join(root, 'index.html'))) return null;
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let url: string;
    try {
      url = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    } catch {
      return false; // malformed escape → 404 by the caller
    }
    let file = normalize(join(root, url));
    if (!file.startsWith(root + sep) && file !== root) return false;
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (extname(url)) return false; // missing asset → 404 by the caller
      file = join(root, 'index.html');
    }
    const size = statSync(file).size;
    const immutable = file.includes(`${sep}assets${sep}`) && /-[A-Za-z0-9_-]{8}\./.test(file);
    const headers = {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'Accept-Ranges': 'bytes',
    };
    const range = parseRange(req.headers.range, size);
    if (range === 'invalid') {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
      res.end();
      return true;
    }
    if (range) {
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': range.end - range.start + 1 });
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': size });
    }
    if (req.method === 'HEAD') res.end();
    else createReadStream(file, range ?? {}).on('error', () => res.destroy()).pipe(res);
    return true;
  };
}

/** Single byte range ("bytes=0-99", "bytes=100-", "bytes=-500"); null = whole file. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | 'invalid' {
  const m = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null; // absent, or multi-range: serve the whole file
  const [, a, b] = m;
  if (!a && !b) return 'invalid';
  let start: number;
  let end: number;
  if (!a) {
    start = Math.max(0, size - Number(b));
    end = size - 1;
  } else {
    start = Number(a);
    end = b ? Math.min(Number(b), size - 1) : size - 1;
  }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}
