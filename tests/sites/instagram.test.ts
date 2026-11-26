// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.instagram.com/"}
import { afterEach, expect, it, vi } from 'vitest';
import * as content from '../../apps/extension/src/sites/instagram';

const marker = 'data-focus-feed-hidden';
let stop: (() => void) | undefined;
afterEach(() => { stop?.(); stop = undefined; document.body.replaceChildren(); history.replaceState({}, '', '/'); });
const hidden = (id: string) => document.getElementById(id)!.hasAttribute(marker);
const route = (path: string) => { history.pushState({}, '', path); document.dispatchEvent(new Event('focus-route-change')); };

const authorRow = (links = '<a href="/sample/">Author</a><a href="/p/sample/">Post</a>', action = 'Follow') =>
  `<div><div>${links}</div><div><div role="button">${action}</div></div></div>`;

it('requires a tightly owned Home author Follow action and reverses on reuse and route changes', async () => {
  stop = content.startInstagramFilter(document, { suggested: true, reels: true });
  document.body.innerHTML = `<main>
    <article id="owned">${authorRow()}</article>
    <article id="duplicate">${authorRow('<a href="/sample/">Author</a><a href="/p/sample/">Post</a><a href="/p/sample">Time</a>')}</article>
    <article id="caption"><p>Follow</p>${authorRow(undefined, 'Following')}</article>
    <article id="mute">${authorRow(undefined, 'Mute')}</article>
    <article id="followed">${authorRow(undefined, 'Following')}<div role="button">Follow</div></article>
    <article id="paid">${authorRow()}<span>Sponsored</span></article>
    <article id="repost">${authorRow()}<span>Reposted by</span><a href="/other/">Account</a></article>
    <article id="marked-collaboration">${authorRow()}<span aria-label="Collaboration"></span></article>
    <article id="disabled">${authorRow().replace('role="button"', 'role="button" aria-disabled="true"')}</article>
    <article id="comment"><footer>${authorRow()}</footer></article>
    <article id="menu-link">${authorRow('<a href="/explore/">Explore</a><a href="/p/sample/">Post</a>')}</article>
    <article id="loose-row">${authorRow().replace('</div></div></div>', '</div></div><div></div></div>')}</article>
    <article id="hidden-action">${authorRow().replace('role="button"', 'role="button" hidden')}</article>
    <article id="suggested-account">${authorRow()}<span>Suggested for you</span></article>
    <article id="legacy"><header>Suggested for you</header></article>
    <article id="legacy-paid"><header>Suggested for you</header><span>Paid partnership</span></article>
    <article id="legacy-repost"><header>Suggested for you</header><span>Reposted by</span></article>
    <article id="legacy-collab"><header>Suggested for you</header><span aria-label="Collaboration"></span></article>
    <article id="legacy-disabled"><header>Suggested for you</header>${authorRow().replace('role="button"', 'role="button" aria-disabled="true"')}</article>
    <article id="legacy-hidden"><header>Suggested for you</header>${authorRow().replace('role="button"', 'role="button" hidden')}</article>
    <article id="foreign">${authorRow('<a href="https://instagram.com/sample/">Author</a><a href="/p/sample/">Post</a>')}</article>
    <article id="foreign-post">${authorRow('<a href="/sample/">Author</a><a href="https://instagram.com/p/sample/">Post</a>')}</article>
    <article id="mixed">${authorRow('<a href="/sample/">Author</a><a href="/p/sample/">Post</a><a href="/p/other/">Other</a>')}</article>
    <article id="people">${authorRow('<a href="/sample/">Author</a>')}</article>
    <article id="collaboration">${authorRow('<a href="/sample/">Author</a><a href="/other/">Collaborator</a><a href="/p/sample/">Post</a>')}</article>
    <article id="unowned"><a href="/p/sample/">Post</a>${authorRow('<a href="/sample/">Author</a>')}</article>
    <section id="accounts">${authorRow()}</section>
  </main>`;
  await Promise.resolve();
  expect([...document.querySelectorAll(`[${marker}]`)].map(node => node.id).sort()).toEqual(['duplicate', 'legacy', 'owned']);
  const action = document.querySelector('#owned [role="button"]')!;
  action.textContent = 'Following';
  await Promise.resolve();
  expect(hidden('owned')).toBe(false);
  action.textContent = 'Follow';
  for (const path of ['/direct/inbox/', '/explore/', '/sample/', '/p/sample/', '/?variant=following', '/?variant=favorites']) {
    route(path);
    expect(document.querySelector(`[${marker}]`), path).toBeNull();
  }
  route('/');
  expect(hidden('owned')).toBe(true);
  stop();
  expect(document.querySelector(`[${marker}]`)).toBeNull();
});

it.each([[false, false], [true, false], [false, true], [true, true]])('filters independently (%s, %s)', (suggested, reels) => {
  document.body.innerHTML = `<div><div><span><div><a id="shortcut" href="/reels/">Reels</a></div></span></div>
  <div><a href="/">Home</a></div><div><a id="explore" href="/explore/">Explore</a></div>
  <div><a id="messages" href="/direct/inbox/">Messages</a></div>
  <div><a id="home-copy" href="/">Home</a></div><div><a href="/">Home</a></div><div></div></div>
  <main><section id="stories" aria-label="Stories"></section>
  <article id="followed"><header>Following</header><p>Suggested for you</p></article>
  <article id="suggested"><header><span>Suggested for you</span></header></article>
  <article id="unknown"><header><span>Suggested</span></header></article>
  <section id="shelf" aria-label="Suggested reels"><a href="/reel/sample/">Reel</a></section>
  <section id="ambiguous"><a href="/reel/sample/">Reel</a></section></main>`;
  stop = content.startInstagramFilter(document, { suggested, reels });
  expect(hidden('suggested')).toBe(suggested);
  expect(hidden('shortcut')).toBe(reels);
  expect(hidden('shelf')).toBe(reels);
  for (const id of ['explore', 'messages', 'home-copy', 'stories', 'followed', 'unknown', 'ambiguous']) expect(hidden(id), id).toBe(false);
  stop();
  expect(document.querySelector(`[${marker}]`)).toBeNull();
});

it('marks only an unambiguous rail shortcut as its grouping changes', async () => {
  stop = content.startInstagramFilter(document, { suggested: false, reels: true });
  document.body.innerHTML = `<div id="rail">
    <div><a href="/">Home</a></div><div><a href="/explore/">Explore</a></div>
    <div><a id="messages" href="/direct/inbox/">Messages</a></div>
    <div><a id="shortcut" href="/reels/">Reels</a></div>
  </div>
  <main><article><a id="ordinary" href="/reels/">Reels</a></article></main>
  <div><a href="/">Home</a><a href="/explore/">Explore</a>
    <a href="https://instagram.com/direct/inbox/">Messages</a><a id="incomplete" href="/reels/">Reels</a></div>
  <div><a href="/">Home</a><a href="/explore/">Explore</a><a href="/direct/inbox/">Messages</a>
    <a id="foreign" href="https://instagram.com/reels/">Reels</a></div>`;
  await Promise.resolve();
  expect(hidden('shortcut')).toBe(true);
  for (const id of ['ordinary', 'incomplete', 'foreign']) expect(hidden(id), id).toBe(false);
  const rail = document.getElementById('rail')!;
  for (const href of ['/reels/', '/explore/', '/direct/inbox/', '/?variant=following', '/#home', 'https://instagram.com/']) {
    const duplicate = document.createElement('a');
    duplicate.href = href;
    rail.append(duplicate);
    await Promise.resolve();
    expect(hidden('shortcut'), href).toBe(false);
    duplicate.remove();
    await Promise.resolve();
    expect(hidden('shortcut'), href).toBe(true);
  }
  const messages = document.getElementById('messages')!;
  messages.setAttribute('href', '/direct/inbox/other/');
  await Promise.resolve();
  expect(hidden('shortcut')).toBe(false);
  messages.setAttribute('href', '/direct/inbox/');
  route('/explore/');
  expect(hidden('shortcut')).toBe(true);
  stop();
  expect(hidden('shortcut')).toBe(false);
});

it('reconciles late and reused labels and preserves individual reel playback', async () => {
  stop = content.startInstagramFilter(document, { suggested: true, reels: true });
  document.body.innerHTML = `<main><article id="post"><header>Suggested for you</header></article>
  <section id="feed" aria-label="Reels"><video controls></video></section>
  <section id="onward" aria-label="Suggested reels"><a href="/reel/other/">Another reel</a></section></main>`;
  await Promise.resolve();
  expect(hidden('post')).toBe(true);
  document.querySelector('header')!.textContent = 'Following';
  await Promise.resolve();
  expect(hidden('post')).toBe(false);
  route('/reels/');
  expect(hidden('feed')).toBe(true);
  route('/reel/sample/');
  expect(hidden('feed')).toBe(false);
  expect(hidden('onward')).toBe(true);
  for (const path of ['/direct/inbox/', '/explore/', '/sample/', '/p/sample/', '/?variant=following', '/?variant=favorites']) {
    route(path);
    expect(document.querySelector(`[${marker}]`), path).toBeNull();
  }
});

it.each(['/reel/shared/', '/reels/shared'])('protects the current reel in a mixed recommendation region at %s', (path) => {
  route(path);
  document.body.innerHTML = `<main>
    <section id="mixed" aria-label="Suggested reels"><article><a href="/reels/shared/?source=message">Current</a><video controls></video></article><a href="/reel/other/">Next</a></section>
    <section id="unlinked" aria-label="Suggested reels"><video controls></video><a href="/reel/other/">Next</a></section>
    <section id="link-only" aria-label="Suggested reels"><a href="/reel/shared">Current</a><a href="/reel/other/">Next</a></section>
    <section id="separate" aria-label="Suggested reels"><a href="/reel/next/">Separate recommendation</a></section>
  </main>`;
  stop = content.startInstagramFilter(document, { suggested: false, reels: true });
  for (const id of ['mixed', 'unlinked', 'link-only']) expect(hidden(id), id).toBe(false);
  expect(hidden('separate')).toBe(true);
});

it.each(['direct', 'initial-response', 'spa', 'shared', 'late-enable', 'removed', 'unrelated', 'traverse', 'bfcache',
  'same-url-push', 'same-url-replace', 'second-id-replace', 'second-id-push', 'second-id-traverse',
  'different-slot', 'unknown-slot', 'stale-from', 'sensitive-replace', 'pending-push', 'controlled', 'mixed'])(
  'requires fresh discovery provenance for a canonicalized viewer (%s)', (entry) => {
    let slot = 0;
    const navigation = Object.assign(new EventTarget(), { currentEntry: { key: '0' } });
    const advance = (path: string, navigationType = 'push', key?: string, fromUrl = document.URL) => {
      const from = { url: fromUrl, key: navigation.currentEntry.key };
      navigation.currentEntry = { key: key ?? (navigationType === 'replace' ? from.key : String(++slot)) };
      if (navigationType === 'replace') history.replaceState({ metadata: true }, '', path);
      else history.pushState({}, '', path);
      navigation.dispatchEvent(Object.assign(new Event('currententrychange'), { from, navigationType }));
    };
    route(entry === 'shared' ? '/reels/shared/' : entry === 'spa' ? '/' : '/reels/');
    const state = content.trackInstagramDiscovery(document, navigation);
    try {
      if (entry !== 'late-enable' && entry !== 'initial-response') state.applyPolicy(true, true);
      if (entry === 'spa') advance('/reels/');
      if (entry === 'initial-response') advance('/reels/', 'replace');
      if (entry === 'pending-push') advance('/reels/');
      if (entry !== 'shared') advance('/reels/shared/', 'replace');
      if (entry === 'initial-response' || entry === 'shared') advance('/reels/shared/', 'replace');
      if (entry === 'shared') advance('/reels/second/', 'replace');
      if (entry === 'initial-response') state.applyPolicy(true, true);
      if (entry === 'late-enable') state.applyPolicy(true, false);
      if (entry === 'removed') {
        state.applyPolicy(false, false);
        state.applyPolicy(true, false);
      }
      if (entry === 'unrelated') { advance('/explore/'); advance('/reels/shared/'); }
      if (entry === 'traverse') advance('/reels/shared/', 'traverse');
      document.body.innerHTML = `<main>
        <div id="viewer">
          <a href="/reels/shared/">Current reel</a>
          <div><video ${entry === 'controlled' ? 'controls' : ''}></video></div>
          ${'<div><video></video></div>'.repeat(6)}
        </div>
        <div id="controls"><button>Comments</button><button>Share</button>${entry === 'mixed' ? '<video></video>' : ''}</div>
      </main>`;
      stop = content.startInstagramFilter(document, { suggested: false, reels: true }, state);
      const sameUrl = entry === 'same-url-push' || entry === 'same-url-replace';
      const replacement = ['second-id-replace', 'second-id-push', 'second-id-traverse', 'different-slot',
        'unknown-slot', 'stale-from', 'sensitive-replace'].includes(entry);
      const ownsViewer = sameUrl || replacement || ['direct', 'initial-response', 'spa', 'bfcache'].includes(entry);
      expect(hidden('viewer')).toBe(ownsViewer);
      if (sameUrl) {
        advance('/reels/shared/', entry === 'same-url-replace' ? 'replace' : 'push');
        expect(hidden('viewer')).toBe(entry === 'same-url-replace');
      }
      if (replacement) {
        const type = entry === 'second-id-push' ? 'push' : entry === 'second-id-traverse' ? 'traverse' : 'replace';
        const key = entry === 'different-slot' ? 'other' : entry === 'unknown-slot' ? '' : undefined;
        const from = entry === 'stale-from' ? new URL('/reels/stale/', document.URL).href : document.URL;
        advance(entry === 'sensitive-replace' ? '/direct/inbox/' : '/reels/second/', type, key, from);
        expect(hidden('viewer')).toBe(entry === 'second-id-replace');
        if (entry !== 'second-id-replace') {
          advance('/reels/third/', 'replace');
          expect(hidden('viewer')).toBe(false);
        }
      }
      if (entry === 'bfcache') {
        window.dispatchEvent(new Event('pagehide'));
        expect(hidden('viewer')).toBe(false);
        document.dispatchEvent(new Event('focus-route-change'));
        expect(hidden('viewer')).toBe(false);
      }
      expect(hidden('controls')).toBe(false);
    } finally {
      state.stop();
    }
  },
);

it.each([true, false])('uses the first authoritative broadcast over a stale initial response (%s)', async (enabled) => {
  const navigation = new EventTarget();
  const reels = { instagram: { suggested: false, reels: true } };
  let receive!: (message: object, sender: object, respond: (value: object) => void) => void;
  let respondToInitial!: (policy: object) => void;
  const send = (policy: object) => receive({ type: 'focus-policy', ...policy }, {}, () => {});
  route('/reels/');
  document.body.innerHTML = `<main><div id="viewer"><video></video></div><div><button>Share</button></div></main>`;
  vi.resetModules();
  vi.stubGlobal('__focusRules', undefined);
  vi.stubGlobal('navigation', navigation);
  vi.stubGlobal('chrome', { runtime: {
    onMessage: { addListener: (listener: typeof receive) => { receive = listener; } },
    sendMessage: (_message: object, callback: typeof respondToInitial) => { respondToInitial = callback; },
  } });
  const ready = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
  try {
    // Evaluate the document-start entry point after setting up the browser APIs.
    await import('../../apps/extension/src/content');
    const from = { url: document.URL };
    history.replaceState({}, '', '/reels/shared/');
    navigation.dispatchEvent(Object.assign(new Event('currententrychange'), { from, navigationType: 'replace' }));
    send(enabled ? reels : {});
    respondToInitial(enabled ? {} : reels);
    expect(hidden('viewer')).toBe(enabled);
    send({});
    expect(hidden('viewer')).toBe(false);
    send(reels);
    expect(hidden('viewer')).toBe(false);
  } finally {
    if (receive) send({});
    window.dispatchEvent(new Event('pagehide'));
    ready.mockRestore();
    vi.unstubAllGlobals();
  }
});
