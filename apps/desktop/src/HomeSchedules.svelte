<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { onMount, tick } from 'svelte';
  import { dateLabel, localDate, moveMonth, occurrenceLabel } from './calendar';
  import CalendarPanel from './CalendarPanel.svelte';
  import { graceMessage } from './grace';
  import ScheduleDialog from './ScheduleDialog.svelte';
  import type { Schedule, ScheduleEntry, ScheduleOccurrence } from './schedules';

  let { calendar = false }: { calendar?: boolean } = $props();
  let selected = $state(localDate(new Date()));
  let month = $state(localDate(new Date()).slice(0, 7));
  let occurrences = $state<ScheduleOccurrence[]>([]);
  let available = $state<boolean>();
  let entries = $state<ScheduleEntry[]>([]);
  let active = $state<Schedule>();
  let error = $state('');
  let removing = $state<string>();
  let add = $state<HTMLButtonElement>();
  let opener: HTMLButtonElement | undefined;
  let request = 0;

  async function refresh() {
    const current = ++request;
    try {
      const [result, dates] = await Promise.all([
        invoke<ScheduleEntry[]>('list_schedules'),
        calendar ? invoke<ScheduleOccurrence[]>('schedule_occurrences', {
          start: new Date(`${month}-01T00:00:00`).getTime() / 1000,
          end: new Date(`${moveMonth(month, 1)}-01T00:00:00`).getTime() / 1000,
        }) : [],
      ]);
      if (current === request) {
        entries = result;
        occurrences = dates;
        error = '';
      }
    } catch {
      if (current === request) error = 'Could not load schedules.';
    }
  }

  onMount(() => {
    let current = true;
    let stop: (() => void) | undefined;
    void invoke<boolean>('scheduling_available').then(value => {
      if (!current) return;
      available = value;
      if (value) void refresh();
    }, () => { if (current) error = 'Could not check scheduling availability.'; });
    void listen('schedules-changed', () => { void refresh(); }).then(unlisten => {
      if (current) stop = unlisten;
      else unlisten();
    }, () => {});
    const refreshOnRestore = () => {
      if (available && document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', refreshOnRestore);
    window.addEventListener('focus', refreshOnRestore);
    const timer = setInterval(() => { if (available) void refresh(); }, 30_000);
    return () => {
      current = false;
      ++request;
      stop?.();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshOnRestore);
      window.removeEventListener('focus', refreshOnRestore);
    };
  });

  function create(day: string | undefined, source: HTMLButtonElement) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5, 0, 0);
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    opener = source;
    active = { id: crypto.randomUUID(), date: day ?? localDate(now), time, zone: Intl.DateTimeFormat().resolvedOptions().timeZone, weekdays: null };
  }

  function edit(schedule: Schedule, source: HTMLButtonElement) {
    opener = source;
    active = { ...schedule, editing: true };
  }

  function navigate(next: string) {
    month = next;
    selected = `${next}-01`;
    occurrences = [];
    void refresh();
  }

  async function close() {
    active = undefined;
    await tick();
    (opener?.isConnected ? opener : add)?.focus();
  }

  async function remove(id: string) {
    if (removing) return;
    removing = id;
    error = '';
    try {
      await invoke('delete_schedule', { id });
      await refresh();
      add?.focus();
    } catch {
      error = 'Could not remove this schedule. Try again.';
    } finally {
      removing = undefined;
    }
  }
</script>

<section class:calendar aria-labelledby="schedules-heading">
  <header>
    <h2 id="schedules-heading" tabindex="-1">{calendar ? 'Calendar' : 'Schedules'}</h2>
    {#if available && !calendar}<button type="button" bind:this={add} onclick={(event) => create(undefined, event.currentTarget)}>New schedule</button>{/if}
  </header>
  {#if available && calendar}
    <CalendarPanel {month} bind:selected {entries} {occurrences} {navigate} {edit} {create} />
  {:else if available}
    <p>Keep focus. running or minimized to start scheduled sessions.</p>
    {#if entries.length === 0 && !error}<p>No scheduled starts yet.</p>{/if}
    <ul>
      {#each entries as { schedule, nextAt, outcome } (schedule.id)}
        {@const label = nextAt === null ? `${dateLabel(schedule.date, { dateStyle: 'medium' })} · ${schedule.time} · ${schedule.zone}` : occurrenceLabel(nextAt, schedule.zone)}
        <li>
          <div>
            <strong>{label}</strong>
            {#if schedule.weekdays !== null}<small>Repeats weekly</small>{/if}
            {#if outcome && outcome !== 'started'}
              <p role="status">{outcome === 'notApproved' ? 'Use Start in Grace once and choose Allow in Grace, then schedule another start.' : graceMessage[outcome]}</p>
            {:else if nextAt === null}<p>This start was missed. Edit the schedule to choose a future time.</p>{/if}
          </div>
          <div class="actions">
            <button type="button" aria-label={`Edit ${label}`} onclick={(event) => edit(schedule, event.currentTarget)}>Edit</button>
            <button type="button" aria-label={`Remove ${label}`} disabled={removing === schedule.id} onclick={() => remove(schedule.id)}>Remove</button>
          </div>
        </li>
      {/each}
    </ul>
  {:else if available === false}
    <p>Grace scheduling is available only on macOS.</p>
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
</section>

{#if active}<ScheduleDialog initial={active} {close} saved={() => { void refresh(); }} />{/if}

<style>
  section { position: relative; margin-inline: 16px; border-top: 1px solid var(--edge); padding: 14px 9px; }
  section.calendar { margin-inline: 0; padding: 10px 0; }
  header, li, .actions { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; justify-content: space-between; }
  h2 { font-size: 19px; margin: 0; }
  p { margin: 4px 0 0; }
  small { display: block; }
  ul { list-style: none; padding: 0; margin: 12px 0 0; }
  li { border-top: 1px solid var(--edge); padding-block: 8px; }
  button { border: 1px solid var(--ink); border-radius: var(--radius-control); background: var(--surface); color: var(--ink); font: inherit; padding: 3px 9px; }
  header button { border-color: var(--accent); color: var(--accent); }
  button:not(:disabled):hover, button:not(:disabled):active { background: var(--ink); color: var(--surface); }
</style>
