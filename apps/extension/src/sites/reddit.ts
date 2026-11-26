import { watchFeed } from './feed';

export type RedditMode = 'recommendations' | 'all';
const recommendations = 'shreddit-post[recommendation-source], shreddit-recommendation-carousel, [data-testid="recommendation"]';

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
    if (tabs.length) {
      if (selected.length !== 1) return;
      const label = selected[0].textContent?.trim();
      if (label === 'For You' || (label === 'Following' && mode === 'all')) next.add(feed);
      return;
    }
    for (const module of feed.querySelectorAll(recommendations)) {
      if (!module.closest('[aria-label="Following" i], [data-feed="following"]')) next.add(module);
    }
  });
}
