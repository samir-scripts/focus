import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App.svelte';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.dataset.theme = 'system';
  delete document.documentElement.dataset.paletteLight;
  delete document.documentElement.dataset.paletteDark;
});

describe('desktop shell', () => {
  it('provides named icon controls and marks the current page', async () => {
    render(App);
    const navigation = within(screen.getByRole('navigation', { name: 'Main' }));
    for (const name of ['Sites', 'Statistics', 'Settings']) {
      const button = navigation.getByRole('button', { name });
      expect(button.textContent?.trim()).toBe('');
      expect(button.querySelector('svg')).toBeTruthy();
    }
    expect(navigation.getByRole('button', { name: 'Sites' }).getAttribute('aria-current')).toBe('page');
    const settings = navigation.getByRole('button', { name: 'Settings' });
    await fireEvent.click(settings);
    expect(settings.getAttribute('aria-current')).toBe('page');
    expect(navigation.getByRole('button', { name: 'Sites' }).getAttribute('aria-current')).toBeNull();
  });

  it('moves between branded site rows and shows the selected hostname', async () => {
    render(App);
    const library = within(screen.getByRole('region', { name: 'Site Library' }));
    const rows = library.getAllByRole('button');
    const names = ['YouTube', 'Reddit', 'Instagram', 'X / Twitter', 'Facebook', 'TikTok', 'LinkedIn', 'WhatsApp Web', 'Google Search'];
    expect(rows).toEqual(names.map((name) => library.getByRole('button', { name })));
    await fireEvent.click(library.getByRole('button', { name: 'WhatsApp Web' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'WhatsApp Web' })).toBeTruthy();
    expect(screen.getByText('web.whatsapp.com')).toBeTruthy();
    expect(library.getByRole('button', { name: 'WhatsApp Web' }).getAttribute('aria-pressed')).toBe('true');
    expect(library.getByRole('button', { name: 'YouTube' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('reports disconnected and empty states without presenting active filtering or tracking controls', async () => {
    render(App);
    expect(screen.getByText('No browsers connected')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));
    expect(await screen.findByRole('heading', { name: 'No time recorded' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Browsers' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Sites' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'YouTube' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Browser settings' }));
    const settings = await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(document.activeElement).toBe(settings);
  });

  it('starts at system appearance, retains a choice across remount and can return to system', async () => {
    const shell = render(App);
    expect(document.documentElement.dataset.theme).toBe('system');
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    shell.unmount();
    render(App);
    expect(document.documentElement.dataset.theme).toBe('dark');
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'System' }));
    expect(document.documentElement.dataset.theme).toBe('system');
  });

  it('edits the inactive palette independently and restores both choices', async () => {
    window.localStorage.setItem('focus.appearance', 'dark');
    const shell = render(App);
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
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
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
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
    expect(screen.getByRole('button', { name: /^Light palette/ }).textContent).toContain('Sage');
    expect(screen.getByRole('button', { name: /^Dark palette/ }).textContent).toContain('Plum');
  });

  it('removes both impressions when disabled and keeps them off on restart', async () => {
    const shell = render(App);
    const open = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
    const impression = () => screen.getByRole('main').querySelector('[data-print]');

    expect(impression()?.getAttribute('aria-hidden')).toBe('true');
    await open('Statistics');
    expect(impression()).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'No time recorded' })).toBeTruthy();
    await open('Settings');
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
    expect(pause().checked).toBe(false);
    await fireEvent.click(pause());
    expect(print().checked).toBe(true);
    await fireEvent.click(print());
    expect(pause().checked).toBe(true);
    shell.unmount();

    const restored = render(App);
    await open('Settings');
    expect(pause().checked).toBe(true);
    expect(print().checked).toBe(false);
    await fireEvent.click(pause());
    restored.unmount();

    render(App);
    await open('Settings');
    expect(pause().checked).toBe(false);
    expect(print().checked).toBe(false);
  });
});
