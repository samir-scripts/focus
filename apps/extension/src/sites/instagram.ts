import { watchFeed } from './feed';

export type InstagramRules = { suggested: boolean; reels: boolean };

const discovery = '/reels';
const individual = /^\/reels?\/([\w-]+)\/?$/;

function instagramUrl(url: URL) {
  return url.protocol === 'https:' && !url.port && (url.hostname === 'www.instagram.com' || url.hostname === 'instagram.com');
}

type DiscoveryProvenance = {
  applyPolicy: (enabled: boolean, firstResponse: boolean) => void;
  owns: (url: URL) => boolean;
  stop: () => void;
};

// Evidence is local to one document and one transition, never inferred from delayed
// background reconciliation or from an individual-shaped destination alone.
export function trackInstagramDiscovery(doc: Document, navigation = doc.readyState === 'loading'
  ? (doc.defaultView as (Window & { navigation?: EventTarget }) | null)?.navigation
  : undefined): DiscoveryProvenance {
  const initial = new URL(doc.URL);
  const isEntry = (url: URL) => /^\/reels\/?$/.test(url.pathname) && !url.search && !url.hash;
  const observing = !!navigation && instagramUrl(initial);
  let pending = observing && isEntry(initial) ? initial.href : undefined;
  let canonical: string | undefined;
  let active = false;
  const reset = () => { pending = undefined; canonical = undefined; };
  const leaveDocument = () => {
    reset();
    doc.dispatchEvent(new Event('focus-route-change'));
  };
  const changed = (event: Event) => {
    const { from, navigationType } = event as Event & { from?: { url?: string }; navigationType?: string };
    const forward = navigationType === 'push' || navigationType === 'replace';
    if (forward && from?.url === doc.URL) return;
    const current = new URL(doc.URL);
    if (forward && from?.url && new URL(from.url).origin === initial.origin && current.origin === initial.origin) {
      if (pending === from.url && individual.test(current.pathname) && !current.search && !current.hash) {
        reset();
        canonical = current.href;
      } else {
        reset();
        if (active && isEntry(current)) pending = current.href;
      }
    } else {
      reset();
    }
    doc.dispatchEvent(new Event('focus-route-change'));
  };
  if (observing) {
    navigation?.addEventListener('currententrychange', changed);
    doc.defaultView?.addEventListener('pagehide', leaveDocument);
  }
  return {
    applyPolicy(enabled, firstResponse) {
      if (!enabled || (!firstResponse && canonical && !active)) reset();
      active = enabled;
    },
    owns: (url) => canonical === url.href,
    stop() {
      reset();
      navigation?.removeEventListener('currententrychange', changed);
      doc.defaultView?.removeEventListener('pagehide', leaveDocument);
    },
  };
}

const railPaths = new Set(['', '/explore', '/direct/inbox', discovery]);
const contentBoundary = 'main, article, aside, [role="main"], [role="article"], [role="complementary"], [role="dialog"]';

function isRailShortcut(link: HTMLAnchorElement, origin: string) {
  if (link.closest(contentBoundary)) return false;
  // The observed rail has three wrappers around the link and seven sibling entries.
  let group = link.parentElement;
  for (let depth = 0; group && depth < 4; depth++, group = group.parentElement) {
    if (!group.matches('div, nav, [role="navigation"]') || group.childElementCount < 4) continue;
    if (group.childElementCount > 8 || group.querySelector(`${contentBoundary}, video, audio, iframe`)) return false;
    const paths = new Set<string>();
    for (const sibling of group.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const path = sibling.pathname.replace(/\/$/, '');
      if (!railPaths.has(path)) continue;
      if (sibling.origin !== origin || sibling.search || sibling.hash || paths.has(path)) return false;
      paths.add(path);
    }
    // Don't widen to an outer group if the first plausible group was incomplete.
    return paths.size === railPaths.size;
  }
  return false;
}

function discoveryViewer(doc: Document, origin: string, currentReel: string | undefined) {
  const mains = doc.querySelectorAll('main');
  if (mains.length !== 1 || mains[0].childElementCount !== 2) return;
  let viewer: Element | undefined;
  for (const branch of mains[0].children) {
    if (branch.tagName !== 'DIV') return;
    if (!branch.querySelector('video')) {
      if (!branch.querySelector('button, [role="button"]') || branch.querySelector('audio, iframe')) return;
      continue;
    }
    if (viewer || branch.querySelector('video[controls], audio, iframe, article, nav, aside, [role="dialog"]')) return;
    for (const link of branch.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      if (link.origin === origin && individual.exec(link.pathname)?.[1] === currentReel) return;
    }
    viewer = branch;
  }
  return viewer;
}

// Avoid generated classes and never infer a recommendation from the linked media alone.
export function startInstagramFilter(doc: Document, rules: InstagramRules, provenance?: DiscoveryProvenance) {
  return watchFeed(doc, ['href', 'aria-label', 'aria-labelledby', 'role', 'controls'], (next) => {
    const url = new URL(doc.URL);
    if (!instagramUrl(url)) return;
    const path = url.pathname.replace(/\/$/, '');
    const currentReel = individual.exec(path)?.[1];
    const home = path === '' && url.search === '';
    if (rules.reels) {
      for (const link of doc.querySelectorAll<HTMLAnchorElement>('a[href$="/reels/"], a[href$="/reels"]')) {
        if (link.origin === url.origin && !link.search && !link.hash &&
            link.pathname.replace(/\/$/, '') === discovery && isRailShortcut(link, url.origin)) next.add(link);
      }
    }
    if (home && rules.suggested) {
      for (const header of doc.querySelectorAll('main article > header')) {
        if (header.textContent?.trim() === 'Suggested for you') next.add(header.parentElement!);
      }
    }
    if (!rules.reels) return;
    if (provenance?.owns(url)) {
      const viewer = discoveryViewer(doc, url.origin, currentReel);
      if (viewer) next.add(viewer);
    }
    if (path === discovery) {
      for (const feed of doc.querySelectorAll('main section[aria-label="Reels"], main [role="feed"][aria-label="Reels"]')) {
        next.add(feed);
      }
    } else if (home || currentReel) {
      for (const shelf of doc.querySelectorAll('main section[aria-label="Suggested reels"], main [role="region"][aria-label="Suggested reels"]')) {
        // A recommendation label alone cannot tell us which player this region owns.
        if (currentReel && shelf.querySelector('video, audio, iframe, [role="dialog"]')) continue;
        let separateRecommendation = false;
        for (const link of shelf.querySelectorAll<HTMLAnchorElement>('a[href]')) {
          if (link.origin !== url.origin) continue;
          const linkedReel = individual.exec(link.pathname)?.[1];
          if (!linkedReel) continue;
          if (linkedReel === currentReel) {
            separateRecommendation = false;
            break;
          }
          separateRecommendation = true;
        }
        if (separateRecommendation) next.add(shelf);
      }
    }
  });
}
