export type NavigationMode = 'off' | 'openedVideos' | 'allShortVideoViewers';
export type NavigationLock = Exclude<NavigationMode, 'off'>;

type Viewer = {
  scroller: HTMLElement;
  video: HTMLVideoElement;
  entry: ViewerEntry;
  advance?: string;
  controls?: Element;
  comments?: Element;
};
type FindViewer = (doc: Document, pinned?: HTMLElement) => Viewer | undefined;
type ViewerEntry = 'opened' | 'discovery' | 'unknown';
type NavigationSlots = EventTarget & { readonly currentEntry?: { readonly key: string } | null };

// A discovery URL can be replaced with an individual permalink in the same
// history slot. Keep that provenance independently of the active policy.
export function trackViewerEntry(doc: Document, discovery: RegExp, opened: RegExp,
  navigation = (doc.defaultView as (Window & { navigation?: NavigationSlots }) | null)?.navigation,
  atStart = doc.readyState === 'loading') {
  const initial = new URL(doc.URL);
  let { href } = initial;
  const measured = doc.defaultView?.performance.getEntriesByType?.('navigation')[0]?.name;
  const loaded = measured && URL.canParse(measured) ? new URL(measured) : undefined;
  const exactLoad = loaded?.origin === initial.origin && loaded.pathname === initial.pathname && loaded.search === initial.search;
  let entry: ViewerEntry = discovery.test(initial.pathname) ? 'discovery'
    : opened.test(initial.pathname) && (exactLoad || (!loaded && atStart)) ? 'opened' : 'unknown';
  let link: { href: string; expires: number } | undefined;
  const clicked = (event: MouseEvent) => {
    if (event.button || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target as Element | null;
    const anchor = target?.closest?.<HTMLAnchorElement>('a[href]');
    if (anchor && !anchor.hasAttribute('download') && (!anchor.target || anchor.target === '_self')
      && anchor.origin === doc.location.origin && opened.test(anchor.pathname)) {
      link = { href: anchor.href, expires: Date.now() + 3_000 };
    }
  };
  const changed = (event: Event) => {
    const { from, navigationType } = event as Event & { from?: { url?: string; key?: string }; navigationType?: string };
    const url = new URL(doc.URL);
    if (href === url.href && navigationType === 'replace') return;
    const previous = from?.url ? new URL(from.url) : undefined;
    if (discovery.test(url.pathname)) entry = 'discovery';
    else if (!opened.test(url.pathname) || previous?.origin !== url.origin || navigationType === 'traverse') entry = 'unknown';
    else if (link?.href === url.href && link.expires >= Date.now()) entry = 'opened';
    else if (discovery.test(previous.pathname)) entry = 'discovery';
    else if (opened.test(previous.pathname)) {
      if (href !== previous.href || navigationType !== 'replace' || !from?.key || from.key !== navigation?.currentEntry?.key) {
        entry = 'unknown';
      }
    } else entry = 'opened';
    href = url.href;
    link = undefined;
    doc.dispatchEvent(new Event('focus-route-change'));
  };
  navigation?.addEventListener('currententrychange', changed);
  doc.addEventListener('click', clicked, true);
  return {
    current(): ViewerEntry {
      if (discovery.test(doc.location.pathname)) return 'discovery';
      if (href !== doc.URL && link?.href === doc.URL && link.expires >= Date.now()) {
        href = doc.URL;
        entry = 'opened';
        link = undefined;
      }
      return doc.URL === href ? entry : 'unknown';
    },
    stop() {
      navigation?.removeEventListener('currententrychange', changed);
      doc.removeEventListener('click', clicked, true);
    },
  };
}

export const instagramEntry = { discovery: /^\/reels\/?$/, opened: /^\/reels?\/[\w-]+\/?$/ };
export const youtubeEntry = { discovery: /^\/shorts\/?$/, opened: /^\/shorts\/[\w-]+\/?$/ };
export const tiktokEntry = { discovery: /^\/(?:foryou\/?)?$/, opened: /^\/@[^/]+\/video\/\d+\/?$/ };

export function shortVideoSite(hostname: string) {
  switch (hostname) {
    case 'www.instagram.com':
    case 'instagram.com': return 'instagram';
    case 'www.youtube.com': return 'youtube';
    case 'www.tiktok.com': return 'tiktok';
  }
}

function snapScroller(element: HTMLElement, pinned?: HTMLElement) {
  if (element === pinned) return true;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return !!style && /^(y|block) mandatory$/.test(style.scrollSnapType)
    && element.clientHeight > 0 && element.scrollHeight > element.clientHeight;
}

function activeVideo(scroller: HTMLElement, selector = 'video') {
  const box = scroller.getBoundingClientRect();
  const midpoint = box.top + box.height / 2;
  let active: HTMLVideoElement | undefined;
  for (const video of scroller.querySelectorAll<HTMLVideoElement>(selector)) {
    if (video.closest('[hidden], [inert], [aria-hidden="true"]')) continue;
    const rect = video.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0 || rect.top > midpoint || rect.bottom <= midpoint) continue;
    if (active) return;
    active = video;
  }
  return active;
}

const instagramAdvance = '[role="toolbar"] > div[role="button"]';
const instagramComposer = 'input[placeholder^="Add a comment" i], textarea[placeholder^="Add a comment" i], [role="textbox"][aria-label^="Add a comment" i]';

function instagramComments(doc: Document, scroller: HTMLElement) {
  let result: HTMLElement | undefined;
  for (const editor of doc.querySelectorAll(instagramComposer)) {
    if (editor.closest('main, [hidden], [inert], [aria-hidden="true"]')) continue;
    let host = editor.parentElement;
    for (let depth = 0; host && depth < 6; depth++, host = host.parentElement) {
      if (host.contains(scroller) || host.querySelector('video') || host === doc.body) break;
      const panes = Array.from(host.querySelectorAll<HTMLElement>('div')).filter((pane) => pane.clientHeight >= 36 && scrollableY(pane));
      if (panes.length > 1 || (panes[0] && result && panes[0] !== result)) return;
      if (panes[0]) { result = panes[0]; break; }
    }
  }
  return result;
}

export function findInstagramViewer(doc: Document, pinned?: HTMLElement, entry: ViewerEntry = 'opened'): Viewer | undefined {
  const path = doc.location?.pathname ?? '';
  if (instagramEntry.discovery.test(path)) entry = 'discovery';
  else if (!instagramEntry.opened.test(path)) return;
  const scrollers = Array.from(doc.querySelectorAll<HTMLElement>('main > div')).filter((node) => snapScroller(node, pinned));
  if (scrollers.length !== 1) return;
  const scroller = scrollers[0];
  const video = activeVideo(scroller);
  if (!video) return;
  const toolbar = scroller.parentElement?.querySelector(':scope > div[role="toolbar"]');
  const controls = toolbar?.children.length === 2 && Array.from(toolbar.children).every((child) => child.matches('div[role="button"]'))
    ? toolbar : undefined;
  return { scroller, video, entry, controls, advance: controls ? instagramAdvance : undefined, comments: instagramComments(doc, scroller) };
}

export function findYouTubeViewer(doc: Document, pinned?: HTMLElement, entry: ViewerEntry = 'opened'): Viewer | undefined {
  const path = doc.location.pathname;
  if (youtubeEntry.discovery.test(path)) entry = 'discovery';
  else if (!youtubeEntry.opened.test(path)) return;
  const scroller = doc.querySelector<HTMLElement>('ytd-shorts #shorts-container');
  if (!scroller || !snapScroller(scroller, pinned)) return;
  const video = activeVideo(scroller, 'ytd-reel-video-renderer video');
  const controls = scroller.closest('ytd-shorts');
  if (!video || !controls) return;
  const panes = Array.from(doc.querySelectorAll<HTMLElement>('ytd-comments > ytd-item-section-renderer#sections > div#contents'))
    .filter((pane) => pane.clientHeight > 0 && pane.querySelector('ytd-comment-thread-renderer'));
  return { scroller, video, entry, controls, advance: '#navigation-button-up, #navigation-button-down',
    comments: panes.length === 1 ? panes[0] : undefined };
}

const tiktokScroller = '#column-list-container';
const tiktokVideo = 'article[data-e2e="recommend-list-item-container"] [data-e2e="feed-video"] video';
const tiktokAdvance = 'button:is([data-e2e="feed-navigation-prev"], [data-e2e="feed-navigation-next"])';
const hiddenViewer = '[hidden], [inert], [aria-hidden="true"]';

function tiktokDirectComments(doc: Document, scroller: HTMLElement) {
  let pane: HTMLElement | undefined;
  for (const row of doc.querySelectorAll<HTMLElement>('[data-e2e="comment-level-1"]')) {
    if (scroller.contains(row) || row.closest(hiddenViewer) || !row.getClientRects().length
      || doc.defaultView?.getComputedStyle(row).visibility !== 'visible') continue;
    for (let node = row.parentElement; node && node !== doc.body && !node.contains(scroller); node = node.parentElement) {
      if (!scrollableY(node)) continue;
      if (pane && pane !== node) return;
      pane = node;
      break;
    }
  }
  return pane;
}

export function findTikTokViewer(doc: Document, pinned?: HTMLElement, entry: ViewerEntry = 'opened'): Viewer | undefined {
  const path = doc.location.pathname;
  if (tiktokEntry.discovery.test(path)) entry = 'discovery';
  else if (!tiktokEntry.opened.test(path)) return;
  const candidates = doc.querySelectorAll<HTMLElement>(tiktokScroller);
  let scroller: HTMLElement | undefined;
  for (const candidate of candidates) {
    const main = candidate.closest('main');
    if (main ? !candidate.closest('[data-e2e="anchoring-player-column"]') : !tiktokEntry.opened.test(path)) continue;
    if (candidate.closest(hiddenViewer) || doc.defaultView?.getComputedStyle(candidate).visibility !== 'visible'
      || !snapScroller(candidate, pinned)) continue;
    if (scroller) return;
    scroller = candidate;
  }
  if (!scroller) return;
  const video = activeVideo(scroller, tiktokVideo);
  if (!video) return;
  const main = scroller.closest('main');
  if (main) return { scroller, video, entry, controls: main, advance: tiktokAdvance };

  const controls = scroller.parentElement;
  if (controls?.localName !== 'div') return;
  const buttons = controls.querySelectorAll(`:scope > ${tiktokAdvance}`);
  if (buttons.length !== 2 || buttons[0].getAttribute('data-e2e') === buttons[1].getAttribute('data-e2e')) return;
  return { scroller, video, entry, controls,
    advance: `${tiktokAdvance}:is(${tiktokScroller} ~ button, button:has(~ ${tiktokScroller}))`,
    comments: tiktokDirectComments(doc, scroller) };
}

const textEntry = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"]';
const verticalKeys: Record<string, number | undefined> = { ArrowDown: 1, ArrowUp: -1, PageDown: 1, PageUp: -1, End: 1, Home: -1 };

function scrollableY(element: Element) {
  return element.clientHeight > 0 && element.scrollHeight > element.clientHeight + 1
    && /^(auto|scroll|overlay)$/.test(element.ownerDocument.defaultView?.getComputedStyle(element).overflowY ?? '');
}

function scrollPane(target: Element, scroller: HTMLElement, boundary: Element) {
  for (let node: Element | null = target; node && node !== scroller; node = node.parentElement) {
    if (scrollableY(node)) return node;
    if (node === boundary) return;
  }
}

function canScroll(pane: Element, direction: number) {
  return direction < 0 ? pane.scrollTop > 1 : pane.scrollTop + pane.clientHeight < pane.scrollHeight - 1;
}

function consume(event: Event, cancel = true) {
  if (cancel) event.preventDefault();
  event.stopImmediatePropagation();
}

function overrideStyles(node: HTMLElement, properties: readonly (readonly [string, string])[]) {
  const previous = properties.map(([name, value]) => {
    const old = [node.style.getPropertyValue(name), node.style.getPropertyPriority(name)] as const;
    node.style.setProperty(name, value, 'important');
    return old;
  });
  return () => {
    for (const [index, [name, value]] of properties.entries()) {
      if (node.style.getPropertyValue(name) !== value || node.style.getPropertyPriority(name) !== 'important') continue;
      const [old, priority] = previous[index];
      if (old) node.style.setProperty(name, old, priority);
      else node.style.removeProperty(name);
    }
  };
}

function pin(scroller: HTMLElement) {
  const top = scroller.scrollTop;
  const restoreStyles = overrideStyles(scroller, [['scroll-snap-type', 'none'], ['overflow-y', 'hidden'], ['scroll-behavior', 'auto']]);
  const win = scroller.ownerDocument.defaultView!;
  const restorePosition = (event?: Event) => {
    if ((event && event.target !== scroller) || scroller.scrollTop === top) return;
    scroller.scrollTop = top;
    event?.stopImmediatePropagation();
  };
  restorePosition();
  win.addEventListener('scroll', restorePosition, true);
  return () => {
    win.removeEventListener('scroll', restorePosition, true);
    restoreStyles();
  };
}

export function startNavigationLock(doc: Document, mode: NavigationLock, findViewer: FindViewer) {
  const win = doc.defaultView!;
  let viewer: Viewer | undefined;
  let unpin: (() => void) | undefined;
  let releaseComments: (() => void) | undefined;
  let touch: { id: number; x: number; y: number; originX: number; originY: number } | undefined;
  const release = () => {
    unpin?.();
    unpin = undefined;
    releaseComments?.();
    releaseComments = undefined;
    viewer = undefined;
    touch = undefined;
  };
  const reconcile = () => {
    const next = findViewer(doc, viewer?.scroller);
    const eligible = next && (next.entry === 'opened' || mode === 'allShortVideoViewers') ? next : undefined;
    if (eligible?.scroller !== viewer?.scroller) {
      unpin?.();
      unpin = eligible && pin(eligible.scroller);
      touch = undefined;
    }
    if (eligible?.comments !== viewer?.comments) {
      releaseComments?.();
      releaseComments = eligible?.comments instanceof HTMLElement
        ? overrideStyles(eligible.comments, [['overscroll-behavior-y', 'contain']]) : undefined;
    }
    viewer = eligible;
  };
  const scope = (event: Event) => {
    if (!viewer?.scroller.isConnected) return;
    const target = event.target;
    if (!target || (target as Node).nodeType !== 1) return;
    const element = target as Element;
    const { scroller, comments } = viewer;
    const inComments = comments?.contains(element);
    const boundary = inComments ? comments! : scroller;
    if (inComments || scroller.contains(element)) return { element, pane: scrollPane(element, scroller, boundary) };
  };
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const location = scope(event);
    if (location) consume(event, !location.pane || !canScroll(location.pane, event.deltaY));
  };
  const isAdvance = (event: Event) => {
    const target = event.target as Element | null;
    if (!viewer?.advance || !viewer.scroller.isConnected || !target?.closest) return false;
    const control = target.closest(viewer.advance);
    return !!control && (viewer.controls ?? viewer.scroller).contains(control);
  };
  const key = (event: KeyboardEvent) => {
    if ((event.key === 'Enter' || event.key === ' ') && isAdvance(event)) { consume(event); return; }
    const direction = verticalKeys[event.key];
    if (!viewer?.scroller.isConnected || typeof direction !== 'number' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const location = scope(event);
    if (location?.element.closest(textEntry)) return;
    if (location) consume(event, !location.pane || !canScroll(location.pane, direction));
    else if (event.target === doc.body || event.target === doc.documentElement || event.target === doc) consume(event);
  };
  const click = (event: MouseEvent) => {
    if (isAdvance(event)) consume(event);
  };
  const touchstart = (event: TouchEvent) => {
    const point = event.touches[0];
    touch = point && event.touches.length === 1 && scope(event)
      ? { id: point.identifier, x: point.clientX, y: point.clientY, originX: point.clientX, originY: point.clientY } : undefined;
  };
  const touchmove = (event: TouchEvent) => {
    if (!touch || event.touches.length !== 1) return;
    const point = event.touches[0];
    if (!point || point.identifier !== touch.id) return;
    const delta = touch.y - point.clientY;
    const horizontal = touch.x - point.clientX;
    touch.x = point.clientX;
    touch.y = point.clientY;
    if (!delta || Math.abs(horizontal) > Math.abs(delta)) return;
    const location = scope(event);
    if (location) consume(event, !location.pane || !canScroll(location.pane, delta));
  };
  const touchend = (event: TouchEvent) => {
    const start = touch;
    touch = undefined;
    const point = event.changedTouches[0];
    if (!start || point?.identifier !== start.id) return;
    const delta = Math.abs(start.originY - point.clientY);
    if (delta >= 8 && delta > Math.abs(start.originX - point.clientX) && scope(event)) consume(event);
  };
  const clearTouch = () => { touch = undefined; };
  const listeners = new AbortController();
  const capture = { capture: true, signal: listeners.signal };
  win.addEventListener('wheel', wheel, { ...capture, passive: false });
  win.addEventListener('keydown', key, capture);
  win.addEventListener('click', click, capture);
  win.addEventListener('touchstart', touchstart, { ...capture, passive: true });
  win.addEventListener('touchmove', touchmove, { ...capture, passive: false });
  win.addEventListener('touchend', touchend, { ...capture, passive: false });
  win.addEventListener('touchcancel', clearTouch, capture);
  win.addEventListener('popstate', () => { release(); reconcile(); }, capture);
  win.addEventListener('pagehide', release, capture);
  win.addEventListener('pageshow', reconcile, capture);
  win.addEventListener('loadedmetadata', (event) => {
    if ((event.target as Element | null)?.localName === 'video') reconcile();
  }, capture);
  win.addEventListener('resize', reconcile, capture);
  doc.addEventListener('focus-route-change', reconcile, capture);
  doc.addEventListener('yt-navigate-finish', reconcile, capture);
  let frame: number | undefined;
  const observer = new MutationObserver(() => {
    if (frame !== undefined) return;
    frame = win.requestAnimationFrame(() => {
      frame = undefined;
      reconcile();
    });
  });
  observer.observe(doc, { subtree: true, childList: true, attributeFilter: ['class', 'hidden', 'aria-hidden', 'inert'] });
  reconcile();
  return () => {
    listeners.abort();
    observer.disconnect();
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    release();
  };
}
