// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.instagram.com/"}
import { afterEach, expect, it } from 'vitest';
import * as content from '../../apps/extension/src/sites/instagram';

const marker = 'data-focus-feed-hidden';
let stop: (() => void) | undefined;
afterEach(() => { stop?.(); stop = undefined; document.body.replaceChildren(); history.replaceState({}, '', '/'); });
const hidden = (id: string) => document.getElementById(id)!.hasAttribute(marker);
const route = (path: string) => { history.pushState({}, '', path); document.dispatchEvent(new Event('focus-route-change')); };

it.each([[false, false], [true, false], [false, true], [true, true]])('filters independently (%s, %s)', (suggested, reels) => {
  document.body.innerHTML = `<nav><a id="shortcut" href="/reels/">Reels</a><a id="explore" href="/explore/">Explore</a></nav>
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
  for (const id of ['explore', 'stories', 'followed', 'unknown', 'ambiguous']) expect(hidden(id), id).toBe(false);
  stop();
  expect(document.querySelector(`[${marker}]`)).toBeNull();
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
