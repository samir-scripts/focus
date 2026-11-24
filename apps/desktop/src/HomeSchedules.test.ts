/// <reference lib="es2024.promise" />

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import HomeSchedules from './HomeSchedules.svelte';
import { dateLabel, localDate, moveMonth } from './calendar';

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

it('opens a local agenda without Grace and restores the originating day on return', async () => {
  const day = localDate(new Date());
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'scheduling_available') return false;
    if (command === 'planner_day' && args && 'date' in args && args.date === day) {
      return [{ id: 'log-1', kind: 'log', title: 'Reviewed notes', notes: null, date: day, time: '10:00:00', end: null, zone: 'UTC', lead: null }];
    }
    throw new Error(command);
  });
  render(HomeSchedules, { calendar: true });
  const name = dateLabel(day, { dateStyle: 'long' });
  const opener = screen.getByRole('button', { name });
  await fireEvent.click(opener);
  expect(await screen.findByRole('heading', { name: 'Day log' })).toBeTruthy();
  expect(await screen.findByText('Reviewed notes')).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Back to Calendar' }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name })));
});

it('returns focus to the selected day after changing months in the agenda', async () => {
  const today = localDate(new Date());
  const day = `${today.slice(0, 7)}-15`;
  const nextDay = `${moveMonth(today.slice(0, 7), 1)}-01`;
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === 'scheduling_available') return false;
    if (command === 'planner_day') return [];
    throw new Error(command);
  });
  render(HomeSchedules, { calendar: true });
  await fireEvent.click(screen.getByRole('button', {name: dateLabel(day, {dateStyle: 'long'})}));
  await fireEvent.click(screen.getByRole('button', {name: 'Next month'}));
  await fireEvent.click(screen.getByRole('button', {name: 'Back to Calendar'}));
  await waitFor(() => {
    expect(document.activeElement).toBe(screen.getByRole('button', {name: dateLabel(nextDay, {dateStyle: 'long'})}));
  });
});

it('applies an off-label minute to the entry draft and restores the clock opener', async () => {
  const day = localDate(new Date());
  let saved: unknown;
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    switch (command) {
      case 'scheduling_available': return false;
      case 'planner_day': return saved ? [saved] : [];
      case 'planner_validate': return { time_offset: null, end_offset: null };
      case 'planner_save': saved = args && 'entry' in args ? args.entry : null; return;
      default: throw new Error(command);
    }
  });
  render(HomeSchedules, { calendar: true });
  await fireEvent.click(screen.getByRole('button', { name: dateLabel(day, { dateStyle: 'long' }) }));
  await fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  const editor = screen.getByRole('dialog', { name: 'Add entry' });
  await fireEvent.click(within(editor).getByRole('button', { name: 'Log' }));
  await fireEvent.input(within(editor).getByLabelText('Title'), { target: { value: 'Reviewed notes' } });
  const opener = within(editor).getByRole('button', { name: /^Time/ });
  await fireEvent.click(opener);
  const clock = screen.getByRole('dialog', { name: 'Set time' });
  await fireEvent.click(within(clock).getByRole('button', { name: '3 hours' }));
  const dial = within(clock).getByRole('group', { name: 'Select minute' }).querySelector('svg')!;
  vi.spyOn(dial, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 200));
  const angle = 23 * Math.PI / 30;
  const pointer = new MouseEvent('pointerup', {
    bubbles: true, clientX: 100 + 78 * Math.sin(angle), clientY: 100 - 78 * Math.cos(angle),
  });
  Object.defineProperty(pointer, 'isPrimary', {value: true});
  await fireEvent(dial, pointer);
  await fireEvent.click(within(clock).getByRole('button', { name: 'PM' }));
  await fireEvent.click(within(clock).getByRole('button', { name: 'Set time' }));
  await waitFor(() => expect(document.activeElement).toBe(opener));
  await fireEvent.click(within(editor).getByRole('button', { name: 'Save log' }));
  expect(await screen.findByText('Reviewed notes')).toBeTruthy();
  expect(saved).toMatchObject({ date: day, kind: 'log', time: '15:23:00', end: null });
});
