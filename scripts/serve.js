import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUpdateAndLog } from './update.js';

const PUBLIC_DIR = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export function resolveStaticPath(publicDir, rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://localhost').pathname);
  } catch {
    return { status: 400 };
  }
  if (pathname.includes('\0')) return { status: 400 };
  if (pathname.endsWith('/')) pathname += 'index.html';
  const rel = path.posix.normalize(pathname).replace(/^\/+/, '');
  const file = path.resolve(publicDir, rel);
  if (!(file === publicDir || file.startsWith(publicDir + path.sep))) return { status: 404 };
  return { status: 200, file };
}

function send(res, status, body, type = 'text/plain; charset=utf-8', headOnly = false) {
  res.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(headOnly ? undefined : body);
}

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method not allowed');
  }
  const headOnly = req.method === 'HEAD';
  const r = resolveStaticPath(PUBLIC_DIR, req.url);
  if (r.status === 400) return send(res, 400, 'Bad request', undefined, headOnly);
  if (r.status === 404) return send(res, 404, 'Not found', undefined, headOnly);
  let st;
  try {
    st = await stat(r.file);
  } catch {
    return send(res, 404, 'Not found', undefined, headOnly);
  }
  if (!st.isFile()) return send(res, 404, 'Not found', undefined, headOnly);
  const body = await readFile(r.file);
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[path.extname(r.file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(headOnly ? undefined : body);
}

if (import.meta.main) {
  const port = Number(process.env.PORT) || 4176;
  await runUpdateAndLog();
  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) send(res, 500, 'Internal error');
      else res.destroy();
    });
  });
  server.listen(port, '127.0.0.1', () => console.log(`Serving http://127.0.0.1:${port}`));
  setInterval(runUpdateAndLog, REFRESH_INTERVAL_MS);
}
