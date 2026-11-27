// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.youtube.com/"}
import { afterEach, expect, it, vi } from 'vitest';
import { findYouTubeViewer, startNavigationLock } from '../../apps/extension/src/sites/short-video-navigation';

let stop: (() => void) | undefined;
const route = (path: string) => { history.replaceState({}, '', path); document.dispatchEvent(new Event('focus-route-change')); };
afterEach(() => { stop?.(); stop = undefined; document.body.replaceChildren(); route('/'); });
const wheel = (target: Element, deltaY = 120) => target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY }));
const click = (target: Element) => target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

function shorts() {
  // Original fixture for the observed YouTube desktop Shorts containers and controls.
  document.body.innerHTML = `<ytd-shorts><div id="shorts-container" style="scroll-snap-type:y mandatory;overflow-y:scroll">
    <ytd-reel-video-renderer><video></video></ytd-reel-video-renderer></div>
    <div id="navigation-button-up"><button>Previous</button></div>
    <div id="navigation-button-down"><button>Next</button></div></ytd-shorts>
    <button id="outside">Outside player</button>`;
  const scroller = document.getElementById('shorts-container')!;
  const video = scroller.querySelector('video')!;
  Object.defineProperties(scroller, { clientHeight: { value: 500 }, scrollHeight: { value: 1500 } });
  for (const el of [scroller, video]) vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 360, 500));
  return { video, scroller, outside: document.getElementById('outside')!, up: document.querySelector('#navigation-button-up button')!,
    down: document.querySelector('#navigation-button-down button')! };
}

it('blocks Shorts-owned advance buttons without affecting same-page normal controls or watch routes', () => {
  route('/shorts/opened');
  const { video, up, down, outside } = shorts();
  stop = startNavigationLock(document, 'openedVideos', findYouTubeViewer);
  expect(wheel(video)).toBe(false);
  expect(click(up)).toBe(false);
  expect(click(down)).toBe(false);
  expect(click(outside)).toBe(true);
  route('/watch?v=ordinary');
  expect(wheel(video)).toBe(true);
  expect(click(down)).toBe(true);
});

it('leaves the discovery entry alone until All and does not pin an embedded Shorts player', () => {
  route('/shorts/');
  const { video, scroller } = shorts();
  stop = startNavigationLock(document, 'openedVideos', findYouTubeViewer);
  expect(wheel(video)).toBe(true);
  stop();
  stop = startNavigationLock(document, 'allShortVideoViewers', findYouTubeViewer);
  expect(wheel(video)).toBe(false);
  document.body.append(scroller);
  document.dispatchEvent(new Event('focus-route-change'));
  expect(wheel(video)).toBe(true);
});

it('finds a late mounted Shorts comments scroller without intercepting Close or the reply editor', async () => {
  route('/shorts/opened');
  shorts();
  stop = startNavigationLock(document, 'openedVideos', findYouTubeViewer);
  document.body.insertAdjacentHTML('beforeend', `<ytd-comments><button id="close">Close comments</button>
    <ytd-item-section-renderer id="sections"><div id="contents" style="overflow-y:auto">
    <ytd-comment-thread-renderer><textarea></textarea></ytd-comment-thread-renderer>
    </div></ytd-item-section-renderer></ytd-comments>`);
  const pane = document.querySelector<HTMLElement>('ytd-comments #contents')!;
  Object.defineProperties(pane, { clientHeight: { value: 100 }, scrollHeight: { value: 400 } });
  await vi.waitFor(() => expect(wheel(pane, -120)).toBe(false));
  expect(wheel(pane)).toBe(true);
  pane.scrollTop = 300;
  expect(wheel(pane)).toBe(false);
  expect(wheel(pane, -120)).toBe(true);
  expect(click(document.getElementById('close')!)).toBe(true);
  expect(pane.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true, cancelable: true, key: 'ArrowDown',
  }))).toBe(true);
  route('/watch?v=ordinary');
  expect(wheel(pane)).toBe(true);
});
