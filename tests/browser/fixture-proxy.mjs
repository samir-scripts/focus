import { execFile } from 'node:child_process';
import { createHash, createPublicKey } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { connect } from 'node:net';
import { join } from 'node:path';
import { promisify } from 'node:util';

const hosts = ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be', 'outside.test'];
const loopback = '127.0.0.1';
const execFileAsync = promisify(execFile);

// HTTPS upgrades are normal for YouTube. Give only these disposable profiles
// trust in the fixture and never dial the hostname supplied by a browser.
export async function startFixtureProxy(fixturePath, directory, extraFixtures = {}, viewerFixturePath) {
  const fixture = await readFile(fixturePath);
  const extra = new Map(await Promise.all(Object.entries(extraFixtures).map(async ([name, path]) => [name, await readFile(path)])));
  const viewerFixture = viewerFixturePath && await readFile(viewerFixturePath);
  const fixtureHosts = [...hosts, ...extra.keys()];
  const firefoxProfile = join(directory, 'firefox-trust');
  await mkdir(firefoxProfile);
  const openssl = (...args) => execFileAsync('openssl', args, { cwd: directory, timeout: 30000 });
  await openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
    '-subj', '/CN=focus disposable fixture CA', '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign', '-keyout', 'ca.key', '-out', 'ca.pem');
  await openssl('req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=www.youtube.com',
    '-keyout', 'server.key', '-out', 'server.csr');
  await writeFile(join(directory, 'extensions.cnf'), [
    'basicConstraints=critical,CA:FALSE', 'extendedKeyUsage=serverAuth',
    'subjectAltName=' + fixtureHosts.map(host => 'DNS:' + host).join(','), '',
  ].join('\n'));
  await openssl('x509', '-req', '-in', 'server.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key',
    '-CAcreateserial', '-days', '2', '-extfile', 'extensions.cnf', '-out', 'server.pem');
  const database = 'sql:' + firefoxProfile;
  await execFileAsync('certutil', ['-N', '-d', database, '--empty-password'], { timeout: 30000 });
  await execFileAsync('certutil', ['-A', '-d', database, '-n', 'focus fixture', '-t', 'C,,', '-i', join(directory, 'ca.pem')], { timeout: 30000 });
  const key = await readFile(join(directory, 'server.key'));
  const cert = await readFile(join(directory, 'server.pem'));
  const spki = createHash('sha256').update(createPublicKey(cert).export({ format: 'der', type: 'spki' })).digest('base64');

  const documents = new Map();
  function serve(request, response) {
    let url;
    try { url = new URL(request.url, 'https://' + request.headers.host); } catch { /* deny malformed requests */ }
    if (!url || !fixtureHosts.includes(url.hostname) || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(403).end();
      return;
    }
    if (url.hostname === 'outside.test' && url.pathname.startsWith('/unrelated-block-control-')) {
      request.socket.destroy();
      return;
    }
    if (url.pathname === '/fixture-worker.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' }).end(`
        self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
        self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
        self.addEventListener('fetch', event => {
          if (event.request.mode === 'navigate' && new URL(event.request.url).pathname === '/worker-navigation') {
            event.respondWith(new Response('<!doctype html><title>Worker response</title>', { headers: { 'Content-Type': 'text/html' } }));
          }
        });
      `);
      return;
    }
    if (request.headers['sec-fetch-dest'] === 'document') {
      const key = url.hostname + url.pathname + url.search;
      documents.set(key, (documents.get(key) ?? 0) + 1);
    }
    if (url.hostname === 'youtu.be' && url.pathname === '/fixture-redirect') {
      response.writeHead(302, { Location: `https://www.youtube.com/watch${url.search}`, 'Cache-Control': 'no-store' }).end();
      return;
    }
    const body = viewerFixture && url.searchParams.get('focus-viewer') === '1' &&
      ['www.youtube.com', 'www.instagram.com', 'www.tiktok.com'].includes(url.hostname)
      ? viewerFixture : extra.get(url.hostname) ?? fixture;
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(body);
  }
  const tls = httpsServer({ key, cert }, serve);
  const proxy = httpServer(serve);
  const connections = new Set();
  for (const server of [tls, proxy]) {
    server.on('connection', socket => {
      connections.add(socket);
      socket.on('close', () => connections.delete(socket));
    });
  }
  const listen = server => new Promise((resolve, reject) => {
    server.once('error', reject).listen(0, loopback, resolve);
  });
  async function close() {
    for (const socket of connections) socket.destroy();
    await Promise.all([tls, proxy].filter(server => server.listening).map(server => new Promise(resolve => server.close(resolve))));
  }
  try {
    await listen(tls);
    proxy.on('connect', (request, client, head) => {
      if (!fixtureHosts.some(host => request.url === host + ':443')) {
        client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        return;
      }
      const upstream = connect(tls.address().port, loopback, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        client.pipe(upstream).pipe(client);
      });
      for (const [a, b] of [[client, upstream], [upstream, client]]) {
        a.on('error', () => b.destroy());
        a.on('close', () => b.destroy());
      }
    });
    await listen(proxy);
    return { port: proxy.address().port, spki, firefoxProfile, close, documents: (host, path) => documents.get(host + path) ?? 0 };
  } catch (error) {
    await close();
    throw error;
  }
}
