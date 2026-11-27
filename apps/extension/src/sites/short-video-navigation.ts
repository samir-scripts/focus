export type NavigationMode = 'off' | 'openedVideos' | 'allShortVideoViewers';
export type NavigationLock = Exclude<NavigationMode, 'off'>;

type Viewer = {
  scroller: HTMLElement;
  video: HTMLVideoElement;
  entry: ViewerEntry;
  advance: string;
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
  let { href } = new URL(doc.URL);
  let entry: ViewerEntry = discovery.test(doc.location.pathname) ? 'discovery'
    : atStart && opened.test(doc.location.pathname) ? 'opened' : 'unknown';
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
    else if (discovery.test(previous.pathname)
      || (entry === 'discovery' && href === previous.href && navigationType === 'replace'
        && !!from?.key && from.key === navigation?.currentEntry?.key)) entry = 'discovery';
    else entry = 'opened';
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

const instagramAdvance = 'button:is([aria-label="Next reel" i], [aria-label="Previous reel" i]), [role="button"]:is([aria-label="Next reel" i], [aria-label="Previous reel" i])';

export function findInstagramViewer(doc: Document, pinned?: HTMLElement, entry: ViewerEntry = 'opened'): Viewer | undefined {
  const path = doc.location?.pathname ?? '';
  if (instagramEntry.discovery.test(path)) entry = 'discovery';
  else if (!instagramEntry.opened.test(path)) return;
  const scrollers = Array.from(doc.querySelectorAll<HTMLElement>('main > div')).filter((node) => snapScroller(node, pinned));
  if (scrollers.length !== 1) return;
  const scroller = scrollers[0];
  const video = activeVideo(scroller);
  if (video) return { scroller, video, entry, advance: instagramAdvance, controls: scroller.parentElement ?? undefined };
}

const textEntry = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"]';
const verticalKeys: Record<string, number | undefined> = { ArrowDown: 1, ArrowUp: -1, PageDown: 1, PageUp: -1, End: 1, Home: -1 };

function scrollPane(target: Element, scroller: HTMLElement, boundary: Element) {
  for (let node: Element | null = target; node && node !== scroller; node = node.parentElement) {
    if (node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 1
      && /^(auto|scroll|overlay)$/.test(node.ownerDocument.defaultView?.getComputedStyle(node).overflowY ?? '')) return node;
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

function pin(scroller: HTMLElement) {
  const top = scroller.scrollTop;
  const properties = [['scroll-snap-type', 'none'], ['overflow-y', 'hidden'], ['scroll-behavior', 'auto']] as const;
  const previous = properties.map(([name, value]) => {
    const old = [scroller.style.getPropertyValue(name), scroller.style.getPropertyPriority(name)] as const;
    scroller.style.setProperty(name, value, 'important');
    return old;
  });
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
    for (const [index, [name, value]] of properties.entries()) {
      if (scroller.style.getPropertyValue(name) !== value || scroller.style.getPropertyPriority(name) !== 'important') continue;
      const [old, priority] = previous[index];
      if (old) scroller.style.setProperty(name, old, priority);
      else scroller.style.removeProperty(name);
    }
  };
}

export function startNavigationLock(doc: Document, mode: NavigationLock, findViewer: FindViewer) {
  const win = doc.defaultView!;
  let viewer: Viewer | undefined;
  let unpin: (() => void) | undefined;
  let touch: { id: number; x: number; y: number; originX: number; originY: number } | undefined;
  const release = () => {
    unpin?.();
    unpin = undefined;
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
    if (!viewer?.scroller.isConnected || !target?.closest) return false;
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
  const ended = (event: Event) => {
    if (event.target === viewer?.video) consume(event, false);
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
  win.addEventListener('ended', ended, capture);
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
  const observer = new MutationObserver(reconcile);
  observer.observe(doc, { subtree: true, childList: true, attributeFilter: ['class', 'hidden', 'aria-hidden', 'inert'] });
  reconcile();
  return () => {
    listeners.abort();
    observer.disconnect();
    release();
  };
}
