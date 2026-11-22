import { expect, it } from 'vitest';
import { calendarDays, moveDate, weekdayBit } from './calendar';

it('lays out a Sunday month start after six empty Monday-first cells', () => {
  const cells = calendarDays('2026-11');
  expect(cells.slice(0, 8)).toEqual([null, null, null, null, null, null, '2026-11-01', '2026-11-02']);
  expect(cells.at(-1)).toBeNull();
});

it('moves keyboard selection across a leap day and the year boundary', () => {
  expect(moveDate('2028-02-28', 1)).toBe('2028-02-29');
  expect(moveDate('2026-12-31', 1)).toBe('2027-01-01');
  expect(weekdayBit('2027-01-01')).toBe(16);
});
