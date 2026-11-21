import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, expect, it } from 'vitest';
import App from './App.svelte';
import type { BrowserBridge, BrowserScan, Profile } from './browser';

afterEach(cleanup);

function bridge(overrides: Partial<BrowserBridge>): BrowserBridge {
  return {
    state: async () => ({ revision: 0, hideShorts: false, accessibility: { holdSeconds: 15, twoStepConfirmation: false }, sites: [], pending: [], profiles: [], open: null }),
    scan: async () => ({ supported: true, targets: [] }),
    install: async () => 'storeOpened',
    removeInstallation: async () => 'policyRemoved',
    setHideShorts: async () => {}, decidePair: async () => {}, revoke: async () => {},
    setEntry: async () => {}, setGrayscale: async () => {}, setAccessibility: async () => {}, designateSite: async () => '',
    ...overrides,
  };
}

it('scans on entering Settings and on Rescan without dropping absent paired profiles', async () => {
  const profiles: Profile[] = [
    { id: 'one', browser: 'firefox', label: 'Work profile', online: false, ackRevision: 2, origins: [] },
    { id: 'two', browser: 'firefox', label: 'Home profile', online: false, ackRevision: null, origins: [] },
  ];
  let available = true;
  const browserBridge = bridge({
    state: async () => ({ revision: 2, hideShorts: true, accessibility: { holdSeconds: 15, twoStepConfirmation: false }, sites: [], pending: [], profiles, open: null }),
    scan: async () => ({ supported: true, targets: available ? [
      { id: 'native', browser: 'firefox', source: 'native', label: 'Firefox ESR', capability: 'missingArtifact' },
      { id: 'flatpak', browser: 'firefox', source: 'flatpak', label: 'User Flatpak', capability: 'unverifiedChannel' },
    ] : [] }),
  });
  render(App, { browserBridge });
  await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  const family = await screen.findByRole('group', { name: 'Firefox' });
  expect(within(family).getByText('Firefox ESR')).toBeTruthy();
  expect(within(family).getByText('User Flatpak')).toBeTruthy();
  expect(within(family).queryByRole('button', { name: /^Install/ })).toBeNull();
  expect(within(family).getAllByText('Disconnected')).toHaveLength(2);
  available = false;
  await fireEvent.click(screen.getByRole('button', { name: 'Rescan' }));
  await screen.findByText(/No supported browsers detected/);
  expect(within(family).getByText('Work profile')).toBeTruthy();
  expect(within(family).getByText('Home profile')).toBeTruthy();
  expect(within(family).queryByText('Firefox ESR')).toBeNull();
});

it('passes only the chosen install ID and does not use install success as a connection', async () => {
  const scan: BrowserScan = { supported: true, targets: [
    { id: 'first', browser: 'chrome', source: 'native', label: 'Stable', capability: 'store' },
    { id: 'second', browser: 'chrome', source: 'native', label: 'Other installation', capability: 'store' },
  ] };
  const launched: string[] = [];
  render(App, { browserBridge: bridge({ scan: async () => scan, install: async (id) => {
    launched.push(id);
    return 'storeOpened';
  } }) });
  await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  await fireEvent.click(await screen.findByRole('button', { name: 'Install extension in Chrome, Other installation' }));
  expect(await screen.findByText(/Approve installation in Chrome/)).toBeTruthy();
  expect(launched).toEqual(['second']);
  expect(screen.queryByText('Connected')).toBeNull();
});

it('explains managed scope before install and allows a cancelled authorization to be retried', async () => {
  const browserBridge = bridge({
    scan: async () => ({ supported: true, targets: [{ id: 'zen', browser: 'zen', source: 'bundle', label: 'macOS app', capability: 'managed' }] }),
    install: async () => 'cancelled',
  });
  render(App, { browserBridge });
  await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  const family = await screen.findByRole('group', { name: 'Zen' });
  expect(within(family).getByText(/all profiles/)).toBeTruthy();
  expect(within(family).getByText(/Remove extension/)).toBeTruthy();
  await fireEvent.click(within(family).getByRole('button', { name: /Install extension in Zen/ }));
  expect(await within(family).findByText(/Authorization cancelled/)).toBeTruthy();
  expect(within(family).getByRole('button', { name: /Retry in Zen/ })).toBeTruthy();
});
