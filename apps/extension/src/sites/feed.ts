const marker = 'data-focus-feed-hidden';

export function watchFeed(doc: Document, attributes: string[], collect: (next: Set<Element>) => void) {
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
  reconcile();
  return () => {
    observer.disconnect();
    doc.defaultView?.removeEventListener('popstate', reconcile);
    doc.removeEventListener('focus-route-change', reconcile);
    for (const node of marked) node.removeAttribute(marker);
  };
}

export function exactDocumentOrigin(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (!parsed.port && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) return `${parsed.origin}/*`;
  } catch { /* Local and non-web tabs are not in scope. */ }
}
