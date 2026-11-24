export type PlannerKind = 'plan' | 'reminder' | 'log';
export type PlannerEntry = {
  id: string; kind: PlannerKind; title: string; notes: string | null;
  date: string; time: string; end: string | null; zone: string; lead: number | null;
};

export const kindLabel = { plan: 'Plan', reminder: 'Reminder', log: 'Log' } as const;
export const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const timeFormat = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
export function plannerTime(time: string) {
  return timeFormat.format(new Date(`2000-01-01T${time.slice(0, 5)}:00Z`));
}

export const reminderLeads = [[0, 'At start'], [5, '5 minutes before'], [15, '15 minutes before'], [60, '1 hour before']] as const;
export const alertText = {
  scheduled: 'Alert scheduled',
  denied: 'Alerts are off. Allow focus. in System Settings → Notifications, then save again.',
  failed: 'Alert not scheduled. Edit the reminder and save again.',
  elapsed: 'Alert time has passed.',
  unavailable: 'Local alerts are unavailable in this app.',
} as const;
export type AlertStatus = keyof typeof alertText;
