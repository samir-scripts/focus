/// <reference lib="es2024.promise" />

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { Accessibility, EntryPolicy } from '../../extension/src/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.svelte';
import { mountTypewriter } from './typewriter/viewer';

vi.mock('./typewriter/viewer', () => ({ mountTypewriter: vi.fn() }));

const mountViewer = vi.mocked(mountTypewriter);
const artName = 'Blue typewriter floating over a pink disc';
const canvasName = 'Cobalt typewriter';

function prepareViewer() {
  const viewer = { destroy: vi.fn(), reset: vi.fn(), setPaused: vi.fn() };
  mountViewer.mockReturnValueOnce(viewer);
  return viewer;
}

afterEach(() => {
  cleanup();
  history.replaceState(null, '', location.pathname);
  window.localStorage.clear();
  mountViewer.mockReset();
  document.documentElement.dataset.theme = 'system';
  delete document.documentElement.dataset.paletteLight;
  delete document.documentElement.dataset.paletteDark;
});

describe('desktop shell', () => {
  it('owns a fresh viewer on every Home visit, and none when illustrations are disabled', async () => {
    const first = prepareViewer();
    render(App);
    const open = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
    expect(screen.getByRole('img', { name: artName })).toBeTruthy();
    await waitFor(() => expect(mountViewer).toHaveBeenCalledTimes(1));
    const [oldCanvas, oldOptions] = mountViewer.mock.calls[0];
    await open('Sites');
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(oldCanvas.isConnected).toBe(false);

    const second = prepareViewer();
    await open('Home');
    await waitFor(() => expect(mountViewer).toHaveBeenCalledTimes(2));
    const [canvas, options] = mountViewer.mock.calls[1];
    expect(canvas).not.toBe(oldCanvas);
    oldOptions.onMode('live');
    expect(screen.queryByRole('application', { name: canvasName })).toBeNull();
    options.onMode('live');
    expect(await screen.findByRole('application', { name: canvasName })).toBe(canvas);
    expect(canvas.tabIndex).toBe(0);
    expect(document.getElementById(canvas.getAttribute('aria-describedby') ?? '')?.textContent).toMatch(/Esc resets/);
    expect(screen.queryByRole('img', { name: artName })).toBeNull();

    await open('Settings');
    await fireEvent.click(screen.getByRole('link', { name: 'Appearance' }));
    expect(second.destroy).toHaveBeenCalledOnce();
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Print illustrations' }));
    await open('Home');
    expect(screen.queryByRole('img', { name: artName })).toBeNull();
    expect(screen.queryByRole('application', { name: canvasName })).toBeNull();
    expect(mountViewer).toHaveBeenCalledTimes(2);
  });

  it('retains saved toner pause and launches Grace during loading and after renderer failure', async () => {
    window.localStorage.setItem('focus.tonerPaused', 'true');
    prepareViewer();
    const startGrace = vi.fn(async () => 'unconfirmed' as const);
    render(App, { startGrace });
    const start = screen.getByRole('button', { name: 'Start in Grace' });
    expect(screen.getByRole('img', { name: artName })).toBeTruthy();
    expect(screen.queryByRole('application', { name: canvasName })).toBeNull();
    await fireEvent.click(start);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/could not confirm/i));
    await waitFor(() => expect(mountViewer).toHaveBeenCalledOnce());
    const [canvas, options] = mountViewer.mock.calls[0];
    expect(options.paused).toBe(true);
    options.onMode('static');
    await waitFor(() => expect(canvas.hidden).toBe(true));
    expect(screen.getByRole('img', { name: artName })).toBeTruthy();
    await fireEvent.click(start);
    expect(startGrace).toHaveBeenCalledTimes(2);
  });

  it('opens Home and keeps Sites labeled alongside the named icon controls', async () => {
    render(App);
    const navigation = within(screen.getByRole('navigation', { name: 'Main' }));
    const home = navigation.getByRole('button', { name: 'Home' });
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { name: 'Start a session' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New schedule' })).toBeNull();
    const sites = navigation.getByRole('button', { name: 'Sites' });
    expect(sites.textContent?.trim()).toBe('Sites');
    for (const name of ['Statistics', 'Settings']) {
      const button = navigation.getByRole('button', { name });
      expect(button.textContent?.trim()).toBe('');
      expect(button.querySelector('svg')).toBeTruthy();
    }
    await fireEvent.click(sites);
    expect(sites.getAttribute('aria-current')).toBe('page');
    expect(home.getAttribute('aria-current')).toBeNull();
    await fireEvent.click(home, { detail: 0 });
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Start a session' }));
  });

  it('does not dispatch a second Grace start while waiting or claim success without acceptance', async () => {
    const { promise, resolve } = Promise.withResolvers<'unconfirmed'>();
    let calls = 0;
    render(App, { startGrace: () => {
      calls++;
      return promise;
    } });
    const start = screen.getByRole('button', { name: 'Start in Grace' });
    await fireEvent.click(start);
    await fireEvent.click(start);
    expect(calls).toBe(1);
    expect(screen.getByRole('status').textContent).not.toMatch(/session started/i);
    resolve('unconfirmed');
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/could not confirm.*check Grace/i));
  });

  it('moves between branded site rows and shows the selected hostname', async () => {
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: 'Sites' }));
    const library = within(screen.getByRole('region', { name: 'Site Library' }));
    const rows = library.getAllByRole('button');
    const names = ['YouTube', 'Reddit', 'Instagram', 'X / Twitter', 'Facebook', 'TikTok', 'LinkedIn', 'WhatsApp Web', 'Google Search'];
    expect(rows).toEqual(names.map((name) => library.getByRole('button', { name })));
    await fireEvent.click(library.getByRole('button', { name: 'WhatsApp Web' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'WhatsApp Web' })).toBeTruthy();
    expect(within(screen.getByRole('main')).getByText('web.whatsapp.com')).toBeTruthy();
    expect(library.getByRole('button', { name: 'WhatsApp Web' }).getAttribute('aria-pressed')).toBe('true');
    expect(library.getByRole('button', { name: 'YouTube' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('can save Hide Shorts before any browser is connected', async () => {
    let enabled = false;
    let revision = 0;
    render(App, { browserBridge: {
      state: async () => ({ revision, hideShorts: enabled, accessibility: { holdSeconds: 15, twoStepConfirmation: false }, sites: [], pending: [], profiles: [], open: null }),
      scan: async () => ({ supported: true, targets: [] }),
      install: async () => 'cancelled',
      removeInstallation: async () => 'cancelled',
      setHideShorts: async (expected: number, next: boolean) => {
        expect(expected).toBe(revision);
        enabled = next;
        revision += 1;
      },
      setEntry: async () => {}, setGrayscale: async () => {}, setAccessibility: async () => {}, designateSite: async () => '',
      decidePair: async () => {},
      revoke: async () => {},
    } });
    await fireEvent.click(screen.getByRole('button', { name: 'Sites' }));
    const rule = await screen.findByRole<HTMLInputElement>('checkbox', { name: /Hide Shorts/ });
    expect(rule.disabled).toBe(false);
    await fireEvent.click(rule);
    await screen.findByText('No browsers connected');
    expect(enabled).toBe(true);
    expect(rule.checked).toBe(true);
  });

  it('shows the missing schemes and aliases instead of claiming partial grants are applied', async () => {
    render(App, { browserBridge: {
      state: async () => ({
        revision: 7, hideShorts: true, accessibility: { holdSeconds: 15, twoStepConfirmation: false }, sites: [], pending: [], open: null,
        profiles: [{ id: 'sample', label: 'Test browser', browser: 'chrome', online: true, ackRevision: 7,
          origins: ['https://www.youtube.com/*', 'https://youtu.be/*', 'https://reddit.com/*'] }],
      }),
      scan: async () => ({ supported: true, targets: [] }),
      install: async () => 'cancelled',
      removeInstallation: async () => 'cancelled',
      setHideShorts: async () => {},
      setEntry: async () => {}, setGrayscale: async () => {}, setAccessibility: async () => {}, designateSite: async () => '',
      decidePair: async () => {},
      revoke: async () => {},
    } });
    await fireEvent.click(screen.getByRole('button', { name: 'Sites' }));
    expect(await screen.findByText(/Needs access/)).toBeTruthy();
    expect(screen.getByText(/Missing:.*http:\/\/www\.youtube\.com\/\*/)).toBeTruthy();
    expect(screen.getByText(/Missing:.*https:\/\/m\.youtube\.com\/\*/)).toBeTruthy();
    expect(screen.queryByText(/· Applied/)).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Reddit' }));
    expect(screen.getByText(/Needs access/)).toBeTruthy();
    expect(screen.getByText(/Missing:.*https:\/\/old\.reddit\.com\/\*/)).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /Hide Shorts/ })).toBeNull();
  });

  it('edits site entry before pairing and shows Pause controls only while paused', async () => {
    let entry: EntryPolicy = { mode: 'allow' };
    let revision = 0;
    render(App, { browserBridge: {
      state: async () => ({ revision, hideShorts: false, accessibility: { holdSeconds: 15, twoStepConfirmation: false }, pending: [], profiles: [], open: null, entryAvailable: true,
        sites: [{ id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
          grayscale: false, rules: { 'youtube.hide-shorts': false }, entry }] }),
      scan: async () => ({ supported: true, targets: [] }),
      install: async () => 'cancelled', removeInstallation: async () => 'cancelled',
      setHideShorts: async () => {}, setGrayscale: async () => {}, setAccessibility: async () => {}, designateSite: async () => '',
      setEntry: async (expected: number, id: string, next: EntryPolicy) => {
        expect([expected, id]).toEqual([revision, 'youtube']);
        entry = next;
        revision += 1;
      },
      decidePair: async () => {}, revoke: async () => {},
    } });
    await fireEvent.click(screen.getByRole('button', { name: 'Sites' }));
    await screen.findByRole('radio', { name: 'Allow' });
    expect(screen.queryByLabelText('Wait (seconds)')).toBeNull();
    await fireEvent.click(screen.getByRole('radio', { name: 'Pause' }));
    expect((await screen.findByLabelText<HTMLInputElement>('Wait (seconds)')).value).toBe('15');
    expect(entry).toEqual({ mode: 'pause', seconds: 15, finish: 'manual', frequency: 'visit' });
    await waitFor(() => expect((screen.getByRole('radio', { name: 'Block' }) as HTMLInputElement).disabled).toBe(false));
    await fireEvent.click(screen.getByRole('radio', { name: 'Block' }));
    await waitFor(() => expect(screen.queryByLabelText('Wait (seconds)')).toBeNull());
    expect(entry).toEqual({ mode: 'block' });
  });

  it('moves focus into Add site and returns it to the trigger on cancel', async () => {
    render(App, { browserBridge: {
      state: async () => ({ revision: 0, hideShorts: false, accessibility: { holdSeconds: 15, twoStepConfirmation: false },
        sites: [], pending: [], profiles: [], open: null }),
      scan: async () => ({ supported: true, targets: [] }),
      install: async () => 'cancelled', removeInstallation: async () => 'cancelled',
      setHideShorts: async () => {}, setGrayscale: async () => {}, setAccessibility: async () => {},
      setEntry: async () => {}, designateSite: async () => '', decidePair: async () => {}, revoke: async () => {},
    } });
    await fireEvent.click(screen.getByRole('button', { name: 'Sites' }));
    const library = within(screen.getByRole('region', { name: 'Site Library' }));
    await fireEvent.click(await library.findByRole('button', { name: 'Add site' }), { detail: 0 });
    expect(document.activeElement).toBe(library.getByRole('textbox', { name: 'Hostname or URL' }));
    await fireEvent.click(library.getByRole('button', { name: 'Cancel' }), { detail: 0 });
    expect(document.activeElement).toBe(library.getByRole('button', { name: 'Add site' }));
  });

  it('saves global accessibility settings with the revision displayed when editing began', async () => {
    let revision = 2;
    let accessibility = { holdSeconds: 15, twoStepConfirmation: false };
    const saved: unknown[] = [];
    render(App, { browserBridge: {
      state: async () => ({ revision, hideShorts: false, accessibility, sites: [], pending: [], profiles: [], open: null }),
      scan: async () => ({ supported: true, targets: [] }),
      install: async () => 'cancelled', removeInstallation: async () => 'cancelled',
      setHideShorts: async () => {}, setGrayscale: async () => {}, setEntry: async () => {}, designateSite: async () => '',
      setAccessibility: async (expected: number, next: Accessibility) => { saved.push([expected, next]); accessibility = next; revision++; },
      decidePair: async () => {}, revoke: async () => {},
    } });
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('link', { name: 'Accessibility' }));
    const duration = await screen.findByLabelText<HTMLInputElement>('Hold duration (seconds)');
    await waitFor(() => expect(duration.matches(':disabled')).toBe(false));
    expect(duration.value).toBe('15');
    await fireEvent.input(duration, { target: { value: '45' } });
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Use two-step confirmation instead of holding' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Save accessibility settings' }));
    await waitFor(() => expect(saved).toEqual([[2, { holdSeconds: 45, twoStepConfirmation: true }]]));
  });

  it('opens an isolated Settings category and returns keyboard focus to its row', async () => {
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const row = screen.getByRole('link', { name: 'Appearance' });
    expect(row.getAttribute('href')).toBe('#settings/appearance');
    await fireEvent.click(row);
    expect(window.location.hash).toBe('#settings/appearance');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeTruthy();
    expect(screen.queryByLabelText('Hold duration (seconds)')).toBeNull();
    await fireEvent.click(screen.getByRole('link', { name: 'Back to Settings' }));
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Appearance' }));
  });

  it('reports disconnected and empty states without presenting active filtering or tracking controls', async () => {
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: 'Sites' }));
    expect(screen.getByText('No browsers connected')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));
    expect(await screen.findByRole('heading', { name: 'No time recorded' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('link', { name: 'Browser setup' }));
    expect(await screen.findByRole('heading', { name: 'Browsers' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Sites' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'YouTube' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Browser settings' }));
    const settings = await screen.findByRole('heading', { level: 1, name: 'Browser setup' });
    expect(document.activeElement).toBe(settings);
  });

  it('starts at system appearance, retains a choice across remount and can return to system', async () => {
    const shell = render(App);
    expect(document.documentElement.dataset.theme).toBe('system');
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('link', { name: 'Appearance' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    shell.unmount();
    render(App);
    expect(document.documentElement.dataset.theme).toBe('dark');
    await fireEvent.click(screen.getByRole('radio', { name: 'System' }));
    expect(document.documentElement.dataset.theme).toBe('system');
  });

  it('edits the inactive palette independently and restores both choices', async () => {
    window.localStorage.setItem('focus.appearance', 'dark');
    const shell = render(App);
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('link', { name: 'Appearance' }));
    const picker = (mode: string) => screen.getByRole('button', { name: new RegExp(`^${mode} palette`) });
    expect(picker('Dark').textContent).toContain('Sage');
    await fireEvent.click(picker('Light'));
    await fireEvent.click(screen.getByRole('radio', { name: 'Cobalt' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(picker('Dark').textContent).toContain('Sage');
    await fireEvent.click(picker('Dark'));
    expect(picker('Light').getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(screen.getByRole('radio', { name: 'Plum' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Print illustrations' }));
    shell.unmount();
    render(App);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(picker('Light').textContent).toContain('Cobalt');
    expect(picker('Dark').textContent).toContain('Plum');
    expect((screen.getByRole('checkbox', { name: 'Print illustrations' }) as HTMLInputElement).checked).toBe(false);
  });

  it('discards an unknown palette without discarding the other preference', async () => {
    window.localStorage.setItem('focus.palette.light', 'unknown');
    window.localStorage.setItem('focus.palette.dark', 'plum');
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('link', { name: 'Appearance' }));
    expect(screen.getByRole('button', { name: /^Light palette/ }).textContent).toContain('Sage');
    expect(screen.getByRole('button', { name: /^Dark palette/ }).textContent).toContain('Plum');
  });

  it('removes both impressions when disabled and keeps them off on restart', async () => {
    const shell = render(App);
    const open = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
    const impression = () => screen.getByRole('main').querySelector('[data-print]');

    expect(impression()).not.toBeNull();
    await open('Sites');
    expect(impression()?.getAttribute('aria-hidden')).toBe('true');
    await open('Statistics');
    expect(impression()).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'No time recorded' })).toBeTruthy();
    await open('Settings');
    await fireEvent.click(screen.getByRole('link', { name: 'Appearance' }));
    expect(impression()).toBeNull();
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Print illustrations' }));
    await open('Statistics');
    expect(impression()).toBeNull();
    await open('Sites');
    expect(impression()).toBeNull();

    shell.unmount();
    render(App);
    expect(impression()).toBeNull();
    await open('Settings');
    await fireEvent.click(screen.getByRole('link', { name: 'Appearance' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Print illustrations' }));
    await open('Sites');
    expect(impression()).not.toBeNull();
  });

  it('keeps toner particles paused across restart independently of print illustrations', async () => {
    const open = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
    const pause = () => screen.getByRole<HTMLInputElement>('checkbox', { name: 'Pause toner particles' });
    const print = () => screen.getByRole<HTMLInputElement>('checkbox', { name: 'Print illustrations' });
    const shell = render(App);
    await open('Settings');
    await fireEvent.click(screen.getByRole('link', { name: 'Appearance' }));
    expect(pause().checked).toBe(false);
    await fireEvent.click(pause());
    expect(print().checked).toBe(true);
    await fireEvent.click(print());
    expect(pause().checked).toBe(true);
    shell.unmount();

    const restored = render(App);
    expect(pause().checked).toBe(true);
    expect(print().checked).toBe(false);
    await fireEvent.click(pause());
    restored.unmount();

    render(App);
    expect(pause().checked).toBe(false);
    expect(print().checked).toBe(false);
  });
});
