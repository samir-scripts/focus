import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import App from './App.svelte';
import type { ReadingSettings } from './reading';

afterEach(() => history.replaceState(null, '', location.pathname));

it('does not load feeds until an explicit opt-in; shows successful headlines as text', async () => {
  const preview = vi.fn(async () => ({ state: 'partial' as const, items: [{ title: '<strong>Headline</strong>', source: 'RSS', url: 'https://example.com/story' }] }));
  const save = vi.fn(async (settings: ReadingSettings) => settings);
  render(App, { readingBridge: {
    settings: async () => ({ enabled: false, feeds: [], page: null }),
    preview, save, reset: vi.fn(), open: vi.fn(), article: vi.fn(), onConfirmed: async () => () => {},
  } });
  await fireEvent.click(await screen.findByRole('button', { name: 'Set up Reading' }));
  const feed = screen.getByRole('textbox', { name: 'RSS or Atom URL' });
  await fireEvent.input(feed, { target: { value: 'https://example.com/rss' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Add feed' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ enabled: false, feeds: [{ url: 'https://example.com/rss', name: '' }], page: null }));
  expect(preview).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByRole('checkbox', { name: 'Enable Reading' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Home' }));
  expect(await screen.findByRole('button', { name: '<strong>Headline</strong>' })).toBeTruthy();
  expect(screen.getByText('Some feeds are unavailable.')).toBeTruthy();
  expect(preview).toHaveBeenCalledOnce();
});

it('keeps Sessions usable and requires an explicit reset when Reading preferences cannot load', async () => {
  const preview = vi.fn();
  const save = vi.fn();
  const reset = vi.fn(async () => ({ enabled: false, feeds: [], page: null }))
    .mockRejectedValueOnce('Could not keep a copy of the original Reading settings.');
  const openSessions = vi.fn(async () => {});
  render(App, { openSessions, readingBridge: {
    settings: async () => { throw 'reading_settings_recovery'; },
    preview, save, reset, open: vi.fn(), article: vi.fn(), onConfirmed: async () => () => {},
  } });
  await fireEvent.click(await screen.findByRole('button', { name: 'Manage Reading settings' }));
  expect(screen.getByRole('alert').textContent).toMatch(/Reading is off/);
  expect(screen.queryByRole('button', { name: 'Add feed' })).toBeNull();
  expect(reset).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByRole('button', { name: 'Reset Reading settings' }));
  expect(await screen.findByText('Could not keep a copy of the original Reading settings.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add feed' })).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: 'Reset Reading settings' }));
  expect(await screen.findByRole('checkbox', { name: 'Enable Reading' })).toHaveProperty('checked', false);
  await fireEvent.click(screen.getByRole('button', { name: 'Home' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Open sessions' }));
  expect(openSessions).toHaveBeenCalledOnce();
  expect(reset).toHaveBeenCalledTimes(2);
  expect(save).not.toHaveBeenCalled();
  expect(preview).not.toHaveBeenCalled();
});

it('collapses on confirmed work without moving focus and permits deliberate reopening', async () => {
  let onStarted: (() => void) | undefined;
  const open = vi.fn(async () => {});
  render(App, {
    readingBridge: {
      settings: async () => ({ enabled: true, feeds: [{ url: 'https://example.com/rss', name: '' }], page: null }),
      preview: async () => ({ state: 'ready', items: [{ title: 'Headline', source: 'RSS', url: 'https://example.com/story' }] }),
      save: vi.fn(), reset: vi.fn(), open, article: vi.fn(),
      onConfirmed: async (callback: () => void) => { onStarted = callback; return () => {}; },
    },
  });
  await screen.findByRole('button', { name: 'Headline' });
  const focus = screen.getByRole('button', { name: 'Home' });
  focus.focus();
  expect(onStarted).toBeTypeOf('function');
  onStarted?.();
  await screen.findByRole('button', { name: 'Show headlines' });
  expect(document.activeElement).toBe(focus);
  expect(screen.queryByRole('button', { name: 'Headline' })).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: 'Open Reading' }));
  expect(open).toHaveBeenCalledWith(false);
  expect(await screen.findByRole('button', { name: 'Headline' })).toBeTruthy();
});
