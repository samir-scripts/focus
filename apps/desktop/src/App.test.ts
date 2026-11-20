import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App.svelte';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.dataset.theme = 'system';
});

describe('desktop shell', () => {
  it('moves between branded site rows and shows the selected hostname', async () => {
    render(App);
    const library = within(screen.getByRole('region', { name: 'Site library' }));
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
});
