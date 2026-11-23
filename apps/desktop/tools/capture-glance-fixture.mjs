import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [glance, destination] = process.argv.slice(2);
const directory = await mkdtemp(join(tmpdir(), 'focus-rss-'));
const feed = createServer((request, response) => {
  const item = (title, day, path) => `<item><title>${title}</title><link>https://example.com/${path}</link><pubDate>${day} Nov 2026 10:00:00 GMT</pubDate></item>`;
  let type = 'application/rss+xml';
  let body;
  if (request.url === '/atom') {
    type = 'application/atom+xml';
    body = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom fixture</title><id>urn:abc</id><updated>2026-11-21T10:00:00Z</updated><entry><title>Atom story</title><id>urn:story</id><link href="https://example.com/atom"/><updated>2026-11-21T10:00:00Z</updated></entry></feed>`;
  } else if (request.url === '/fail') { response.writeHead(503).end(); return; }
  else {
    body = `<rss version="2.0"><channel><title>RSS fixture</title><link>https://example.com</link>${request.url === '/empty' ? '' : item('Newest &amp; literal &lt;script&gt;', 22, 'new') + item('Old story', 20, 'old') + item('Duplicate', 19, 'new')}</channel></rss>`;
  }
  response.writeHead(200, { 'Content-Type': type }).end(body);
});
feed.listen(0, '127.0.0.1');
await once(feed, 'listening');
const socket = createServer().listen(0, '127.0.0.1');
await once(socket, 'listening');
const { port } = socket.address();
await new Promise(resolve => socket.close(resolve));
const cfg = join(directory, 'glance.yml');
const page = (name, slug, paths) => ({ name, slug, columns: [{ size: 'full', widgets: [{
  type: 'rss', title: 'Reading', limit: 25, 'collapse-after': -1,
  feeds: paths.map(path => ({ url: `http://127.0.0.1:${feed.address().port}/${path}`, ...(path === 'rss' ? { title: 'Renamed fixture' } : {}) })),
}] }] });
await writeFile(cfg, JSON.stringify({ server: { host: '127.0.0.1', port }, pages: [
  page('Reading', 'reading', ['rss', 'atom', 'fail']), page('Empty', 'empty', ['empty']), page('Offline', 'offline', ['fail']),
] }));
const child = spawn(glance, ['--config', cfg], { cwd: directory, stdio: 'inherit' });
try {
  for (let index = 0; index < 50; index++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch { /* starting */ }
    await delay(100);
  }
  for (const [kind, page] of [['partial', 'reading'], ['empty', 'empty'], ['offline', 'offline']]) {
    const res = await fetch(`http://127.0.0.1:${port}/api/pages/${page}/content/`);
    if (!res.ok) throw new Error(`${kind}: ${res.status}`);
    const html = await res.text();
    if (!html.includes('widget-type-rss')) throw new Error(`No RSS widget found: ${kind}`);
    await writeFile(join(destination, `${kind}.html`), html);
  }
} finally {
  child.kill();
  await once(child, 'exit');
  feed.close();
  await rm(directory, { recursive: true, force: true });
}
