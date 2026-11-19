// A tiny static server for game/ (Node 22, standard library only), so an entry can be played
// locally at http://localhost:8080. Usage: node serve.ts [--port 8080]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, normalize, extname } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const gameDir = resolve(import.meta.dirname ?? '.', 'game');
const args = process.argv.slice(2);
let port = 8080;
const portIdx = args.indexOf('--port');
if (portIdx >= 0 && args[portIdx + 1]) port = Number.parseInt(args[portIdx + 1], 10) || 8080;

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = normalize(join(gameDir, rel));
  if (!file.startsWith(gameDir + '/') && file !== gameDir) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden\n');
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found\n');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

server.listen(port, () => {
  console.log(`Solmar Bay serving game/ at http://localhost:${port}`);
});
