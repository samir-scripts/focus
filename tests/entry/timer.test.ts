import { expect, it } from 'vitest';
import { consumePause, type PendingPause } from '../../apps/extension/src/site-entry';

const pending: PendingPause = {
  target: 'https://www.youtube.com/watch?id=73', page: 'chrome-extension://focus/entry.html#target',
  revision: 3, siteId: 'youtube', nonce: 'current', deadline: 5000, seconds: 5,
};

it('accepts only a matching live interstitial at the background deadline', () => {
  const tryResume = (now: number, nonce = 'current', revision = 3, page = pending.page) =>
    consumePause(pending, { now, nonce, revision, page });
  expect(tryResume(4999)).toBe(false);
  expect(tryResume(5000, 'stale')).toBe(false);
  expect(tryResume(5000, 'current', 4)).toBe(false);
  expect(tryResume(5000, 'current', 3, 'chrome-extension://focus/entry.html#different')).toBe(false);
  expect(tryResume(5000)).toBe(true);
});
