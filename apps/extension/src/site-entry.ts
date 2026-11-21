import { documentKey, entryRules, matchPattern, passRule, webTarget, type EntryRule } from './entry-rules';
import type { PolicySnapshot, SitePolicy } from './protocol';

type PausePolicy = Extract<SitePolicy['entry'], { mode: 'pause' }>;
export type PendingPause = {
  target: string; page: string; revision: number; siteId: string; nonce: string; deadline: number; seconds: number;
  gesture?: { kind: 'hold' | 'two-step'; deadline: number };
};
export type EntryView = {
  label?: string; mode?: 'pause' | 'block'; nonce?: string; revision?: number; remaining?: number;
  finish?: PausePolicy['finish']; manual?: 'continue' | 'hold' | 'two-step'; gestureRemaining?: number;
};
type Pass = { kind: 'page' | 'visit'; siteId: string; target: string; started?: true };
type TabState = { pending?: PendingPause; pass?: Pass; document?: string; original?: string; safePrevious?: string };
type Nav = { tabId: number; frameId: number; url: string };
type EntrySender = { url?: string; frameId?: number; tab?: { id?: number; incognito?: boolean } };
type EntryMessage = { type: 'entry-view' | 'entry-continue' | 'entry-back' | 'entry-auto'
  | 'entry-hold-start' | 'entry-hold-cancel' | 'entry-hold-complete'
  | 'entry-two-step-start' | 'entry-two-step-confirm'; nonce?: unknown; revision?: unknown };
type BrowserTab = { id?: number; url?: string; pendingUrl?: string; incognito?: boolean };
type BrowserEvent<A extends unknown[]> = { addListener(listener: (...args: A) => void): void };
type StoredSession = { revision?: number; origins?: string[]; tabs?: Record<number, TabState> };
type RuleUpdate = { removeRuleIds?: number[]; addRules?: EntryRule[] };
type Injection = { target: { tabId: number }; css: string; origin: 'USER' };
type EntryBrowser = {
  runtime: { getURL(path: string): string };
  webNavigation: Record<'onBeforeNavigate' | 'onCommitted' | 'onErrorOccurred' | 'onHistoryStateUpdated', BrowserEvent<[Nav]>> & {
    getFrame(details: { tabId: number; frameId: number }): Promise<{ url?: string } | null>;
  };
  tabs: {
    onRemoved: BrowserEvent<[number]>; onReplaced?: BrowserEvent<[number, number]>;
    get(id: number): Promise<BrowserTab>; query(query: object): Promise<BrowserTab[]>;
    update(id: number, update: { url: string }): Promise<BrowserTab>; remove(id: number): Promise<void>;
  };
  declarativeNetRequest: {
    getDynamicRules(): Promise<EntryRule[]>; getSessionRules(): Promise<EntryRule[]>;
    updateDynamicRules(rules: RuleUpdate): Promise<void>; updateSessionRules(rules: RuleUpdate): Promise<void>;
  };
  storage: { session: { get(key: string): Promise<Record<string, StoredSession | undefined>>; set(value: Record<string, StoredSession>): Promise<void> } };
  scripting: { insertCSS(injection: Injection): Promise<void>; removeCSS(injection: Injection): Promise<void> };
  permissions: { getAll(): Promise<{ origins?: string[] }> };
};

export function consumePause(pending: PendingPause, action: { now: number; page: string; nonce: unknown; revision: number }) {
  return action.now >= pending.deadline && action.page === pending.page && action.nonce === pending.nonce && action.revision === pending.revision;
}

const sessionKey = 'entry-session';
const coverCSS = ':root { visibility: hidden !important; pointer-events: none !important; }';

export class SiteEntry {
  private readonly page: string;
  private state: Record<number, TabState> = {};
  private scopes = new Map<string, SitePolicy>();
  private revision = -1;
  private accessibility = { holdSeconds: 15, twoStepConfirmation: false };
  private generation?: string;
  private saved?: { revision: number; origins: string[] };
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(private readonly api: EntryBrowser, private readonly schedule: (task: () => Promise<void>) => void,
    private readonly engine: 'chromium' | 'firefox' = 'chromium') {
    this.page = api.runtime.getURL('entry.html');
    const navigation = api.webNavigation;
    navigation.onBeforeNavigate.addListener((event: Nav) => {
      if (event.frameId === 0) schedule(() => this.before(event));
    });
    navigation.onCommitted.addListener((event: Nav) => {
      if (event.frameId === 0) schedule(() => this.commit(event));
    });
    navigation.onErrorOccurred.addListener((event: Nav) => {
      if (event.frameId === 0) schedule(() => this.navigationError(event));
    });
    navigation.onHistoryStateUpdated.addListener((event: Nav) => {
      if (event.frameId === 0) schedule(() => this.route(event));
    });
    api.tabs.onRemoved.addListener((id: number) => schedule(() => this.remove(id)));
    api.tabs.onReplaced?.addListener((_added: number, removed: number) => schedule(() => this.remove(removed)));
  }

  private gated(value: string) {
    const url = webTarget(value);
    if (url) return this.scopes.get(matchPattern(url));
  }

  private isEntry(url: string) { return url === this.page || url.startsWith(`${this.page}#`); }

  private persist() {
    return this.api.storage.session.set({ [sessionKey]: { ...this.saved, tabs: this.state } });
  }

  private clearTimer(id: number) {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }

  private async clearPass(id: number) {
    if (!this.state[id]?.pass) return;
    await this.api.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id + 1] });
    delete this.state[id].pass;
  }

  private async remove(id: number) {
    if (!this.state[id]) return;
    this.clearTimer(id);
    await this.clearPass(id);
    delete this.state[id];
    await this.persist();
  }

  async reconcile(policy: PolicySnapshot | undefined, grants: readonly string[]) {
    const revision = policy?.revision ?? -1;
    const scopes = new Map<string, SitePolicy>();
    for (const site of policy?.sites ?? []) {
      if (site.entry.mode === 'allow') continue;
      for (const host of site.hosts) for (const protocol of ['http', 'https']) {
        const pattern = `${protocol}://${host}/*`;
        if (grants.includes(pattern)) scopes.set(pattern, site);
      }
    }
    const origins = [...scopes.keys()].sort();
    const generation = JSON.stringify([revision, origins]);
    if (generation === this.generation) return;
    const dnr = this.api.declarativeNetRequest;
    const [rules, sessions, tabs] = await Promise.all([
      dnr.getDynamicRules(), dnr.getSessionRules(), this.api.tabs.query({}),
    ]);
    const fresh = this.generation === undefined;
    const keep = new Set<number>();
    if (fresh) {
      const { [sessionKey]: stored } = await this.api.storage.session.get(sessionKey);
      if (stored?.revision === revision && JSON.stringify(stored.origins) === JSON.stringify(origins)) {
        for (const { id, url } of tabs) {
          if (id === undefined || !url) continue;
          const old: TabState | undefined = stored.tabs?.[id];
          if (!old) continue;
          const site = webTarget(url);
          const current = site && scopes.get(matchPattern(site));
          if (current?.entry.mode !== 'pause') continue;
          const session = old.pass?.kind === 'visit' && old.pass.siteId === current.id && sessions.some(rule => rule.id === id + 1);
          if (session) keep.add(id + 1);
          if (session || old.document === documentKey(url)) {
            this.state[id] = { document: old.document, pass: session ? old.pass : undefined };
          }
        }
      }
    }
    const gates = new Map<string, 'pause' | 'block'>();
    for (const [pattern, site] of scopes) if (site.entry.mode !== 'allow') gates.set(pattern, site.entry.mode);
    const addRules = entryRules(gates, this.page);
    const removeRuleIds = sessions.filter((rule) => !keep.has(rule.id)).map((rule) => rule.id);
    if (removeRuleIds.length) await dnr.updateSessionRules({ removeRuleIds });
    // A reported Applied revision must have all its network rules installed.
    if (rules.length || addRules.length) await dnr.updateDynamicRules({ removeRuleIds: rules.map(rule => rule.id), addRules });
    if (!fresh) {
      for (const id of Object.keys(this.state)) this.clearTimer(Number(id));
      this.state = {};
    }
    this.scopes = scopes;
    this.accessibility = policy?.accessibility ?? { holdSeconds: 15, twoStepConfirmation: false };
    this.revision = revision;
    this.saved = { revision, origins };
    await this.persist();
    for (const tab of tabs) {
      if (tab.id === undefined || tab.incognito || !tab.url) continue;
      if (this.isEntry(tab.url)) {
        // Pending pages revalidate with the background on their next poll.
        continue;
      }
      if (!this.state[tab.id] && this.gated(tab.url)) await this.show(tab.id, tab.url);
    }
    this.generation = generation;
  }

  private async show(id: number, target: string) {
    if (!this.gated(target)) return;
    const tab = await this.api.tabs.get(id).catch(() => undefined);
    if (tab?.incognito || tab?.pendingUrl || documentKey(tab?.url ?? '') !== documentKey(target)) return;
    const injection: Injection = { target: { tabId: id }, css: coverCSS, origin: 'USER' };
    await this.api.scripting.insertCSS(injection).catch(() => {});
    try {
      const current = await this.api.tabs.get(id);
      if (current.pendingUrl || documentKey(current.url ?? '') !== documentKey(target)) {
        await this.api.scripting.removeCSS(injection).catch(() => {});
        return;
      }
      await this.api.tabs.update(id, { url: `${this.page}#${target}` });
    }
    catch { await this.api.scripting.removeCSS(injection).catch(() => {}); }
  }

  private async before({ tabId, url }: Nav) {
    if (this.scopes.size === 0) return;
    if (this.isEntry(url)) return;
    const site = this.gated(url);
    const tab = this.state[tabId];
    if (site?.entry.mode === 'pause') {
      // Store only granted destinations, only for this browser session.
      (this.state[tabId] ??= {}).original = url;
    }
    if (!tab) return;
    if (!site) delete tab.original;
    if (tab.pending) { delete tab.pending; this.clearTimer(tabId); }
    if (tab.pass?.kind === 'page' && documentKey(url) === documentKey(tab.pass.target) && !tab.pass.started) tab.pass.started = true;
    else if (tab.pass && (tab.pass.kind === 'page' || site?.id !== tab.pass.siteId)) await this.clearPass(tabId);
    await this.persist();
  }

  private async commit({ tabId, url }: Nav) {
    if (this.scopes.size === 0) return;
    const current = await this.api.tabs.get(tabId).catch(() => undefined);
    if (!current || current.incognito || current.pendingUrl && current.pendingUrl !== current.url) return;
    const currentUrl = current.url ?? (await this.api.webNavigation.getFrame({ tabId, frameId: 0 }).catch(() => null))?.url;
    if (this.isEntry(url) ? currentUrl !== url : !documentKey(url) || documentKey(currentUrl ?? '') !== documentKey(url)) return;
    const tab = this.state[tabId] ??= {};
    if (this.isEntry(url)) {
      delete tab.document;
      delete tab.pending;
      this.clearTimer(tabId);
      if (tab.pass) await this.clearPass(tabId);
      await this.persist();
      return;
    }
    const site = this.gated(url);
    const key = documentKey(url);
    const destination = tab.original && documentKey(tab.original) === key ? tab.original : url;
    const pass = tab.pass;
    const allowed = site?.entry.mode === 'pause' && pass?.siteId === site.id
      && (pass.kind === 'visit' || documentKey(pass.target) === key);
    if (pass && (!allowed || pass.kind === 'page')) await this.clearPass(tabId);
    this.clearTimer(tabId);
    delete tab.pending;
    delete tab.original;
    if (!site && key) this.state[tabId] = { safePrevious: url };
    else if (allowed) this.state[tabId] = { document: key, pass: tab.pass };
    else if (site?.entry.mode === 'pause' && tab.safePrevious) this.state[tabId] = { safePrevious: tab.safePrevious };
    else delete this.state[tabId];
    await this.persist();
    if (site && !allowed) await this.show(tabId, destination); // Includes BFCache and service-worker responses.
  }

  private async navigationError({ tabId, url }: Nav) {
    const tab = this.state[tabId];
    if (tab?.pass?.kind !== 'page' || documentKey(tab.pass.target) !== documentKey(url)) return;
    await this.clearPass(tabId);
    await this.persist();
  }

  private async route({ tabId, url }: Nav) {
    const site = this.gated(url);
    if (!site || this.state[tabId]?.pass?.kind === 'visit') return;
    if (documentKey(url) !== this.state[tabId]?.document) await this.show(tabId, url);
  }

  async message(message: EntryMessage, sender: EntrySender): Promise<EntryView> {
    const id = sender.tab?.id;
    const page = sender.url;
    if (id === undefined || sender.tab?.incognito || sender.frameId !== 0 || !page || !this.isEntry(page)) return {};
    const tab = await this.api.tabs.get(id).catch(() => undefined);
    if (tab?.url !== page || tab.pendingUrl && tab.pendingUrl !== page) return {};
    const target = webTarget(page.slice(this.page.length + 1));
    const site = target && this.gated(target.href);
    const record = this.state[id] ??= {};
    if (message.type === 'entry-back') {
      const previous = record.safePrevious;
      await this.remove(id);
      if (previous && !this.gated(previous)) await this.api.tabs.update(id, { url: previous }).catch(() => this.api.tabs.remove(id));
      else await this.api.tabs.remove(id);
      return {};
    }
    if (!site || !target || site.entry.mode === 'allow') return {};
    if (site.entry.mode === 'block') return { label: site.label, mode: 'block' };
    const settings = site.entry;
    let pending = record.pending;
    if (!pending || pending.page !== page || pending.revision !== this.revision) {
      if (message.type !== 'entry-view') return {};
      const original = record.original;
      const destination = original && documentKey(original) === documentKey(target.href) ? original : target.href;
      pending = { target: destination, page, revision: this.revision, siteId: site.id, nonce: crypto.randomUUID(),
        deadline: performance.now() + settings.seconds * 1000, seconds: settings.seconds };
      record.pending = pending;
      await this.persist();
      if (settings.finish === 'auto') {
        const token = pending.nonce;
        this.clearTimer(id);
        this.timers.set(id, setTimeout(() => this.schedule(async () => {
          await this.message({ type: 'entry-auto', nonce: token }, sender);
        }), settings.seconds * 1000 + 10));
      }
    }
    const now = performance.now();
    const manual = this.engine === 'firefox' ? 'continue' : this.accessibility.twoStepConfirmation ? 'two-step' : 'hold';
    if (settings.finish === 'manual' && this.engine === 'chromium'
      && message.nonce === pending.nonce && message.revision === pending.revision && now >= pending.deadline) {
      if (manual === 'hold') {
        if (message.type === 'entry-hold-start' && !pending.gesture) {
          pending.gesture = { kind: 'hold', deadline: now + this.accessibility.holdSeconds * 1000 };
        } else if (message.type === 'entry-hold-cancel' && pending.gesture?.kind === 'hold') {
          delete pending.gesture;
        } else if (message.type === 'entry-hold-complete' && pending.gesture?.kind === 'hold' && now >= pending.gesture.deadline) {
          await this.resume(id, record, settings, pending);
          return {};
        }
      } else if (manual === 'two-step') {
        if (message.type === 'entry-two-step-start' && !pending.gesture) {
          pending.gesture = { kind: 'two-step', deadline: now + Math.max(35, this.accessibility.holdSeconds) * 1000 };
        } else if (message.type === 'entry-two-step-confirm' && pending.gesture?.kind === 'two-step' && now >= pending.gesture.deadline) {
          await this.resume(id, record, settings, pending);
          return {};
        }
      }
    }
    if (((message.type === 'entry-continue' && settings.finish === 'manual' && this.engine === 'firefox') || settings.finish === 'auto')
      && consumePause(pending, { now, page, revision: this.revision, nonce: message.nonce })) {
      await this.resume(id, record, settings, pending);
      return {};
    }
    return { label: site.label, mode: 'pause', nonce: pending.nonce, revision: pending.revision,
      remaining: Math.max(0, pending.deadline - now), finish: settings.finish, manual,
      gestureRemaining: pending.gesture && Math.max(0, pending.gesture.deadline - now) };
  }

  private async resume(id: number, record: TabState, settings: PausePolicy, pending: PendingPause) {
    const { origins: grants } = await this.api.permissions.getAll();
    const target = webTarget(pending.target)!;
    if (!grants || !grants.includes(matchPattern(target)) && !grants.includes(`*://${target.hostname}/*`)) return;
    const visit = settings.frequency === 'visit';
    const origins = [...this.scopes].filter(([, site]) => site.id === pending.siteId).map(([origin]) => origin);
    const latest = await this.api.tabs.get(id).catch(() => undefined);
    if (latest?.url !== pending.page || latest.pendingUrl && latest.pendingUrl !== pending.page) return;
    this.clearTimer(id);
    delete record.pending;
    record.pass = { kind: settings.frequency, siteId: pending.siteId, target: pending.target };
    await this.persist();
    try {
      await this.api.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id + 1], addRules: [passRule(id + 1, id, origins, visit ? undefined : pending.target)] });
      const tab = await this.api.tabs.get(id);
      if (tab.url !== pending.page || tab.pendingUrl && tab.pendingUrl !== pending.page) throw new Error('stale tab');
      await this.api.tabs.update(id, { url: pending.target });
    } catch {
      await this.clearPass(id);
      await this.persist();
    }
  }
}
