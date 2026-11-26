import { watchFeed } from './feed';

export type RedditMode = 'recommendations' | 'all';
const recommendations = 'shreddit-post[recommendation-source], shreddit-recommendation-carousel, [data-testid="recommendation"]';
const following = '[aria-label="Following" i], [data-feed="following"]';

// Original selectors adapted from the Slice 4A For You and Following proof.
export function startRedditFilter(doc: Document, mode: RedditMode) {
  return watchFeed(doc, ['aria-selected', 'aria-label', 'class', 'role', 'recommendation-source', 'data-testid', 'data-feed'], (next) => {
    const location = doc.defaultView?.location;
    if (location?.hostname !== 'www.reddit.com' || location.port || location.pathname !== '/') return;
    const feeds = doc.querySelectorAll('main shreddit-feed');
    if (feeds.length !== 1) return;
    const feed = feeds[0];
    const tabs = doc.querySelectorAll('main faceplate-tabgroup button[role="tab"]');
    const selected = [...tabs].filter((tab) => tab.getAttribute('aria-selected') === 'true' ||
      (!tab.hasAttribute('aria-selected') && tab.classList.contains('tab-selected')));
    const followingSections = feed.querySelectorAll(following);
    if (tabs.length) {
      if (selected.length !== 1) return;
      const label = selected[0].textContent?.trim();
      if (label === 'Following') {
        if (mode === 'all') next.add(feed);
        return;
      }
      if (label !== 'For You') return;
      if (!followingSections.length) {
        next.add(feed);
        return;
      }
    }
    for (const module of feed.querySelectorAll(recommendations)) {
      if (!module.closest(following) && !module.querySelector(following)) next.add(module);
    }
    if (mode === 'all') for (const section of followingSections) next.add(section);
  });
}
