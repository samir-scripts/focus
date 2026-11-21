import { afterEach, expect, it, vi } from 'vitest';
import { SiteEntry } from '../../apps/extension/src/site-entry';
import type { PolicySnapshot } from '../../apps/extension/src/protocol';
import type { EntryRule } from '../../apps/extension/src/entry-rules';

const page = 'chrome-extension://focus/entry.html#https://www.youtube.com/watch?id=73';
const origins = ['https://www.youtube.com/*'];
const snapshot = (revision: number): PolicySnapshot => ({ revision, sites: [{
  id: 'youtube', label: 'YouTube', hosts: ['www.youtube.com'], grayscale: false, rules: {},
  entry: { mode: 'pause', seconds: 5, frequency: 'page', finish: 'manual' },
}] });

function browser(initial: { id: number; url: string; pendingUrl?: string } = { id: 4, url: page }) {
  let tab = initial;
  let allowed = [...origins];
  let dynamic: EntryRule[] = [];
  let session: EntryRule[] = [];
  let stored = {};
  const event = <T extends unknown[]>() => {
    const listeners: ((...args: T) => void)[] = [];
    return { addListener: (listener: (...args: T) => void) => listeners.push(listener),
      emit: (...args: T) => listeners.forEach(listener => listener(...args)) };
  };
  type Navigation = { tabId: number; frameId: number; url: string };
  const before = event<[Navigation]>();
  const commit = event<[Navigation]>();
  const error = event<[Navigation]>();
  const removed = event<[number]>();
  const api = {
    runtime: { getURL: () => 'chrome-extension://focus/entry.html' },
    webNavigation: { onBeforeNavigate: before, onCommitted: commit, onErrorOccurred: error, onHistoryStateUpdated: event<[Navigation]>() },
    tabs: { onRemoved: removed, get: async () => tab, query: async () => [tab], update: async (_id: number, next: { url: string }) => (tab = { ...tab, ...next }), remove: async () => { removed.emit(tab.id); }, goBack: async () => {} },
    scripting: { insertCSS: async () => {}, removeCSS: async () => {} },
    storage: { session: { get: async () => stored, set: async (next: object) => { stored = structuredClone(next); } } },
    permissions: { getAll: async () => ({ origins: allowed }) },
    declarativeNetRequest: {
      getDynamicRules: async () => dynamic, getSessionRules: async () => session,
      updateDynamicRules: async ({ addRules = [] }: { addRules?: EntryRule[] }) => { dynamic = addRules; },
      updateSessionRules: async ({ addRules = [] }: { addRules?: EntryRule[] }) => { session = addRules; },
    },
  };
  const tasks: (() => Promise<void>)[] = [];
  return {
    api, before, commit, error, removed, newWorker: () => new SiteEntry(api, task => tasks.push(task)),
    drain: async () => { for (let task; (task = tasks.shift());) await task(); },
    read: () => tab.url, revoke: () => { allowed = []; },
  };
}

afterEach(() => vi.restoreAllMocks());

it('refuses stale nonce and revoked permission even after the background deadline', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const fake = browser();
  const entry = new SiteEntry(fake.api, () => {});
  await entry.reconcile(snapshot(1), origins);
  const sender = { frameId: 0, url: page, tab: { id: 4 } };
  const pending = await entry.message({ type: 'entry-view' }, sender);
  now = 5000;
  await entry.message({ type: 'entry-continue', nonce: 'stale' }, sender);
  expect(fake.read()).toBe(page);
  fake.revoke();
  await entry.message({ type: 'entry-continue', nonce: pending.nonce }, sender);
  expect(fake.read()).toBe(page);
});

it('requires a new countdown when the policy revision changes', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const fake = browser();
  const entry = new SiteEntry(fake.api, () => {});
  await entry.reconcile(snapshot(1), origins);
  const sender = { frameId: 0, url: page, tab: { id: 4 } };
  const first = await entry.message({ type: 'entry-view' }, sender);
  now = 5000;
  await entry.reconcile(snapshot(2), origins);
  await entry.message({ type: 'entry-continue', nonce: first.nonce }, sender);
  expect(fake.read()).toBe(page);
  const second = await entry.message({ type: 'entry-view' }, sender);
  expect(second.nonce).not.toBe(first.nonce);
  expect(second.remaining).toBe(5000);
});

it('does not resume before the deadline and accepts the nonce only on its own entry page', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const fake = browser();
  const entry = new SiteEntry(fake.api, () => {});
  await entry.reconcile(snapshot(1), origins);
  const sender = { frameId: 0, url: page, tab: { id: 4 } };
  const pending = await entry.message({ type: 'entry-view' }, sender);
  now = 4999;
  await entry.message({ type: 'entry-continue', nonce: pending.nonce }, sender);
  expect(fake.read()).toBe(page);
  now = 5000;
  await entry.message({ type: 'entry-continue', nonce: pending.nonce }, { ...sender, frameId: 1 });
  expect(fake.read()).toBe(page);
  await entry.message({ type: 'entry-continue', nonce: pending.nonce }, sender);
  expect(fake.read()).toBe('https://www.youtube.com/watch?id=73');
  await entry.message({ type: 'entry-continue', nonce: pending.nonce }, sender);
  expect(fake.read()).toBe('https://www.youtube.com/watch?id=73');
});

it('does not replace an already-open page when a newer navigation is pending', async () => {
  const original = 'https://www.youtube.com/watch?id=old';
  const fake = browser({ id: 4, url: original, pendingUrl: 'https://www.youtube.com/watch?id=new' });
  const entry = new SiteEntry(fake.api, () => {});
  await entry.reconcile(snapshot(1), origins);
  expect(fake.read()).toBe(original);
});

it('consumes the single-page pass on a navigation error, without accepting a stale Continue', async () => {
  const target = 'https://www.youtube.com/watch?id=73';
  const sender = { frameId: 0, url: page, tab: { id: 4 } };
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const fake = browser();
  const entry = fake.newWorker();
  await entry.reconcile(snapshot(1), origins);
  const pending = await entry.message({ type: 'entry-view' }, sender);
  now = 5000;
  await entry.message({ type: 'entry-continue', nonce: pending.nonce }, sender);
  expect(await fake.api.declarativeNetRequest.getSessionRules()).toHaveLength(1);
  fake.before.emit({ tabId: 4, frameId: 0, url: target });
  fake.error.emit({ tabId: 4, frameId: 0, url: target });
  await fake.drain();
  expect(await fake.api.declarativeNetRequest.getSessionRules()).toHaveLength(0);
});

it('starts a fresh timer when a worker wakes with an ambiguous pending countdown', async () => {
  const sender = { frameId: 0, url: page, tab: { id: 4 } };
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const fake = browser();
  const policy = snapshot(1);
  const entry = fake.newWorker();
  await entry.reconcile(policy, origins);
  const previous = await entry.message({ type: 'entry-view' }, sender);
  now = 5000;
  const restarted = fake.newWorker();
  await restarted.reconcile(policy, origins);
  await restarted.message({ type: 'entry-continue', nonce: previous.nonce }, sender);
  expect(fake.read()).toBe(page);
  const pending = await restarted.message({ type: 'entry-view' }, sender);
  expect(pending.nonce).not.toBe(previous.nonce);
  expect(pending.remaining).toBe(5000);
});

it('ends a visit at the site boundary and does not leave a pass in another tab', async () => {
  const target = 'https://www.youtube.com/watch?id=73';
  const sender = { frameId: 0, url: page, tab: { id: 4 } };
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const fake = browser();
  const policy = snapshot(1);
  policy.sites[0].entry = { mode: 'pause', seconds: 5, frequency: 'visit', finish: 'manual' };
  const entry = fake.newWorker();
  await entry.reconcile(policy, origins);
  const pending = await entry.message({ type: 'entry-view' }, sender);
  now = 5000;
  await entry.message({ type: 'entry-continue', nonce: pending.nonce }, sender);
  const event = { tabId: 4, frameId: 0, url: target };
  fake.before.emit(event);
  fake.commit.emit(event);
  await fake.drain();
  expect((await fake.api.declarativeNetRequest.getSessionRules())[0].condition.tabIds).toEqual([4]);
  fake.before.emit({ ...event, url: 'https://other.example/' });
  await fake.drain();
  expect(await fake.api.declarativeNetRequest.getSessionRules()).toHaveLength(0);
});
