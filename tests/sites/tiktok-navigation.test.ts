// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.tiktok.com/"}
import { afterEach, expect, it, vi } from 'vitest';
import { findTikTokViewer, startNavigationLock, tiktokEntry, trackViewerEntry } from '../../apps/extension/src/sites/short-video-navigation';

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

function directLayout() {
  history.replaceState({}, '', '/@fixture/video/123');
  document.body.innerHTML = `<main><button data-e2e="feed-navigation-next">Unrelated</button></main>
    <div><div id="column-list-container" style="scroll-snap-type:y mandatory;overflow-y:scroll">
      ${'<article data-e2e="recommend-list-item-container"><section data-e2e="feed-video"><video></video></section></article>'.repeat(2)}
    </div><button data-e2e="feed-navigation-prev">Previous</button><button data-e2e="feed-navigation-next">Next</button></div>`;
  const scroller = document.getElementById('column-list-container')!;
  const videos = scroller.querySelectorAll('video');
  Object.defineProperties(scroller, { clientHeight: { value: 600 }, scrollHeight: { value: 1200 } });
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 450, 600));
  for (const [index, video] of videos.entries()) {
    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, index * 600, 450, 600));
  }
  return { scroller, videos, parent: scroller.parentElement! };
}

it.each(['openedVideos', 'allShortVideoViewers'] as const)('retains the direct viewer selection in %s and restores it on exit', (mode) => {
  const { scroller, videos, parent } = directLayout();
  const selection = () => scroller.scrollTop / 600;
  videos[0].addEventListener('wheel', () => { scroller.scrollTop = 600; });
  expect(wheel(videos[0])).toBe(true);
  expect(selection()).toBe(1);
  scroller.scrollTop = 0;
  stop = startNavigationLock(document, mode, findTikTokViewer);
  expect(wheel(videos[0])).toBe(false);
  expect(selection()).toBe(0);
  expect([...parent.querySelectorAll('button')].map(click)).toEqual([false, false]);
  expect(click(document.querySelector('main button')!)).toBe(true);
  history.replaceState({}, '', '/explore');
  document.dispatchEvent(new Event('focus-route-change'));
  expect(scroller.style.overflowY).toBe('scroll');
  expect(wheel(videos[0])).toBe(true);
  expect(selection()).toBe(1);
});

it('leaves duplicate direct scrollers and overlapping midpoint videos unlocked', () => {
  const { scroller, videos, parent } = directLayout();
  const duplicate = parent.cloneNode(true) as HTMLElement;
  const copy = duplicate.firstElementChild!;
  Object.defineProperties(copy, { clientHeight: { value: 600 }, scrollHeight: { value: 1200 } });
  document.body.append(duplicate);
  stop = startNavigationLock(document, 'allShortVideoViewers', findTikTokViewer);
  expect(wheel(videos[0])).toBe(true);
  duplicate.hidden = true;
  document.dispatchEvent(new Event('focus-route-change'));
  expect(wheel(videos[0])).toBe(false);
  vi.mocked(videos[1].getBoundingClientRect).mockReturnValue(scroller.getBoundingClientRect());
  document.dispatchEvent(new Event('focus-route-change'));
  expect(wheel(videos[0])).toBe(true);
});

it('keeps For You discovery provenance when opening comments replaces the URL', () => {
  const { scroller, videos, parent } = directLayout();
  history.replaceState({}, '', '/');
  const main = document.querySelector('main')!;
  parent.setAttribute('data-e2e', 'anchoring-player-column');
  main.append(parent);
  const navigation = Object.assign(new EventTarget(), { currentEntry: { key: 'slot' } });
  const entry = trackViewerEntry(document, tiktokEntry.discovery, tiktokEntry.opened, navigation);
  try {
    stop = startNavigationLock(document, 'openedVideos', (doc, pinned) => findTikTokViewer(doc, pinned, entry.current()));
    const before = document.URL;
    scroller.firstElementChild!.insertAdjacentHTML('beforeend', '<div data-e2e="comment-level-1">Comment</div>');
    history.replaceState({}, '', '/@fixture/video/123');
    navigation.dispatchEvent(Object.assign(new Event('currententrychange'), {
      from: { url: before, key: 'slot' }, navigationType: 'replace',
    }));
    expect(entry.current()).toBe('discovery');
    expect(wheel(videos[0])).toBe(true);
    stop();
    stop = startNavigationLock(document, 'allShortVideoViewers', (doc, pinned) => findTikTokViewer(doc, pinned, entry.current()));
    expect(wheel(videos[0])).toBe(false);
  } finally {
    entry.stop();
  }
});

it('contains late separate comments without blocking scrolling or text entry, and unlocks ambiguous panes', () => {
  const { videos } = directLayout();
  stop = startNavigationLock(document, 'openedVideos', findTikTokViewer);
  document.body.insertAdjacentHTML('beforeend', `<aside><div id="comments" style="overflow-y:scroll">
    <div><div data-e2e="comment-level-1">Comment</div><textarea></textarea></div></div></aside>`);
  const pane = document.getElementById('comments')!;
  const row = pane.querySelector('[data-e2e="comment-level-1"]')!;
  Object.defineProperties(pane, { clientHeight: { value: 100 }, scrollHeight: { value: 500 } });
  vi.spyOn(row, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList);
  document.dispatchEvent(new Event('focus-route-change'));
  expect(pane.style.overscrollBehaviorY).toBe('contain');
  pane.scrollTop = 100;
  expect(wheel(row)).toBe(true);
  expect(row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))).toBe(true);
  expect(pane.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))).toBe(true);
  const point = (y: number) => ({ identifier: 1, clientX: 10, clientY: y });
  row.dispatchEvent(Object.assign(new Event('touchstart', { bubbles: true, cancelable: true }), { touches: [point(100)] }));
  expect(row.dispatchEvent(Object.assign(new Event('touchmove', { bubbles: true, cancelable: true }), { touches: [point(50)] }))).toBe(true);
  pane.scrollTop = 400;
  expect(wheel(row)).toBe(false);
  pane.scrollTop = 0;
  expect(row.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }))).toBe(false);
  const duplicate = pane.cloneNode(true) as HTMLElement;
  Object.defineProperties(duplicate, { clientHeight: { value: 100 }, scrollHeight: { value: 500 } });
  vi.spyOn(duplicate.querySelector('[data-e2e="comment-level-1"]')!, 'getClientRects')
    .mockReturnValue([new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList);
  document.body.append(duplicate);
  document.dispatchEvent(new Event('focus-route-change'));
  expect(pane.style.overscrollBehaviorY).toBe('');
  expect(wheel(videos[0])).toBe(false);
  expect(wheel(row)).toBe(true);
  stop();
  expect(wheel(videos[0])).toBe(true);
});
