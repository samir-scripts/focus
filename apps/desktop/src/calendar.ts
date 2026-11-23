function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function weekdayBit(date: string): number {
  return 1 << ((utcDate(date).getUTCDay() + 6) % 7);
}

export function moveDate(date: string, days: number): string {
  const value = utcDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return isoDate(value);
}

export function moveMonth(month: string, months: number): string {
  const value = utcDate(`${month}-01`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return isoDate(value).slice(0, 7);
}

export function calendarDays(month: string, firstWeekday: 0 | 1 = 1): (string | null)[] {
  const first = `${month}-01`;
  const offset = (utcDate(first).getUTCDay() + 7 - firstWeekday) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = moveDate(first, index - offset);
    return date.startsWith(month) ? date : null;
  });
}

export function dateLabel(date: string, options: Intl.DateTimeFormatOptions): string {
  return utcDate(date).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
}

export function occurrenceLabel(timestamp: number, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(timestamp * 1000);
}
