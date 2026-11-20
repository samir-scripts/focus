import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import Popup from '../../apps/extension/src/Popup.svelte';

function mountPopup(url: string | undefined, origins: string[]) {
  const create = vi.fn();
  const sendMessage = vi.fn((_message: unknown, reply: (result: { ok: boolean }) => void) => reply({ ok: true }));
  vi.stubGlobal('chrome', {
    storage: { local: { get: (_keys: string[], reply: (value: { status: string }) => void) => reply({ status: 'Connected' }) } },
    permissions: { getAll: (reply: (value: { origins: string[] }) => void) => reply({ origins }) },
    tabs: { query: (_query: unknown, reply: (tabs: { url?: string }[]) => void) => reply([{ url }]), create },
    runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}`, sendMessage },
  });
  render(Popup);
  return { create, sendMessage };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  { url: undefined, origins: [] },
  { url: 'https://example.org/', origins: ['https://example.org/*'] },
  { url: 'https://www.reddit.com/r/example', origins: ['http://www.reddit.com/*', 'https://reddit.com/*'] },
])('offers Setup, not the desktop editor, without a granted catalog address ($url)', async ({ url, origins }) => {
  vi.spyOn(window, 'close').mockImplementation(() => {});
  const { create, sendMessage } = mountPopup(url, origins);
  await screen.findByText('Connected');
  expect(screen.getByText(/Needs access/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Open in focus.' })).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: 'Browser setup' }));
  expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://fixture/setup.html' });
  expect(sendMessage).not.toHaveBeenCalled();
});

it('opens the actual catalog site when the current address is granted', async () => {
  const { sendMessage } = mountPopup('https://old.reddit.com/r/example', ['*://old.reddit.com/*']);
  const open = await screen.findByRole('button', { name: 'Open in focus.' });
  expect(screen.getByRole('heading', { name: 'Reddit' })).toBeTruthy();
  expect(screen.queryByText(/Needs access/)).toBeNull();
  await fireEvent.click(open);
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'open-desktop', siteId: 'reddit' }, expect.any(Function));
});
