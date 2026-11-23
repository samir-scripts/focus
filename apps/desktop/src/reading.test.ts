import { expect, it } from 'vitest';
import { parsePreview, webUrl } from './reading';

import partial from './test-fixtures/glance/partial.html?raw';
import empty from './test-fixtures/glance/empty.html?raw';
import offline from './test-fixtures/glance/offline.html?raw';

it('reads actual pinned Glance RSS/Atom results, retaining successes during partial failure', () => {
  const preview = parsePreview(partial);
  expect(preview.state).toBe('partial');
  expect(preview.items).toEqual([
    { title: 'Newest & literal <script>', source: 'Renamed fixture', url: 'https://example.com/new' },
    { title: 'Atom story', source: 'Atom fixture', url: 'https://example.com/atom' },
    { title: 'Old story', source: 'Renamed fixture', url: 'https://example.com/old' },
  ]);
});

it('distinguishes a valid empty feed and an unavailable feed', () => {
  expect(parsePreview(empty)).toEqual({ state: 'empty', items: [] });
  expect(parsePreview(offline)).toEqual({ state: 'offline', items: [] });
});

it('accepts HTTP(S) article links and rejects credentials and pseudo URLs', () => {
  expect(webUrl('https://example.com/a?q=1#article')).toBe('https://example.com/a?q=1#article');
  for (const url of ['javascript:alert(1)', 'file:///tmp/file', 'https://name@example.com/', '/relative']) {
    expect(webUrl(url)).toBeNull();
  }
});
