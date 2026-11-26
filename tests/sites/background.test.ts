import { afterEach, expect, it, vi } from 'vitest';

const setupUrl = 'chrome-extension://fixture/setup.html';
const credential = { profileId: '9dde51fb-a37a-4e76-9d7f-4cdfb02ddb90', token: 'f'.repeat(64), browser: 'chromium', label: 'Fixture' };
const snapshot = (revision: number, enabled: boolean) => ({ revision, accessibility: { holdSeconds: 15, twoStepConfirmation: false }, sites: [{
  id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
  entry: { mode: 'allow' }, grayscale: false, rules: { 'youtube.hide-shorts': enabled },
}] });

type Request = { id: string; op: string; body: unknown };
type Incoming = { version?: number; body?: object };
function event<Args extends unknown[]>() {
  const listeners: ((...args: Args) => unknown)[] = [];
  return { addListener: (fn: (...args: Args) => unknown) => { listeners.push(fn); }, emit: (...args: Args) => listeners.forEach((fn) => fn(...args)) };
}

async function start(stored: Record<string, unknown>, grants: string[] = []) {
  vi.resetModules();
  const inbox = event<[unknown]>();
  const messages = event<[object, object, (reply: unknown) => void]>();
  const sent: Request[] = [];
  const port = { onMessage: inbox, onDisconnect: event<[]>(), postMessage: (request: Request) => sent.push(request), disconnect() {} };
  vi.stubGlobal('chrome', {
    runtime: { id: 'fixture', onMessage: messages, connectNative: () => port, getURL: () => 'chrome-extension://fixture/' },
    permissions: { getAll: (done: (response: object) => void) => done({ origins: grants }), onAdded: event<[]>(), onRemoved: event<[]>() },
    storage: { local: {
      get: (_keys: string[], done: (response: object) => void) => done({ ...stored }),
      set: (values: object, done: () => void) => { Object.assign(stored, values); done(); },
      remove: (keys: string | string[], done: () => void) => { for (const key of [keys].flat()) delete stored[key]; done(); },
    } },
    scripting: {
      getRegisteredContentScripts: (_query: object, done: (scripts: []) => void) => done([]),
      registerContentScripts: (_scripts: object[], done: () => void) => done(),
    },
    tabs: { query: (_query: object, done: (tabs: []) => void) => done([]) },
    alarms: { onAlarm: event<[]>(), create() {} },
  });
  // Reload the real worker after installing the per-test browser API boundary.
  await import('../../apps/extension/src/background');
  function send(op: string, { body = {}, version = 5 }: Incoming = {}) {
    const request = sent.find((entry) => entry.op === op);
    if (!request) throw new Error(`Missing pending ${op} request`);
    inbox.emit({ v: version, id: request.id, ok: true, body });
  }
  async function waitFor(op: string) {
    await vi.waitFor(() => expect(sent.some((request) => request.op === op)).toBe(true));
  }
  return { send, waitFor, messages };
}

afterEach(() => vi.unstubAllGlobals());

it('keeps the last acknowledged policy durable until the host accepts a newer revision', async () => {
  const stored = { profile: credential, policy: snapshot(0, false), status: 'Disconnected' };
  const bridge = await start(stored);
  await bridge.waitFor('hello'); bridge.send('hello', { body: { revision: 1 } });
  await bridge.waitFor('snapshot'); bridge.send('snapshot', { body: snapshot(1, true) });
  await bridge.waitFor('applied');
  expect(stored.policy).toEqual(snapshot(0, false));
  bridge.send('applied');
  await vi.waitFor(() => expect(stored.policy).toEqual(snapshot(1, true)));
});

it('completes an explicit Connect request with Update required for a mismatched reply', async () => {
  const stored = { status: 'Not connected' };
  const bridge = await start(stored);
  let reply: unknown;
  bridge.messages.emit({ type: 'pair', browser: 'chromium', label: 'Local' }, { id: 'fixture', url: setupUrl }, (value) => { reply = value; });
  await bridge.waitFor('pair_begin'); bridge.send('pair_begin', { version: 1 });
  await vi.waitFor(() => {
    expect(stored.status).toBe('Update required');
    expect(reply).toEqual({ ok: false, error: 'version_mismatch' });
  }, { timeout: 250, interval: 15 });
});

it('reports Update required and preserves the cache when reconnect gets a mismatched reply', async () => {
  const stored = { profile: credential, policy: snapshot(0, false), status: 'Disconnected' };
  const bridge = await start(stored);
  await bridge.waitFor('hello'); bridge.send('hello', { version: 1 });
  await vi.waitFor(() => expect(stored.status).toBe('Update required'), { timeout: 250, interval: 15 });
  expect(stored.policy).toEqual(snapshot(0, false));
});

it.each([{ entry: { mode: 'block' } }, { grayscale: true }])('does not acknowledge an unsupported policy field %o', async (unsupported) => {
  const previous = snapshot(0, true);
  const stored = { profile: credential, policy: previous, status: 'Disconnected' };
  const bridge = await start(stored);
  await bridge.waitFor('hello'); bridge.send('hello', { body: { revision: 1 } });
  await bridge.waitFor('snapshot');
  bridge.send('snapshot', { body: { revision: 1, sites: [{ id: 'youtube', rules: {}, ...unsupported }] } });
  await vi.waitFor(() => expect(stored.status).toBe('Update required'));
  expect(stored.policy).toEqual(previous);
});

it('enables grayscale on the granted short-link alias without affecting adjacent hosts', async () => {
  const saved = snapshot(1, false);
  saved.sites[0].grayscale = true;
  const bridge = await start({ profile: credential, policy: saved }, ['https://youtu.be/*']);
  await bridge.waitFor('hello');
  let result: unknown;
  bridge.messages.emit({ type: 'focus-content-state' }, { url: 'https://youtu.be/watch', frameId: 0, tab: {} }, (value) => { result = value; });
  expect(result).toEqual({ enabled: false, grayscale: true });
  bridge.messages.emit({ type: 'focus-content-state' }, { url: 'https://evil.youtu.be/watch', frameId: 0, tab: {} }, (value) => { result = value; });
  expect(result).toEqual({ enabled: false, grayscale: false });
});

it('dispatches X Following only to a granted canonical, top-level document', async () => {
  const saved = { ...snapshot(1, false), sites: [{
    id: 'x', label: 'X / Twitter', hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
    entry: { mode: 'allow' }, grayscale: false, rules: { 'x.open-following': true },
  }] };
  const bridge = await start({ profile: credential, policy: saved }, ['https://x.com/*', 'https://www.x.com/*']);
  await bridge.waitFor('hello');
  const state = (url: string, frameId = 0) => {
    let result: unknown;
    bridge.messages.emit({ type: 'focus-content-state' }, { url, frameId, tab: {} }, (value) => { result = value; });
    return result;
  };
  expect(state('https://x.com/home')).toMatchObject({ x: 'following' });
  for (const url of ['http://x.com/home', 'https://www.x.com/home', 'https://x.com:8443/home']) {
    expect(state(url)).not.toHaveProperty('x');
  }
  expect(state('https://x.com/home', 1)).not.toHaveProperty('x');
});
