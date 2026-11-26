// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.reddit.com/"}
import { afterEach, expect, it } from 'vitest';
import { startRedditFilter } from '../../apps/extension/src/sites/reddit';

const mark = 'data-focus-feed-hidden';
const turn = async () => { await Promise.resolve(); await Promise.resolve(); };
let stop: (() => void) | undefined;
afterEach(() => { stop?.(); stop = undefined; document.body.replaceChildren(); history.replaceState({}, '', '/'); });

const tabs = `<faceplate-tabgroup><button role="tab" aria-selected="true">Following</button><button role="tab" aria-selected="false">For You</button></faceplate-tabgroup>`;
const feed = `<shreddit-feed id="home"><shreddit-post id="followed">Followed community</shreddit-post><shreddit-post id="suggestion" recommendation-source="sample">Suggested</shreddit-post></shreddit-feed>`;
const hidden = (id: string) => document.getElementById(id)?.hasAttribute(mark);

it('separates populated Following from For You and restores both on disable', async () => {
  document.body.innerHTML = `<main>${tabs}${feed}<aside><shreddit-recommendation-carousel id="aside"></shreddit-recommendation-carousel></aside></main>`;
  stop = startRedditFilter(document, 'recommendations');
  expect(hidden('home')).toBe(false);
  expect(hidden('followed')).toBe(false);
  expect(hidden('suggestion')).toBe(false);
  const [following, forYou] = document.querySelectorAll('[role=tab]');
  following.setAttribute('aria-selected', 'false');
  forYou.setAttribute('aria-selected', 'true');
  await turn();
  expect(hidden('home')).toBe(true);
  expect(hidden('aside')).toBe(false);
  stop();
  expect(hidden('home')).toBe(false);
  following.setAttribute('aria-selected', 'true');
  forYou.setAttribute('aria-selected', 'false');
  stop = startRedditFilter(document, 'all');
  expect(hidden('home')).toBe(true);
  stop();
  expect(hidden('home')).toBe(false);
});

it('keeps a populated Following section inside For You and leaves adjacent useful content alone', async () => {
  document.body.innerHTML = `<main>${tabs}<shreddit-feed id="mixed">
    <section id="recommendations" data-testid="recommendation">
      <shreddit-post id="suggested" recommendation-source="sample">Suggested</shreddit-post>
      <section id="following" data-feed="following"><shreddit-post id="followed">Followed community</shreddit-post></section>
      <aside id="useful">Useful content</aside>
    </section></shreddit-feed></main>`;
  const [following, forYou] = document.querySelectorAll('[role=tab]');
  following.setAttribute('aria-selected', 'false');
  forYou.setAttribute('aria-selected', 'true');
  const effectivelyHidden = (id: string) => !!document.getElementById(id)?.closest(`[${mark}]`);
  stop = startRedditFilter(document, 'recommendations');
  expect(effectivelyHidden('followed')).toBe(false);
  expect(effectivelyHidden('useful')).toBe(false);
  expect(hidden('suggested')).toBe(true);
  expect(hidden('mixed')).toBe(false);
  expect(hidden('recommendations')).toBe(false);
  stop();
  stop = startRedditFilter(document, 'all');
  expect(effectivelyHidden('followed')).toBe(true);
  expect(effectivelyHidden('suggested')).toBe(true);
  expect(effectivelyHidden('useful')).toBe(false);
  stop();
  expect(document.querySelector(`[${mark}]`)).toBeNull();
});

it('hides identifiable modules on mixed Home only, including late and reused posts', async () => {
  stop = startRedditFilter(document, 'recommendations');
  document.body.innerHTML = `<main>${feed}</main>`;
  await turn();
  expect(hidden('home')).toBe(false);
  expect(hidden('followed')).toBe(false);
  expect(hidden('suggestion')).toBe(true);
  document.getElementById('suggestion')!.removeAttribute('recommendation-source');
  await turn();
  expect(hidden('suggestion')).toBe(false);
  document.getElementById('suggestion')!.setAttribute('recommendation-source', 'sample');
  for (const route of ['/r/all', '/r/popular', '/r/example', '/r/example/comments/1/post', '/search/', '/message/inbox/']) {
    history.pushState({}, '', route);
    window.dispatchEvent(new Event('popstate'));
    expect(hidden('suggestion'), route).toBe(false);
  }
  history.pushState({}, '', '/');
  window.dispatchEvent(new Event('popstate'));
  expect(hidden('suggestion')).toBe(true);
  document.querySelector('main')?.insertAdjacentHTML('beforeend', '<shreddit-feed></shreddit-feed>');
  await turn();
  expect(hidden('suggestion')).toBe(false);
});
