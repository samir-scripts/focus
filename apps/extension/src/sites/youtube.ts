import { watchFeed } from './feed';

// Selectors are original, limited to explicit YouTube Shorts renderer and link structures.
const navigation = 'ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytm-pivot-bar-item-renderer';
const shelves = 'ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], ytm-reel-shelf-renderer';
const candidates = `${navigation}, ${shelves}, ytd-rich-shelf-renderer, ytd-rich-item-renderer, ytd-video-renderer`;
const marker = 'data-focus-shorts';

export function startShortsFilter(doc: Document): () => void {
  if (!doc.documentElement) {
    let stop: (() => void) | undefined;
    const rootObserver = new MutationObserver(() => {
      if (doc.documentElement) { rootObserver.disconnect(); stop = startShortsFilter(doc); }
    });
    rootObserver.observe(doc, { childList: true });
    return () => { rootObserver.disconnect(); stop?.(); };
  }
  const marked = new Set<Element>();
  let pathname: string | undefined;
  let stopped = false;
  let queued = false;
  const pending = new Set<Element>();

  function allowedRoute() {
    const path = doc.defaultView?.location.pathname ?? '';
    return path !== '/shorts' && !path.startsWith('/shorts/');
  }
  function discoveryRoute() {
    const path = doc.defaultView?.location.pathname ?? '';
    return path === '/' || path === '/results' || path === '/feed/subscriptions' ||
      path.startsWith('/@') || ['/channel/', '/c/', '/user/'].some((prefix) => path.startsWith(prefix));
  }
  function reconcile(element: Element) {
    const tag = element.localName;
    const shortsNav = element.matches(navigation) && !!element.querySelector('a[href="/shorts"], a[href^="/shorts/"]');
    const discovery = discoveryRoute() && (
      element.matches(shelves) ||
      (tag === 'ytd-rich-item-renderer' && !!element.querySelector('ytd-reel-item-renderer')) ||
      (tag === 'ytd-video-renderer' && !!element.querySelector('a#thumbnail[href^="/shorts/"]'))
    );
    const hide = allowedRoute() && (shortsNav || discovery);
    if (hide) { element.setAttribute(marker, ''); marked.add(element); }
    else { element.removeAttribute(marker); marked.delete(element); }
  }
  function scan(root: Element) {
    if (root.matches(candidates)) reconcile(root);
    root.querySelectorAll(candidates).forEach(reconcile);
  }
  function flush() {
    queued = false;
    if (stopped) return;
    for (const element of pending) {
      if (element.isConnected) scan(element);
      const parent = element.closest(candidates);
      if (parent?.isConnected) reconcile(parent);
    }
    pending.clear();
  }
  function schedule(element: Element) {
    pending.add(element);
    if (!queued) { queued = true; queueMicrotask(flush); }
  }
  function routeChanged() {
    const next = doc.defaultView?.location.pathname ?? '';
    if (next === pathname) return;
    pathname = next;
    if (allowedRoute()) doc.documentElement.setAttribute('data-focus-shorts-active', '');
    else doc.documentElement.removeAttribute('data-focus-shorts-active');
    if (discoveryRoute()) doc.documentElement.setAttribute('data-focus-shorts-discovery', '');
    else doc.documentElement.removeAttribute('data-focus-shorts-discovery');
    for (const element of marked) element.removeAttribute(marker);
    marked.clear();
    scan(doc.documentElement);
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof Element) schedule(record.target.closest(candidates) ?? record.target);
      if (record.type === 'childList') {
        const parent = record.target instanceof Element ? record.target.closest(candidates) : null;
        if (parent) schedule(parent);
        for (const node of record.addedNodes) if (node instanceof Element) schedule(node);
        for (const node of record.removedNodes) {
          if (!(node instanceof Element) || node.isConnected) continue;
          if (marked.delete(node)) node.removeAttribute(marker);
          for (const child of node.querySelectorAll(`[${marker}]`)) {
            if (marked.delete(child)) child.removeAttribute(marker);
          }
        }
      }
    }
  });
  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'is-shorts'] });
  doc.addEventListener('yt-navigate-finish', routeChanged);
  doc.addEventListener('focus-route-change', routeChanged);
  doc.defaultView?.addEventListener('yt-navigate-finish', routeChanged);
  doc.defaultView?.addEventListener('popstate', routeChanged);
  routeChanged();
  return () => {
    stopped = true; observer.disconnect();
    doc.removeEventListener('yt-navigate-finish', routeChanged);
    doc.removeEventListener('focus-route-change', routeChanged);
    doc.defaultView?.removeEventListener('yt-navigate-finish', routeChanged);
    doc.defaultView?.removeEventListener('popstate', routeChanged);
    for (const element of marked) element.removeAttribute(marker);
    doc.documentElement.removeAttribute('data-focus-shorts-active');
    doc.documentElement.removeAttribute('data-focus-shorts-discovery');
  };
}

// Original selectors adapted from the Slice 4A YouTube Home grid proof.
export function startHomeRecommendationsFilter(doc: Document) {
  return watchFeed(doc, ['page-subtype', 'id', 'href', 'subscribed', 'aria-label', 'is-shorts'], (next) => {
    const location = doc.defaultView?.location;
    if (location?.hostname !== 'www.youtube.com' || location.port || location.pathname !== '/') return;
    const grids = doc.querySelectorAll('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer');
    if (grids.length !== 1) return;
    for (const card of grids[0].querySelectorAll(':scope > #contents > ytd-rich-item-renderer')) {
      if (!card.querySelector('a[href^="/watch?"], a[href^="https://www.youtube.com/watch?"]')) continue;
      if (card.querySelector('ytd-rich-shelf-renderer[is-shorts], ytd-reel-shelf-renderer, ytd-reel-item-renderer, a[href^="/shorts/"]')) continue;
      if (card.closest('[aria-label*="subscription" i]') ||
          card.querySelector('[aria-label*="subscribed" i], ytd-subscribe-button-renderer[subscribed]')) continue;
      next.add(card);
    }
  }, 'yt-navigate-finish');
}
