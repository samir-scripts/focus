import type { XMode } from './x';
import type { RedditMode } from './reddit';

export type FeedPolicy = { enabled?: boolean; x?: XMode; reddit?: RedditMode; youtubeHome?: boolean };

const marker = 'data-focus-feed-hidden';

export function watchFeed(doc: Document, attributes: string[], collect: (next: Set<Element>) => void, nativeRouteEvent?: string) {
  let marked = new Set<Element>();
  const reconcile = () => {
    const next = new Set<Element>();
    collect(next);
    for (const node of marked) if (!next.has(node)) node.removeAttribute(marker);
    for (const node of next) if (!node.hasAttribute(marker)) node.setAttribute(marker, '');
    marked = next;
  };
  const observer = new MutationObserver(reconcile);
  observer.observe(doc, { subtree: true, childList: true, characterData: true, attributeFilter: attributes });
  doc.defaultView?.addEventListener('popstate', reconcile);
  doc.addEventListener('focus-route-change', reconcile);
  if (nativeRouteEvent) doc.addEventListener(nativeRouteEvent, reconcile);
  reconcile();
  return () => {
    observer.disconnect();
    doc.defaultView?.removeEventListener('popstate', reconcile);
    doc.removeEventListener('focus-route-change', reconcile);
    if (nativeRouteEvent) doc.removeEventListener(nativeRouteEvent, reconcile);
    for (const node of marked) node.removeAttribute(marker);
  };
}

export function exactDocumentOrigin(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (!parsed.port && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) return `${parsed.origin}/*`;
  } catch { /* Local and non-web tabs are not in scope. */ }
}
