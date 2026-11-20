import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { startShortsFilter } from '../../apps/extension/src/sites/youtube';

const fixture = readFileSync('tests/sites/fixtures/youtube.html', 'utf8');
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
let stop: (() => void) | undefined;

afterEach(() => { stop?.(); stop = undefined; document.body.innerHTML = ''; history.replaceState(null, '', '/'); });

describe('YouTube Shorts discovery', () => {
  it('hides explicit discovery without hiding adjacent ordinary content, and reverses', () => {
    document.documentElement.innerHTML = fixture.replace(/^.*?<html>/s, '').replace('</html>', '');
    stop = startShortsFilter(document);
    for (const id of ['shorts-shelf', 'shorts-card', 'shorts-nav']) expect(document.getElementById(id)?.hasAttribute('data-focus-shorts')).toBe(true);
    for (const id of ['ordinary-video', 'playlist', 'direct-short', 'subscriptions-nav']) expect(document.getElementById(id)?.hasAttribute('data-focus-shorts')).toBe(false);
    stop(); stop = undefined;
    expect(document.querySelector('[data-focus-shorts]')).toBeNull();
  });

  it('hides explicit mobile Shorts discovery and navigation but not adjacent ordinary cards', () => {
    document.body.innerHTML = `
      <nav><ytm-pivot-bar-item-renderer id="shorts-tab"><a href="/shorts">Shorts</a></ytm-pivot-bar-item-renderer></nav>
      <ytm-reel-shelf-renderer id="mobile-shelf"><a href="/shorts/demo">Short</a></ytm-reel-shelf-renderer>
      <ytm-video-with-context-renderer id="mobile-watch"><a href="/watch?v=regular">Regular</a><a href="/shorts/shared">Shared Short</a></ytm-video-with-context-renderer>`;
    stop = startShortsFilter(document);
    expect(document.getElementById('shorts-tab')?.hasAttribute('data-focus-shorts')).toBe(true);
    expect(document.getElementById('mobile-shelf')?.hasAttribute('data-focus-shorts')).toBe(true);
    expect(document.getElementById('mobile-watch')?.hasAttribute('data-focus-shorts')).toBe(false);
  });

  it('handles late cards and recycled cards without retaining stale markers', async () => {
    document.body.innerHTML = '<main></main>';
    stop = startShortsFilter(document);
    const card = document.createElement('ytd-rich-item-renderer');
    card.innerHTML = '<ytd-reel-item-renderer><a href="/shorts/new">Short</a></ytd-reel-item-renderer>';
    document.querySelector('main')!.append(card);
    await flush();
    expect(card.hasAttribute('data-focus-shorts')).toBe(true);
    card.innerHTML = '<a href="/watch?v=normal">Normal</a>';
    await flush();
    expect(card.hasAttribute('data-focus-shorts')).toBe(false);
  });

  it('preserves direct Shorts playback across SPA navigation', async () => {
    document.body.innerHTML = '<main><ytd-reel-video-renderer id="player"><a href="/shorts/direct">Playing</a></ytd-reel-video-renderer><ytd-reel-shelf-renderer id="shelf"></ytd-reel-shelf-renderer></main>';
    stop = startShortsFilter(document);
    expect(document.getElementById('shelf')?.hasAttribute('data-focus-shorts')).toBe(true);
    history.pushState(null, '', '/shorts/direct');
    window.dispatchEvent(new Event('yt-navigate-finish'));
    await flush();
    expect(document.getElementById('player')?.hasAttribute('data-focus-shorts')).toBe(false);
    expect(document.getElementById('shelf')?.hasAttribute('data-focus-shorts')).toBe(false);
  });

  it('does not hide shelves on ordinary watch pages', () => {
    history.replaceState(null, '', '/watch?v=normal');
    document.body.innerHTML = '<ytd-reel-shelf-renderer id="shelf"></ytd-reel-shelf-renderer>';
    stop = startShortsFilter(document);
    expect(document.getElementById('shelf')?.hasAttribute('data-focus-shorts')).toBe(false);
    expect(document.documentElement.hasAttribute('data-focus-shorts-discovery')).toBe(false);
  });
});
