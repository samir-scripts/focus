const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { createServer } = require('node:http');
const { extname, join } = require('node:path');

const sources = require('./sources.json');
const files = new Map(sources.map(({ path, sha256 }) => {
  const bytes = readFileSync(join(__dirname, path));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== sha256) throw new Error('Digest mismatch for ' + path);
  return [path, bytes];
}));
console.log('Verified ' + files.size + ' archived responses.');

const kind = process.argv[2];
if (!kind) process.exit(0);
if (!['desktop', 'sites'].includes(kind)) throw new Error('Use desktop or sites.');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
};
const port = Number(process.argv[3] || 14912);
createServer((request, response) => {
  const route = new URL(request.url, 'http://localhost').pathname;
  const name = kind + (route === '/' ? '/index.html' : route === '/site' ? '/site.html' : route);
  const bytes = files.get(name);
  if (!bytes) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': types[extname(name)] || 'application/octet-stream' }).end(bytes);
}).listen(port, '127.0.0.1', () => console.log(kind + ' at http://127.0.0.1:' + port));
