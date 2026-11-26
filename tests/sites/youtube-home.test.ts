// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.youtube.com/"}
import { afterEach, expect, it } from 'vitest';
import { startHomeRecommendationsFilter, startShortsFilter } from '../../apps/extension/src/sites/youtube';

const turn = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
let stopHome: (() => void) | undefined;
let stopShorts: (() => void) | undefined;
afterEach(() => { stopHome?.(); stopShorts?.(); stopHome = stopShorts = undefined; document.body.replaceChildren(); history.replaceState({}, '', '/'); });

const card = `<ytd-rich-item-renderer id="video"><a href="/watch?v=regular">Recommended</a></ytd-rich-item-renderer>`;
const marker = 'data-focus-feed-hidden';
const shortMarker = 'data-focus-shorts';
function fixture() {
  document.body.innerHTML = `<ytd-browse page-subtype="home"><ytd-rich-grid-renderer><div id="contents">
    ${card}<ytd-rich-item-renderer id="subscription"><a href="/watch?v=subscribed">Subscription</a><ytd-subscribe-button-renderer subscribed></ytd-subscribe-button-renderer></ytd-rich-item-renderer>
    <ytd-rich-item-renderer id="unknown"><yt-lockup-view-model><a href="/playlist?list=unknown">Playlist</a></yt-lockup-view-model></ytd-rich-item-renderer>
    <ytd-rich-shelf-renderer id="shorts" is-shorts><a href="/shorts/example">Short</a></ytd-rich-shelf-renderer>
    </div></ytd-rich-grid-renderer></ytd-browse><main id="player"><video controls></video>
    <ytd-rich-item-renderer id="related"><a href="/watch?v=related">Related</a></ytd-rich-item-renderer></main>`;
}

it('applies independent Home and Shorts choices without touching subscriptions or watch content', () => {
  fixture();
  const check = (recommendations: boolean, shorts: boolean) => {
    expect(document.getElementById('video')?.hasAttribute(marker)).toBe(recommendations);
    expect(document.getElementById('shorts')?.hasAttribute(shortMarker)).toBe(shorts);
    for (const id of ['shorts', 'subscription', 'unknown', 'player', 'related']) {
      expect(document.getElementById(id)?.hasAttribute(marker), id).toBe(false);
    }
  };
  stopHome = startHomeRecommendationsFilter(document); check(true, false);
  stopShorts = startShortsFilter(document); check(true, true);
  stopHome(); check(false, true);
  stopShorts(); check(false, false);
});

it('handles late and reused Home cards and clears stale effects on protected routes', async () => {
  stopHome = startHomeRecommendationsFilter(document);
  fixture();
  await turn();
  const video = document.getElementById('video')!;
  expect(video.hasAttribute(marker)).toBe(true);
  video.querySelector('a')!.href = '/shorts/reused';
  await turn();
  expect(video.hasAttribute(marker)).toBe(false);
  video.querySelector('a')!.href = '/watch?v=regular';
  await turn();
  expect(video.hasAttribute(marker)).toBe(true);
  for (const route of ['/feed/subscriptions', '/results?search_query=sample', '/@sample', '/watch?v=regular', '/shorts/direct']) {
    history.pushState({}, '', route);
    document.dispatchEvent(new Event('yt-navigate-finish'));
    expect(video.hasAttribute(marker), route).toBe(false);
  }
  history.pushState({}, '', '/');
  document.dispatchEvent(new Event('yt-navigate-finish'));
  expect(video.hasAttribute(marker)).toBe(true);
  document.querySelector('ytd-browse')?.removeAttribute('page-subtype');
  await turn();
  expect(video.hasAttribute(marker)).toBe(false);
});
