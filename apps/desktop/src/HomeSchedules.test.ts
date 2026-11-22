/// <reference lib="es2024.promise" />

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import HomeSchedules from './HomeSchedules.svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));

beforeEach(() => {
  // JSDOM has no native dialog lifecycle or Escape default action.
  vi.stubGlobal('crypto', { randomUUID: () => 'ffcdaf8e-9025-4e0b-a01a-a98e3c1a8375' });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    } },
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  vi.unstubAllGlobals();
  vi.mocked(listen).mockReset();
});

async function openSchedule(save = Promise.resolve()) {
  vi.mocked(invoke).mockImplementation(async (command) => {
    switch (command) {
      case 'scheduling_available': return true;
      case 'list_schedules': return [];
      case 'preview_schedule': return 2_000_000_000;
      case 'save_schedule': return save;
      default: throw new Error(command);
    }
  });
  render(HomeSchedules);
  const opener = await screen.findByRole('button', { name: 'New schedule' });
  await fireEvent.click(opener);
  const dialog = screen.getByRole('dialog');
  const day = within(dialog).getByRole('button', { pressed: true });
  day.focus();
  return { opener, dialog, day };
}

it('discards the draft and restores opener focus when Escape comes from a calendar date', async () => {
  const { opener, dialog, day } = await openSchedule();
  await fireEvent.keyDown(day, { key: 'ArrowRight' });
  expect(document.activeElement).not.toBe(day);
  expect(dialog.contains(document.activeElement)).toBe(true);
  await fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(opener);
});

it('keeps the calendar open on Escape while a save is pending', async () => {
  const { promise, resolve } = Promise.withResolvers<void>();
  const { opener, dialog, day } = await openSchedule(promise);
  const submit = within(dialog).getByRole('button', { name: 'Schedule' });
  await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
  await fireEvent.click(submit);
  expect(within(dialog).getByRole('button', { name: 'Saving…' })).toBeTruthy();
  expect(await fireEvent.keyDown(day, { key: 'Escape' })).toBe(false);
  expect(screen.getByRole('dialog')).toBe(dialog);
  resolve();
  await waitFor(() => expect(document.activeElement).toBe(opener));
});

it('refreshes completed schedules on becoming visible and stops listening after leaving Home', async () => {
  let completed = false;
  const unlisten = vi.fn();
  vi.mocked(listen).mockResolvedValueOnce(unlisten);
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === 'scheduling_available') return true;
    if (command !== 'list_schedules') throw new Error(command);
    return completed ? [] : [{
      schedule: { id: 'ffcdaf8e-9025-4e0b-a01a-a98e3c1a8375', date: '2033-05-18', time: '03:33', zone: 'UTC', weekdays: null },
      nextAt: 2_000_000_000, outcome: null,
    }];
  });
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  try {
    const { unmount } = render(HomeSchedules);
    const upcoming = await screen.findByRole('button', { name: /^Edit / });
    completed = true;
    await fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByRole('button', { name: /^Edit / })).toBe(upcoming);
    visibility.mockReturnValue('visible');
    await fireEvent(document, new Event('visibilitychange'));
    expect(await screen.findByText('No scheduled starts yet.')).toBeTruthy();
    unmount();
    expect(unlisten).toHaveBeenCalledOnce();
    vi.mocked(invoke).mockClear();
    await fireEvent(document, new Event('visibilitychange'));
    expect(invoke).not.toHaveBeenCalled();
  } finally {
    visibility.mockRestore();
  }
});

it('unsubscribes even if native registration finishes after leaving Home', async () => {
  const { promise, resolve } = Promise.withResolvers<() => void>();
  vi.mocked(listen).mockReturnValueOnce(promise);
  vi.mocked(invoke).mockResolvedValue(false);
  const { unmount } = render(HomeSchedules);
  await screen.findByText('Grace scheduling is available only on macOS.');
  unmount();
  const unlisten = vi.fn();
  resolve(unlisten);
  await waitFor(() => expect(unlisten).toHaveBeenCalledOnce());
});
