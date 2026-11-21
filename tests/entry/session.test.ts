import { afterEach, expect, it, vi } from 'vitest';
import { SiteEntry } from '../../apps/extension/src/site-entry';
import type { PolicySnapshot } from '../../apps/extension/src/protocol';

const page = 'chrome-extension://focus/entry.html#https://www.youtube.com/watch?id=73';
const origins = ['https://www.youtube.com/*'];
const snapshot = (revision: number): PolicySnapshot => ({ revision, sites: [{
  id: 'youtube', label: 'YouTube', hosts: ['www.youtube.com'], grayscale: false, rules: {},
  entry: { mode: 'pause', seconds: 5, frequency: 'page', finish: 'manual' },
}] });

function browser(initial: { id: number; url: string; pendingUrl?: string } = { id: 4, url: page }) {
  let tab = initial;
  let allowed = [...origins];
  let dynamic: object[] = [];
  let session: object[] = [];
  const event = { addListener: () => {} };
  const api = {
    runtime: { getURL: () => 'chrome-extension://focus/entry.html' },
    webNavigation: { onBeforeNavigate: event, onCommitted: event, onErrorOccurred: event, onHistoryStateUpdated: event },
    tabs: { onRemoved: event, get: async () => tab, query: async () => [tab], update: async (_id: number, next: { url: string }) => (tab = { ...tab, ...next }), remove: async () => {}, goBack: async () => {} },
    scripting: { insertCSS: async () => {}, removeCSS: async () => {} },
    storage: { session: { get: async () => ({}), set: async () => {} } },
    permissions: { getAll: async () => ({ origins: allowed }) },
    declarativeNetRequest: {
      getDynamicRules: async () => dynamic, getSessionRules: async () => session,
      updateDynamicRules: async ({ addRules = [] }: { addRules?: object[] }) => { dynamic = addRules; },
      updateSessionRules: async ({ addRules = [] }: { addRules?: object[] }) => { session = addRules; },
    },
  };
  return { api, read: () => tab.url, revoke: () => { allowed = []; } };
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
