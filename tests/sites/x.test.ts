// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://x.com/home"}
import { afterEach, expect, it } from 'vitest';
import { startXFilter } from '../../apps/extension/src/sites/x';

const mark = 'data-focus-feed-hidden';
const turn = async () => { await Promise.resolve(); await Promise.resolve(); };
let stop: (() => void) | undefined;
afterEach(() => { stop?.(); stop = undefined; document.body.replaceChildren(); history.replaceState({}, '', '/home'); });

function home() {
  document.body.innerHTML = `<main><div data-testid="primaryColumn"><div role="tablist">
    <button role="tab" aria-selected="true">For you</button><button role="tab" aria-selected="false">Following</button></div>
    <div id="compose" data-testid="tweetTextarea_0"></div>
    <section aria-labelledby="title"><div id="feed" aria-label="Timeline: Your Home Timeline"><article data-testid="tweet"></article></div></section>
    <div id="neighbor" role="feed"><article data-testid="related"></article></div></div></main>`;
  const [forYou, following] = document.querySelectorAll<HTMLButtonElement>('[role=tab]');
  return { forYou, following, feed: document.querySelector('#feed')! };
}

it('hides only the recognized For you timeline and restores a reused Following node', async () => {
  const { forYou, following, feed } = home();
  stop = startXFilter(document, 'hide');
  expect(feed.hasAttribute(mark)).toBe(true);
  expect(document.querySelector('#compose')?.hasAttribute(mark)).toBe(false);
  expect(document.querySelector('#neighbor')?.hasAttribute(mark)).toBe(false);
  forYou.setAttribute('aria-selected', 'false');
  following.setAttribute('aria-selected', 'true');
  await turn();
  expect(feed.hasAttribute(mark)).toBe(false);
  forYou.setAttribute('aria-selected', 'true');
  following.setAttribute('aria-selected', 'false');
  await turn();
  expect(feed.hasAttribute(mark)).toBe(true);
  stop();
  expect(feed.hasAttribute(mark)).toBe(false);
});

it('tries Following once per Home visit even with late DOM and failed selection', async () => {
  stop = startXFilter(document, 'following');
  const { following, feed } = home();
  let attempts = 0;
  following.onclick = () => { ++attempts; };
  await turn();
  expect(attempts).toBe(1);
  expect(feed.hasAttribute(mark)).toBe(true);
  for (const route of ['/search', '/profile/status/1', '/profile', '/i/lists/1', '/messages', '/compose/post']) {
    history.pushState({}, '', route);
    window.dispatchEvent(new Event('popstate'));
    expect(feed.hasAttribute(mark), route).toBe(false);
  }
  history.pushState({}, '', '/home');
  window.dispatchEvent(new Event('popstate'));
  expect(attempts).toBe(2);
  feed.removeAttribute('aria-label');
  await turn();
  expect(feed.hasAttribute(mark)).toBe(false);
  expect(attempts).toBe(2);
});
