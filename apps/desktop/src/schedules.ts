import type { GraceOutcome } from './grace';

export interface Schedule {
  id: string;
  date: string;
  time: string;
  zone: string;
  weekdays: number | null;
  editing?: boolean;
}

export interface ScheduleEntry {
  schedule: Schedule;
  nextAt: number | null;
  outcome: GraceOutcome | null;
}

export interface ScheduleOccurrence {
  schedule: Schedule;
  at: number;
}
