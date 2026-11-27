// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.tiktok.com/"}
import { afterEach, expect, it, vi } from 'vitest';
import { findTikTokViewer, startNavigationLock } from '../../apps/extension/src/sites/short-video-navigation';

let stop: (() => void) | undefined;
afterEach(() => { stop?.(); stop = undefined; document.body.replaceChildren(); history.replaceState({}, '', '/'); });
const wheel = (target: Element) => target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 }));
const click = (target: Element) => target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

it('locks the For You anchoring viewer only in All and preserves Explore, playback and sharing', () => {
  // Original fixture using the observed For You viewer and navigation controls.
  document.body.innerHTML = `<main><div data-e2e="anchoring-player-column">
    <div id="column-list-container" style="scroll-snap-type:y mandatory;overflow-y:hidden">
      <article data-e2e="recommend-list-item-container"><section data-e2e="feed-video"><video></video></section></article>
    </div></div><button data-e2e="feed-navigation-prev">Previous</button><button data-e2e="feed-navigation-next">Next</button>
    <button id="play">Play</button><button id="share">Share</button></main><a id="explore" href="/explore">Explore</a>`;
  const scroller = document.getElementById('column-list-container')!;
  const video = scroller.querySelector('video')!;
  Object.defineProperties(scroller, { clientHeight: { value: 600 }, scrollHeight: { value: 1800 } });
  for (const el of [scroller, video]) vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 450, 600));
  const advance = Array.from(document.querySelectorAll('button[data-e2e^="feed-navigation-"]'));
  stop = startNavigationLock(document, 'openedVideos', findTikTokViewer);
  expect(wheel(video)).toBe(true);
  expect(advance.every(click)).toBe(true);
  stop();
  stop = startNavigationLock(document, 'allShortVideoViewers', findTikTokViewer);
  expect(wheel(video)).toBe(false);
  expect(advance.every((control) => !click(control))).toBe(true);
  expect(click(document.getElementById('play')!)).toBe(true);
  expect(click(document.getElementById('share')!)).toBe(true);
  history.pushState({}, '', '/explore');
  document.dispatchEvent(new Event('focus-route-change'));
  expect(wheel(video)).toBe(true);
  expect(advance.every(click)).toBe(true);
});
