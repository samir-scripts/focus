// Run against the desktop dev server. CHROME_BIN selects an installed Chromium browser.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const executable = process.env.CHROME_BIN ?? (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const profile = await mkdtemp(join(tmpdir(), 'focus-motion-'));
const browser = spawn(executable, ['--headless', '--disable-background-networking', '--no-first-run',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'],
{ stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const lines = createInterface({ input: browser.stderr });
    lines.on('line', line => {
      const match = line.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { lines.close(); resolve(new URL(match[1]).host); }
    });
    browser.once('error', reject);
    browser.once('exit', () => reject(new Error('Chromium exited before debugger startup')));
  });
  const targets = await (await fetch('http://' + endpoint + '/json/list')).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await once(socket, 'open');
  let nextId = 0;
  async function command(method, params = {}) {
    const id = ++nextId;
    const response = new Promise((resolve, reject) => {
      function receive({ data }) {
        const message = JSON.parse(data);
        if (message.id !== id) return;
        socket.removeEventListener('message', receive);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
      socket.addEventListener('message', receive);
    });
    socket.send(JSON.stringify({ id, method, params }));
    return response;
  }
  async function evaluate(expression) {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true });
    assert.equal(response.exceptionDetails, undefined, response.exceptionDetails?.text);
    return response.result.value;
  }
  async function until(expression) {
    const deadline = Date.now() + 10000;
    while (!await evaluate(expression)) {
      assert(Date.now() < deadline, 'Timed out waiting for ' + expression);
      await new Promise(resolve => setTimeout(resolve, 60));
    }
  }
  await command('Page.navigate', { url: 'http://localhost:1420/' });
  const drift = "document.getAnimations().filter(a => a.animationName?.includes('drift-toner'))";
  await until(drift + ".some(a => a.playState === 'running')");
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await until(drift + '.length === 0');
  await command('Emulation.setEmulatedMedia', { features: [] });
  await until(drift + ".some(a => a.playState === 'running')");
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
  await until("getComputedStyle(document.querySelector('main .stock')).display === 'none'");
  await until(drift + '.length === 0');
  console.log('Toner follows live reduced-motion and forced-colors changes.');
} finally {
  socket?.close();
  if (browser.pid && browser.exitCode === null && browser.signalCode === null) {
    const stopped = once(browser, 'exit');
    browser.kill();
    await stopped;
  }
  await rm(profile, { recursive: true, force: true });
}
