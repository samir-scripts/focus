// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.instagram.com/"}
import { afterEach, expect, it, vi } from 'vitest';
import { findInstagramViewer, startNavigationLock, trackViewerEntry } from '../../apps/extension/src/sites/short-video-navigation';

let stop: (() => void) | undefined;
const route = (path: string) => { history.pushState({}, '', path); document.dispatchEvent(new Event('focus-route-change')); };
afterEach(() => { stop?.(); stop = undefined; document.body.replaceChildren(); route('/'); });
const wheel = (target: Element, deltaY = 120) => target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY }));
const key = (target: Element, key: string) => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
const click = (target: Element) => target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
function touch(target: Element, type: string, y: number) {
  const point = { identifier: 1, clientX: 20, clientY: y };
  return target.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    touches: type === 'touchend' ? [] : [point], changedTouches: [point],
  }));
}
function dimensions(element: Element, height: number, fullHeight: number, top = 0) {
  Object.defineProperties(element, { clientHeight: { value: height }, scrollHeight: { value: fullHeight } });
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, top, 500, height));
}
function viewer() {
  // Original fixture with the observed Instagram main > snap scroller structure.
  document.body.innerHTML = `<main><div style="scroll-snap-type: y mandatory; overflow-y: auto">
    <article><video></video><button>Share</button><button aria-label="Close">Close</button>
    <section style="overflow-y: auto"><textarea></textarea></section></article>
    <article><video></video></article></div>
    <div role="toolbar"><div role="button" tabindex="0"><svg></svg></div><div role="button" tabindex="0"><svg></svg></div></div></main>
    <nav><a href="/">Home</a></nav>`;
  const scroller = document.querySelector<HTMLElement>('main > div')!;
  const [video, nextVideo] = Array.from(scroller.querySelectorAll('video'));
  const comments = scroller.querySelector('section')!;
  dimensions(scroller, 600, 1200);
  dimensions(video, 600, 600);
  dimensions(nextVideo, 600, 600, 600);
  dimensions(comments, 100, 300);
  return { scroller, video, comments, input: comments.querySelector('textarea')!, share: scroller.querySelector('button')!,
    previous: document.querySelector('[role="toolbar"] > :first-child')!, next: document.querySelector('[role="toolbar"] > :last-child')!,
    close: scroller.querySelector('[aria-label="Close"]')!, home: document.querySelector('nav a')! };
}

it('pins an opened reel without consuming playback, Close, text entry or outside navigation', () => {
  route('/reel/example/');
  const { scroller, video, input, share, next, previous, close, home } = viewer();
  stop = startNavigationLock(document, 'openedVideos', findInstagramViewer);
  expect(wheel(video)).toBe(false);
  expect(key(video, 'ArrowDown')).toBe(false);
  expect(key(video, 'ArrowUp')).toBe(false);
  expect(key(video, ' ')).toBe(true);
  expect(key(input, 'ArrowDown')).toBe(true);
  expect(click(next)).toBe(false);
  expect(click(previous)).toBe(false);
  expect(click(share)).toBe(true);
  expect(click(close)).toBe(true);
  expect(wheel(home)).toBe(true);
  const replayState = vi.fn(() => {
    scroller.scrollTop = 600;
    scroller.dispatchEvent(new Event('scroll'));
  });
  video.addEventListener('ended', replayState);
  video.dispatchEvent(new Event('ended'));
  expect(replayState).toHaveBeenCalledTimes(1);
  expect(scroller.scrollTop).toBe(0);
  stop();
  expect(wheel(video)).toBe(true);
  expect(click(next)).toBe(true);
  expect(scroller.style.scrollSnapType).toBe('y mandatory');
  video.dispatchEvent(new Event('ended'));
  expect(replayState).toHaveBeenCalledTimes(2);
});

it('keeps native comment scrolling while containing both boundaries and site advance handlers', () => {
  route('/reel/example/');
  const { video, comments, input } = viewer();
  const site = vi.fn();
  document.addEventListener('wheel', site);
  try {
    stop = startNavigationLock(document, 'openedVideos', findInstagramViewer);
    expect(wheel(input, -120)).toBe(false);
    expect(wheel(comments)).toBe(true);
    comments.scrollTop = 100;
    expect(wheel(comments, -120)).toBe(true);
    comments.scrollTop = 200;
    expect(wheel(comments)).toBe(false);
    expect(site).not.toHaveBeenCalled();
    expect(wheel(video)).toBe(false);
  } finally { document.removeEventListener('wheel', site); }
});

it('only locks discovery in all mode; releases on protected routes and unknown layouts', () => {
  route('/reels/');
  const { scroller, video } = viewer();
  stop = startNavigationLock(document, 'openedVideos', findInstagramViewer);
  expect(wheel(video)).toBe(true);
  stop();
  stop = startNavigationLock(document, 'allShortVideoViewers', findInstagramViewer);
  expect(wheel(video)).toBe(false);
  route('/stories/example/');
  expect(wheel(video)).toBe(true);
  route('/reel/example/');
  expect(wheel(video)).toBe(false);
  stop();
  scroller.style.scrollSnapType = '';
  stop = startNavigationLock(document, 'allShortVideoViewers', findInstagramViewer);
  expect(wheel(video)).toBe(true);
});

it('blocks vertical touch advances including a touchend-only handler but leaves taps alone', () => {
  route('/reel/example/');
  const { video } = viewer();
  const advance = vi.fn();
  video.addEventListener('touchend', advance);
  stop = startNavigationLock(document, 'openedVideos', findInstagramViewer);
  expect(touch(video, 'touchstart', 240)).toBe(true);
  expect(touch(video, 'touchmove', 140)).toBe(false);
  expect(touch(video, 'touchend', 120)).toBe(false);
  expect(advance).not.toHaveBeenCalled();
  expect(touch(video, 'touchstart', 240)).toBe(true);
  expect(touch(video, 'touchend', 240)).toBe(true);
  expect(advance).toHaveBeenCalledTimes(1);
});

it('retains known discovery ownership when Off changes to Opened after canonicalization', () => {
  route('/reels/');
  const { video } = viewer();
  const navigation = Object.assign(new EventTarget(), { currentEntry: { key: 'slot' } });
  const entry = trackViewerEntry(document, /^\/reels\/?$/, /^\/reels?\/[\w-]+\/?$/, navigation);
  const from = { url: location.href, key: 'slot' };
  history.replaceState({}, '', '/reel/example/');
  navigation.dispatchEvent(Object.assign(new Event('currententrychange'), { from, navigationType: 'replace' }));
  const find = (doc: Document, pinned?: HTMLElement) => findInstagramViewer(doc, pinned, entry.current());
  stop = startNavigationLock(document, 'openedVideos', find);
  expect(wheel(video)).toBe(true);
  stop();
  stop = startNavigationLock(document, 'allShortVideoViewers', find);
  expect(wheel(video)).toBe(false);
  entry.stop();
});

it('leaves a late individual-shaped viewer navigable when its entry is unknown', () => {
  route('/reel/example/');
  const { video } = viewer();
  const navigation = Object.assign(new EventTarget(), { currentEntry: { key: 'slot' } });
  const entry = trackViewerEntry(document, /^\/reels\/?$/, /^\/reels?\/[\w-]+\/?$/, navigation, false);
  stop = startNavigationLock(document, 'openedVideos',
    (doc, pinned) => findInstagramViewer(doc, pinned, entry.current()));
  expect(wheel(video)).toBe(true);
  const from = { url: location.href, key: 'slot' };
  history.replaceState({}, '', '/reel/continuation/');
  navigation.dispatchEvent(Object.assign(new Event('currententrychange'), { from, navigationType: 'replace' }));
  expect(wheel(video)).toBe(true);
  entry.stop();
});

it('contains the separately mounted comments scroller but preserves unrelated drawers', async () => {
  route('/reel/example/');
  viewer();
  stop = startNavigationLock(document, 'openedVideos', findInstagramViewer);
  document.body.insertAdjacentHTML('beforeend', `<aside>
    <div id="portal-comments" style="overflow-y:auto"><div>Comment and reply rows</div></div>
    <footer><input placeholder="Add a comment…"></footer></aside>
    <aside id="unrelated" style="overflow-y:auto">Unrelated drawer</aside>`);
  const panel = document.querySelector<HTMLElement>('#portal-comments')!;
  const unrelated = document.querySelector<HTMLElement>('#unrelated')!;
  dimensions(panel, 100, 400);
  dimensions(unrelated, 100, 400);
  await vi.waitFor(() => expect(wheel(panel, -120)).toBe(false));
  expect(wheel(panel)).toBe(true);
  panel.scrollTop = 300;
  expect(wheel(panel)).toBe(false);
  expect(wheel(unrelated, -120)).toBe(true);
  stop();
  expect(wheel(panel)).toBe(true);
  expect(panel.style.overscrollBehaviorY).not.toBe('contain');
});

it.each([
  ['https://www.instagram.com/reel/example/', false],
  ['https://www.instagram.com/reels/', true],
  ['https://www.youtube.com/reel/example/', true],
])('uses only an exact same-origin direct document URL for late Opened mode (%s)', (initial, allowed) => {
  route('/reel/example/');
  const { video } = viewer();
  const measured = Object.create(window.performance) as Performance;
  Object.defineProperty(measured, 'getEntriesByType', { value: () => [{ name: initial }] });
  vi.stubGlobal('performance', measured);
  const entry = trackViewerEntry(document, /^\/reels\/?$/, /^\/reels?\/[\w-]+\/?$/, undefined, false);
  try {
    stop = startNavigationLock(document, 'openedVideos',
      (doc, pinned) => findInstagramViewer(doc, pinned, entry.current()));
    expect(wheel(video)).toBe(allowed);
  } finally { entry.stop(); vi.unstubAllGlobals(); }
});
