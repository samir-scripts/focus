import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import CalendarPanel from './CalendarPanel.svelte';
import { dateLabel } from './calendar';

it('selects an occurrence outside the next start and opens its schedule', async () => {
  const schedule = { id: 'a', date: '2026-11-03', time: '10:00', zone: 'UTC', weekdays: 2 };
  const edit = vi.fn();
  render(CalendarPanel, {
    month: '2026-11', selected: '2026-11-03',
    entries: [{ schedule, nextAt: 1794324000, outcome: null }],
    occurrences: [{ schedule, at: new Date(2026, 10, 10, 10).getTime() / 1000 }],
    navigate: vi.fn(), edit, create: vi.fn(),
  });
  await fireEvent.click(screen.getByRole('button', { name: dateLabel('2026-11-10', { dateStyle: 'long' }) }));
  await fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
  expect(edit).toHaveBeenCalledWith(schedule, expect.any(HTMLButtonElement));
});
