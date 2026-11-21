import { afterEach, expect, it, vi } from 'vitest';
import { SiteEntry } from '../../apps/extension/src/site-entry';
import type { PolicySnapshot } from '../../apps/extension/src/protocol';
import type { EntryRule } from '../../apps/extension/src/entry-rules';

const page = 'chrome-extension://focus/entry.html#https://www.youtube.com/watch?id=73';
const origins = ['https://www.youtube.com/*'];
const snapshot = (revision: number): PolicySnapshot => ({ revision, accessibility: { holdSeconds: 15, twoStepConfirmation: false }, sites: [{
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
    webNavigation: { onBeforeNavigate: before, onCommitted: commit, onErrorOccurred: error, onHistoryStateUpdated: event<[Navigation]>(),
      getFrame: async () => ({ url: tab.url }) },
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
    api, before, commit, error, removed, newWorker: (engine: 'chromium' | 'firefox' = 'chromium') => new SiteEntry(api, task => tasks.push(task), engine),
    drain: async () => { for (let task; (task = tasks.shift());) await task(); },
    read: () => tab.url, revoke: () => { allowed = []; },
    setUrl: (url: string) => { tab = { ...tab, url }; },
  };
}

afterEach(() => vi.restoreAllMocks());

it('refuses stale nonce and revoked permission even after the background deadline', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const fake = browser();
  const entry = new SiteEntry(fake.api, () => {}, 'firefox');
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
  const entry = new SiteEntry(fake.api, () => {}, 'firefox');
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
  const entry = new SiteEntry(fake.api, () => {}, 'firefox');
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

it('retains a page pass across duplicate before-navigation events for one destination', async () => {
  const target = 'https://www.youtube.com/watch?id=73';
  const sender = { frameId: 0, url: page, tab: { id: 4 } };
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const fake = browser();
  const entry = fake.newWorker('firefox');
  await entry.reconcile(snapshot(1), origins);
  const pending = await entry.message({ type: 'entry-view' }, sender);
  now = 5000;
  await entry.message({ type: 'entry-continue', nonce: pending.nonce }, sender);
  const nav = { tabId: 4, frameId: 0, url: target };
  fake.before.emit(nav);
  fake.before.emit(nav);
  fake.commit.emit(nav);
  await fake.drain();
  expect(fake.read()).toBe(target);
  expect(await fake.api.declarativeNetRequest.getSessionRules()).toHaveLength(0);
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
  const entry = fake.newWorker('firefox');
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
  const entry = fake.newWorker('firefox');
  await entry.reconcile(policy, origins);
  const previous = await entry.message({ type: 'entry-view' }, sender);
  now = 5000;
  const restarted = fake.newWorker('firefox');
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
  const entry = fake.newWorker('firefox');
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

it('returns to a safe prior page after a worker-served destination commits before Pause', async () => {
  const safe = 'https://outside.example/';
  const target = 'https://www.youtube.com/watch?id=73';
  const fake = browser({ id: 4, url: safe });
  fake.api.tabs.goBack = async () => { fake.setUrl(safe); };
  fake.api.tabs.remove = async () => { fake.setUrl('closed'); };
  const entry = fake.newWorker();
  await entry.reconcile(snapshot(1), origins);
  const nav = (url: string) => ({ tabId: 4, frameId: 0, url });
  fake.commit.emit(nav(safe));
  await fake.drain();
  fake.before.emit(nav(target));
  fake.setUrl(target);
  fake.commit.emit(nav(target));
  await fake.drain();
  expect(fake.read()).toBe(page);
  fake.commit.emit(nav(page));
  await fake.drain();
  await entry.message({ type: 'entry-back' }, { frameId: 0, url: page, tab: { id: 4 } });
  expect(fake.read()).toBe(safe);
});

it('redirects a committed Chromium worker response to the blocked page without a pass', async () => {
  const safe = 'https://outside.example/';
  const target = 'https://www.youtube.com/watch?id=73';
  const fake = browser({ id: 4, url: safe });
  const entry = fake.newWorker();
  const policy = snapshot(1);
  policy.sites[0].entry = { mode: 'block' };
  await entry.reconcile(policy, origins);
  fake.commit.emit({ tabId: 4, frameId: 0, url: safe });
  await fake.drain();
  fake.before.emit({ tabId: 4, frameId: 0, url: target });
  fake.setUrl(target);
  fake.commit.emit({ tabId: 4, frameId: 0, url: target });
  await fake.drain();
  expect(fake.read()).toBe(page);
  expect(await entry.message({ type: 'entry-view' }, { frameId: 0, url: page, tab: { id: 4 } })).toEqual({
    label: 'YouTube', mode: 'block',
  });
  for (const type of ['entry-continue', 'entry-auto', 'entry-hold-start', 'entry-hold-complete',
    'entry-two-step-start', 'entry-two-step-confirm'] as const) {
    await entry.message({ type }, { frameId: 0, url: page, tab: { id: 4 } });
    expect(fake.read()).toBe(page);
    expect(await fake.api.declarativeNetRequest.getSessionRules()).toHaveLength(0);
  }
  await entry.message({ type: 'entry-back' }, { frameId: 0, url: page, tab: { id: 4 } });
  expect(fake.read()).toBe(safe);
});

it('does not redirect a committed worker response after its host permission is revoked', async () => {
  const target = 'https://www.youtube.com/watch?id=73';
  const fake = browser({ id: 4, url: 'https://outside.example/' });
  const entry = fake.newWorker();
  const policy = snapshot(1);
  policy.sites[0].entry = { mode: 'block' };
  await entry.reconcile(policy, origins);
  fake.api.scripting.insertCSS = async () => { fake.revoke(); };
  fake.setUrl(target);
  fake.commit.emit({ tabId: 4, frameId: 0, url: target });
  await fake.drain();
  expect(fake.read()).toBe(target);
});

it('does not redirect a worker response after its tab navigates elsewhere', async () => {
  const target = 'https://www.youtube.com/watch?id=73';
  const safe = 'https://outside.example/new';
  const fake = browser({ id: 4, url: 'https://outside.example/' });
  const entry = fake.newWorker();
  const policy = snapshot(1);
  policy.sites[0].entry = { mode: 'block' };
  await entry.reconcile(policy, origins);
  fake.api.scripting.insertCSS = async () => { fake.setUrl(safe); };
  fake.setUrl(target);
  fake.commit.emit({ tabId: 4, frameId: 0, url: target });
  await fake.drain();
  expect(fake.read()).toBe(safe);
});

it('does not redirect a worker response after Block changes to Allow', async () => {
  const target = 'https://www.youtube.com/watch?id=73';
  const fake = browser({ id: 4, url: 'https://outside.example/' });
  const entry = fake.newWorker();
  const block = snapshot(1);
  block.sites[0].entry = { mode: 'block' };
  await entry.reconcile(block, origins);
  const allow = snapshot(2);
  allow.sites[0].entry = { mode: 'allow' };
  fake.api.scripting.insertCSS = async () => { await entry.reconcile(allow, origins); };
  fake.setUrl(target);
  fake.commit.emit({ tabId: 4, frameId: 0, url: target });
  await fake.drain();
  expect(fake.read()).toBe(target);
});

it('preserves a worker navigation fragment in the Pause destination', async () => {
  const base = 'https://www.youtube.com/watch?id=73';
  const full = `${base}#comments`;
  const fake = browser({ id: 4, url: 'https://outside.example/' });
  const entry = fake.newWorker();
  await entry.reconcile(snapshot(1), origins);
  fake.before.emit({ tabId: 4, frameId: 0, url: full });
  fake.setUrl(full);
  fake.commit.emit({ tabId: 4, frameId: 0, url: base });
  await fake.drain();
  expect(fake.read()).toBe(`${page}#comments`);
});

it('ignores a stale committed event after the tab has navigated away', async () => {
  const stale = 'https://old.example/';
  const safe = 'https://outside.example/';
  const fake = browser({ id: 4, url: safe });
  const entry = fake.newWorker();
  await entry.reconcile(snapshot(1), origins);
  fake.commit.emit({ tabId: 4, frameId: 0, url: safe });
  fake.commit.emit({ tabId: 4, frameId: 0, url: stale });
  await fake.drain();
  expect(fake.read()).toBe(safe);
  fake.setUrl(page);
  fake.commit.emit({ tabId: 4, frameId: 0, url: page });
  await fake.drain();
  await entry.message({ type: 'entry-back' }, { frameId: 0, url: page, tab: { id: 4 } });
  expect(fake.read()).toBe(safe);
});

it('keeps Go back available when an ungranted safe page has no tabs.get URL', async () => {
  const safe = 'https://outside.example/';
  const fake = browser({ id: 4, url: safe });
  const get = fake.api.tabs.get;
  fake.api.tabs.get = async () => fake.read() === safe ? { id: 4, url: undefined as unknown as string } : get();
  const entry = fake.newWorker();
  await entry.reconcile(snapshot(1), origins);
  fake.commit.emit({ tabId: 4, frameId: 0, url: safe });
  await fake.drain();
  fake.setUrl(page);
  fake.commit.emit({ tabId: 4, frameId: 0, url: page });
  await fake.drain();
  await entry.message({ type: 'entry-back' }, { frameId: 0, url: page, tab: { id: 4 } });
  expect(fake.read()).toBe(safe);
});

type Gesture = 'entry-hold-start' | 'entry-hold-cancel' | 'entry-hold-complete'
  | 'entry-two-step-start' | 'entry-two-step-confirm';
const sender = { frameId: 0, url: page, tab: { id: 4 } };
const target = 'https://www.youtube.com/watch?id=73';

function accessibilityPolicy(revision: number, holdSeconds: number, twoStepConfirmation = false) {
  return { ...snapshot(revision), accessibility: { holdSeconds, twoStepConfirmation } };
}

function gesture(entry: SiteEntry, type: Gesture, nonce: string | undefined, revision: number, from = sender) {
  return entry.message({ type, nonce, revision }, from);
}

it('does not allow the legacy Continue message to bypass the Chromium manual gesture', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const fake = browser();
  const entry = fake.newWorker();
  await entry.reconcile(accessibilityPolicy(1, 15), origins);
  const pending = await entry.message({ type: 'entry-view' }, sender);
  now = 60000;
  await entry.message({ type: 'entry-continue', nonce: pending.nonce }, sender);
  expect(fake.read()).toBe(page);
});

it('requires a continuous configured hold after the site countdown', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const fake = browser();
  const entry = fake.newWorker();
  await entry.reconcile(accessibilityPolicy(1, 20), origins);
  const pending = await entry.message({ type: 'entry-view' }, sender);

  now = 4999;
  await gesture(entry, 'entry-hold-start', pending.nonce, 1);
  now = 5000;
  await gesture(entry, 'entry-hold-complete', pending.nonce, 1);
  expect(fake.read()).toBe(page);
  await gesture(entry, 'entry-hold-start', pending.nonce, 1);
  now = 24999;
  await gesture(entry, 'entry-hold-complete', pending.nonce, 1);
  expect(fake.read()).toBe(page);
  now = 25000;
  await gesture(entry, 'entry-hold-complete', pending.nonce, 1);
  expect(fake.read()).toBe(target);
});

it('cancels a hold on release and requires a full new hold', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const fake = browser();
  const entry = fake.newWorker();
  await entry.reconcile(accessibilityPolicy(1, 15), origins);
  const pending = await entry.message({ type: 'entry-view' }, sender);
  now = 5000;
  await gesture(entry, 'entry-hold-start', pending.nonce, 1);
  now = 19000;
  await gesture(entry, 'entry-hold-cancel', pending.nonce, 1);
  now = 21000;
  await gesture(entry, 'entry-hold-complete', pending.nonce, 1);
  expect(fake.read()).toBe(page);
  await gesture(entry, 'entry-hold-start', pending.nonce, 1);
  now = 35999;
  await gesture(entry, 'entry-hold-complete', pending.nonce, 1);
  expect(fake.read()).toBe(page);
  now = 36000;
  await gesture(entry, 'entry-hold-complete', pending.nonce, 1);
  expect(fake.read()).toBe(target);
});

it('rejects stale nonce, revision and sender during a hold, and consumes completion once', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const fake = browser();
  const entry = fake.newWorker();
  await entry.reconcile(accessibilityPolicy(1, 15), origins);
  const first = await entry.message({ type: 'entry-view' }, sender);
  now = 5000;
  await gesture(entry, 'entry-hold-start', first.nonce, 1);
  await entry.reconcile(accessibilityPolicy(2, 15), origins);
  const current = await entry.message({ type: 'entry-view' }, sender);
  now = 10000;
  await gesture(entry, 'entry-hold-start', first.nonce, 1);
  await gesture(entry, 'entry-hold-start', current.nonce, 1);
  await gesture(entry, 'entry-hold-start', current.nonce, 2, { ...sender, frameId: 1 });
  now = 25000;
  await gesture(entry, 'entry-hold-complete', current.nonce, 2);
  expect(fake.read()).toBe(page);
  await gesture(entry, 'entry-hold-start', current.nonce, 2);
  now = 40000;
  await gesture(entry, 'entry-hold-complete', first.nonce, 2);
  await gesture(entry, 'entry-hold-complete', current.nonce, 1);
  await gesture(entry, 'entry-hold-complete', current.nonce, 2, { ...sender, frameId: 1 });
  expect(fake.read()).toBe(page);
  await gesture(entry, 'entry-hold-complete', current.nonce, 2);
  expect(fake.read()).toBe(target);
  fake.setUrl(page);
  await gesture(entry, 'entry-hold-complete', current.nonce, 2);
  expect(fake.read()).toBe(page);
});

it.each([
  { holdSeconds: 15, waitMs: 35000 },
  { holdSeconds: 40, waitMs: 40000 },
])('requires explicit two-step confirmation after the full wait with holdSeconds=$holdSeconds', async ({ holdSeconds, waitMs }) => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const fake = browser();
  const entry = fake.newWorker();
  await entry.reconcile(accessibilityPolicy(1, holdSeconds, true), origins);
  const pending = await entry.message({ type: 'entry-view' }, sender);
  now = 4999;
  await gesture(entry, 'entry-two-step-start', pending.nonce, 1);
  now = 5000;
  await gesture(entry, 'entry-two-step-confirm', pending.nonce, 1);
  expect(fake.read()).toBe(page);
  await gesture(entry, 'entry-two-step-start', pending.nonce, 1);
  now = 5000 + waitMs - 1;
  await gesture(entry, 'entry-two-step-confirm', pending.nonce, 1);
  expect(fake.read()).toBe(page);
  now = 5000 + waitMs;
  await entry.message({ type: 'entry-view' }, sender);
  expect(fake.read()).toBe(page);
  await gesture(entry, 'entry-two-step-confirm', pending.nonce, 1);
  expect(fake.read()).toBe(target);
});

it('rejects stale and duplicate two-step confirmations', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const fake = browser();
  const entry = fake.newWorker();
  await entry.reconcile(accessibilityPolicy(1, 15, true), origins);
  const first = await entry.message({ type: 'entry-view' }, sender);
  now = 5000;
  await gesture(entry, 'entry-two-step-start', first.nonce, 1);
  await entry.reconcile(accessibilityPolicy(2, 15, true), origins);
  const current = await entry.message({ type: 'entry-view' }, sender);
  now = 10000;
  await gesture(entry, 'entry-two-step-start', current.nonce, 2);
  now = 45000;
  await gesture(entry, 'entry-two-step-confirm', first.nonce, 2);
  await gesture(entry, 'entry-two-step-confirm', current.nonce, 1);
  await gesture(entry, 'entry-two-step-confirm', current.nonce, 2, { ...sender, frameId: 1 });
  expect(fake.read()).toBe(page);
  await gesture(entry, 'entry-two-step-confirm', current.nonce, 2);
  expect(fake.read()).toBe(target);
  fake.setUrl(page);
  await gesture(entry, 'entry-two-step-confirm', current.nonce, 2);
  expect(fake.read()).toBe(page);
});
