import { catalog } from './sites/catalog';
import { grantedOrigins, siteOrigins } from './permissions';
import { validSnapshot, type Snapshot } from './protocol';

declare const chrome: any;
const api = chrome;
const host = 'com.focus_local.bridge';
const scriptId = 'focus-youtube';
type Profile = { profileId: string; browser: string; label: string; token: string };
let profile: Profile | undefined;
let policy: Snapshot | undefined;
let activeOrigins = new Set<string>();
let port: any;
let ready: Promise<void>;
let nextId = 0;
let pending = new Map<string, { resolve: (body: any) => void; reject: (error: Error) => void }>();
let serial = Promise.resolve();
let connecting = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function call(object: any, method: string, ...args: any[]): Promise<any> {
  return new Promise((resolve, reject) => object[method](...args, (result: any) => {
    const error = api.runtime.lastError;
    if (error) reject(new Error(error.message)); else resolve(result);
  }));
}
async function setStatus(value: string) {
  await call(api.storage.local, 'set', { status: value });
}
function request(op: string, body: object): Promise<any> {
  if (!port) return Promise.reject(new Error('disconnected'));
  const id = String(++nextId);
  const { promise, resolve, reject } = Promise.withResolvers<any>();
  pending.set(id, { resolve, reject });
  try { port.postMessage({ v: 1, id, op, body }); } catch { pending.delete(id); reject(new Error('disconnected')); }
  return promise;
}

function settleReply(message: unknown) {
  if (!message || typeof message !== 'object' || !('id' in message) || typeof message.id !== 'string') return;
  const wait = pending.get(message.id);
  if (!wait) return;
  pending.delete(message.id);
  if (!('v' in message) || message.v !== 1) wait.reject(new Error('version_mismatch'));
  else if ('ok' in message && message.ok === true && 'body' in message
    && message.body && typeof message.body === 'object' && !Array.isArray(message.body)) {
    wait.resolve(message.body);
  } else {
    const error = 'error' in message ? message.error : undefined;
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'version_mismatch';
    wait.reject(new Error(code));
  }
}
function queue(task: () => Promise<void>) {
  serial = serial.then(task, task).catch(async (error) => {
    if (error instanceof Error && error.message === 'version_mismatch') {
      await setStatus('Update required');
      return;
    }
    port?.disconnect();
    port = undefined;
    await setStatus('Disconnected');
    retry();
  });
  return serial;
}
function retry() {
  if (!profile || retryTimer) return;
  retryTimer = setTimeout(() => { retryTimer = undefined; void connect(); }, 2000);
  api.alarms.create('focus-reconnect', { delayInMinutes: 0.5 });
}
async function clearPairing(message: string) {
  profile = undefined; policy = undefined;
  await call(api.storage.local, 'remove', ['profile', 'policy']);
  await reconcile();
  await setStatus(message);
}
async function reconcile() {
  const permissions = await call(api.permissions, 'getAll');
  const grants = grantedOrigins(permissions.origins ?? []);
  const enabled = !!profile && !!policy?.sites.find((site) => site.id === 'youtube')?.rules['youtube.hide-shorts'];
  const filterOrigins = siteOrigins('youtube').filter((origin) => !origin.includes('://youtu.be/') && grants.includes(origin));
  const active = enabled ? filterOrigins : [];
  const previouslyActive = activeOrigins;
  activeOrigins = new Set(active);
  const registered = await call(api.scripting, 'getRegisteredContentScripts', { ids: [scriptId] });
  if (registered.length) await call(api.scripting, 'unregisterContentScripts', { ids: [scriptId] });
  if (active.length) await call(api.scripting, 'registerContentScripts', [{ id: scriptId, matches: active, css: ['youtube.css'], js: ['content.js'], runAt: 'document_start', allFrames: false, persistAcrossSessions: true }]);
  const tabs = await call(api.tabs, 'query', {});
  for (const tab of tabs) {
    if (!tab.id || tab.incognito) continue;
    let origin: string | undefined;
    try { const url = new URL(tab.url); origin = `${url.protocol}//${url.hostname}/*`; } catch { /* non-web tab */ }
    const matches = origin !== undefined && activeOrigins.has(origin);
    const target = { tabId: tab.id };
    try {
      if (matches) {
        await call(api.scripting, 'insertCSS', { target, files: ['youtube.css'] });
        await call(api.scripting, 'executeScript', { target, files: ['content.js'] });
      }
      await call(api.tabs, 'sendMessage', tab.id, { type: 'focus-policy', enabled: matches });
      if (!matches && origin && previouslyActive.has(origin) && grants.includes(origin)) {
        await call(api.scripting, 'removeCSS', { target, files: ['youtube.css'] });
      }
    } catch (error) {
      if (!matches) continue;
      const current = await call(api.tabs, 'get', tab.id).catch(() => undefined);
      if (current?.url === tab.url) throw error;
    }
  }
  return grants.filter((origin) => catalog.some((site) => siteOrigins(site.id).includes(origin)));
}
async function sync() {
  if (!port || !profile) return;
  const body = await request('snapshot', { afterRevision: policy?.revision ?? null });
  if (body.sites !== undefined) {
    if (!validSnapshot(body)) { await setStatus('Update required'); return; }
    const previous = policy;
    policy = body;
    try {
      const grants = await reconcile();
      await request('applied', { revision: policy.revision, origins: grants });
    } catch (error) {
      policy = previous;
      await reconcile();
      throw error;
    }
    await call(api.storage.local, 'set', { policy });
  } else {
    if (!policy || body.revision !== policy.revision) { await setStatus('Update required'); return; }
    const grants = await reconcile();
    await request('applied', { revision: policy.revision, origins: grants });
  }
  await setStatus('Connected');
}
async function connect() {
  if (!profile || connecting || port) return;
  connecting = true;
  try {
    const current = api.runtime.connectNative(host);
    port = current;
    current.onMessage.addListener((message: any) => {
      if (current !== port) return;
      if (message?.v === 1 && message.event === 'revoked') {
        queue(async () => { current.disconnect(); await clearPairing('Not connected'); });
      } else if (message?.v === 1 && message.event === 'revision') {
        queue(sync);
      } else {
        settleReply(message);
      }
    });
    current.onDisconnect.addListener(() => {
      if (port !== current) return;
      port = undefined;
      for (const wait of pending.values()) wait.reject(new Error('disconnected'));
      pending.clear();
      if (profile) { void setStatus('Disconnected'); retry(); }
    });
    await request('hello', { profileId: profile.profileId, token: profile.token });
    await queue(sync);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'disconnected';
    if (code === 'unpaired' || code === 'unauthorized' || code === 'pair_denied') {
      port?.disconnect(); port = undefined; await queue(() => clearPairing(code === 'pair_denied' ? 'Pairing denied' : 'Not connected'));
    } else if (code === 'version_mismatch') { await setStatus('Update required'); }
    else if (code === 'pair_pending') { await setStatus('Confirm pairing in focus.'); port?.disconnect(); port = undefined; retry(); }
    else { port?.disconnect(); port = undefined; await setStatus('Disconnected'); retry(); }
  } finally { connecting = false; }
}
async function begin(browser: string, label: string) {
  if (!['chrome', 'chromium', 'brave', 'firefox', 'zen'].includes(browser) || !label.trim()) throw new Error('Choose a browser and enter a profile label');
  if (profile) throw new Error('This profile is already connected or awaiting approval');
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  profile = { profileId: crypto.randomUUID(), browser, label: label.trim(), token };
  await call(api.storage.local, 'set', { profile });
  let current;
  try { current = api.runtime.connectNative(host); }
  catch (error) { await queue(() => clearPairing('Not connected')); throw error; }
  port = current;
  current.onMessage.addListener((message: unknown) => { if (port === current) settleReply(message); });
  current.onDisconnect.addListener(() => { if (port !== current) return; port = undefined; for (const wait of pending.values()) wait.reject(new Error('disconnected')); pending.clear(); });
  try { await request('pair_begin', profile); }
  catch (error) {
    const incompatible = error instanceof Error && error.message === 'version_mismatch';
    port = undefined;
    current.disconnect();
    await queue(() => clearPairing(incompatible ? 'Update required' : 'Not connected'));
    throw error;
  }
  current.disconnect(); port = undefined;
  await setStatus('Confirm pairing in focus.');
  void connect();
}
api.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (value: any) => void) => {
  if (message?.type === 'focus-content-state') {
    const url = sender.url;
    let enabled = false;
    try {
      const parsed = new URL(url);
      enabled = !sender.tab?.incognito && activeOrigins.has(`${parsed.protocol}//${parsed.hostname}/*`);
    } catch { /* not a web document */ }
    sendResponse({ enabled }); return;
  }
  if (sender.id !== api.runtime.id || !sender.url?.startsWith(api.runtime.getURL(''))) return;
  if (message?.type === 'pair') {
    ready.then(() => begin(message.browser, message.label)).then(() => sendResponse({ ok: true }), (error) => sendResponse({ ok: false, error: error.message })); return true;
  }
  if (message?.type === 'open-desktop') {
    ready.then(() => request('open_desktop', { siteId: message.siteId ?? null })).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false })); return true;
  }
  if (message?.type === 'permissions-changed') { queue(async () => { const origins = await reconcile(); if (port && policy) await request('applied', { revision: policy.revision, origins }); }); sendResponse({ ok: true }); }
});
api.permissions.onAdded.addListener(() => queue(async () => { const origins = await reconcile(); if (port && policy) await request('applied', { revision: policy.revision, origins }); }));
api.permissions.onRemoved.addListener(() => queue(async () => { const origins = await reconcile(); if (port && policy) await request('applied', { revision: policy.revision, origins }); }));
api.alarms.onAlarm.addListener((alarm: any) => { if (alarm.name === 'focus-reconnect') void connect(); });
ready = (async () => {
  const stored = await call(api.storage.local, 'get', ['profile', 'policy']);
  profile = stored.profile;
  policy = validSnapshot(stored.policy) ? stored.policy : undefined;
  await queue(async () => { await reconcile(); });
  if (profile) await connect(); else await setStatus('Not connected');
})();
