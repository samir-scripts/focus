import { watchFeed } from './feed';

export type InstagramRules = { suggested: boolean; reels: boolean };

const discovery = '/reels';
const individual = /^\/reels?\/([\w-]+)\/?$/;

// Original semantic selectors; signed-in production markup has not been qualified.
// Avoid generated classes and never infer a recommendation from the linked media alone.
export function startInstagramFilter(doc: Document, rules: InstagramRules) {
  return watchFeed(doc, ['href', 'aria-label', 'aria-labelledby', 'role'], (next) => {
    const url = new URL(doc.URL);
    if (url.protocol !== 'https:' || url.port || !['www.instagram.com', 'instagram.com'].includes(url.hostname)) return;
    const path = url.pathname.replace(/\/$/, '');
    const currentReel = individual.exec(path)?.[1];
    const home = path === '' && url.search === '';
    if (rules.reels) {
      for (const link of doc.querySelectorAll<HTMLAnchorElement>('nav a[href], [role="navigation"] a[href]')) {
        if (link.origin === url.origin && link.pathname.replace(/\/$/, '') === discovery) next.add(link);
      }
    }
    if (home && rules.suggested) {
      for (const header of doc.querySelectorAll('main article > header')) {
        if (header.textContent?.trim() === 'Suggested for you') next.add(header.parentElement!);
      }
    }
    if (!rules.reels) return;
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
