import { watchFeed } from './feed';

export type XMode = 'hide' | 'following';
const timeline = '[aria-label^="Timeline:"]';

// Original selectors adapted from the Slice 4A live Home proof.
export function startXFilter(doc: Document, mode: XMode) {
  let attempted = false;
  return watchFeed(doc, ['aria-selected', 'aria-label', 'aria-labelledby', 'aria-disabled', 'role', 'disabled', 'data-testid'], (next) => {
    const location = doc.defaultView?.location;
    if (location?.hostname !== 'x.com' || location.port || location.pathname !== '/home') {
      attempted = false;
      return;
    }
    const columns = doc.querySelectorAll('main [data-testid="primaryColumn"]');
    if (columns.length !== 1) return;
    const column = columns[0];
    const tabs = [...column.querySelectorAll<HTMLElement>('[role="tab"]')];
    const home = tabs.filter((tab) => tab.textContent?.trim() === 'For you');
    const following = tabs.filter((tab) => tab.textContent?.trim() === 'Following');
    if (home.length !== 1 || following.length !== 1 || home[0].getAttribute('aria-selected') !== 'true' ||
        following[0].getAttribute('aria-selected') !== 'false') return;
    if (mode === 'following' && !attempted && !following[0].matches(':disabled, [aria-disabled="true"]')) {
      attempted = true;
      following[0].click();
      if (home[0].getAttribute('aria-selected') !== 'true' || following[0].getAttribute('aria-selected') !== 'false') return;
    }
    const candidates = [...column.querySelectorAll(timeline)].filter((node) =>
      (node.closest('section[aria-labelledby]') || node.querySelector('article[data-testid="tweet"]')) &&
      !node.querySelector('[data-testid="tweetTextarea_0"]'));
    if (candidates.length === 1) next.add(candidates[0]);
  });
}
