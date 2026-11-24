import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import CalendarPanel from './CalendarPanel.svelte';
import { dateLabel } from './calendar';

it('renders only valid dates when changing from a 31-day month to February', async () => {
  const props = { month: '2028-01', selected: '2028-01-31', entries: [], navigate: vi.fn(), openDay: vi.fn() };
  const { rerender } = render(CalendarPanel, props);
  expect(screen.getByRole('button', { name: dateLabel('2028-01-31', { dateStyle: 'long' }) })).toBeTruthy();
  await rerender({ ...props, month: '2028-02', selected: '2028-02-29' });
  expect(screen.queryByRole('button', { name: dateLabel('2028-01-31', { dateStyle: 'long' }) })).toBeNull();
  const leapDay = screen.getByRole('button', { name: dateLabel('2028-02-29', { dateStyle: 'long' }), pressed: true });
  await fireEvent.click(leapDay);
  expect(props.openDay).toHaveBeenCalledWith('2028-02-29', leapDay);
});
