<script lang="ts">
  import { calendarDays, dateLabel, moveMonth, occurrenceLabel } from './calendar';
  import type { Schedule, ScheduleEntry, ScheduleOccurrence } from './schedules';
  import { localDate } from './calendar';

  let { month, selected = $bindable(), entries, occurrences, navigate, edit, create }: {
    month: string; selected: string; entries: ScheduleEntry[]; occurrences: ScheduleOccurrence[];
    navigate: (month: string) => void;
    edit: (schedule: Schedule, opener: HTMLButtonElement) => void;
    create: (day: string, opener: HTMLButtonElement) => void;
  } = $props();
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let dayChosen = $state(false);
  let days = $derived.by(() => {
    const grid = calendarDays(month, 0);
    let end = grid.length;
    while (end && grid[end - 1] === null) end--;
    return grid.slice(0, Math.ceil(end / 7) * 7);
  });
  let next = $derived(entries.find(entry => entry.nextAt !== null));
  let agenda = $derived(occurrences.filter(entry => localDate(new Date(entry.at * 1000)) === selected));
</script>

<div class="month-tools">
  <button type="button" aria-label="Previous month" onclick={() => navigate(moveMonth(month, -1))}>‹</button>
  <strong>{dateLabel(`${month}-01`, { month: 'long', year: 'numeric' })}</strong>
  <button type="button" aria-label="Next month" onclick={() => navigate(moveMonth(month, 1))}>›</button>
</div>
<div class="month" aria-label="Month days">
  {#each weekdays as weekday}<span>{weekday}</span>{/each}
  {#each days as day}
    {#if day}
      <button type="button" aria-label={dateLabel(day, { dateStyle: 'long' })} aria-pressed={day === selected}
        onclick={() => { selected = day; dayChosen = true; }}>{Number(day.slice(-2))}</button>
    {:else}<span aria-hidden="true"></span>{/if}
  {/each}
</div>
<p>{next?.nextAt != null ? `Next start: ${occurrenceLabel(next.nextAt, next.schedule.zone)}` : 'No upcoming scheduled start.'}</p>
{#if dayChosen}
  <h3>{dateLabel(selected, { dateStyle: 'long' })}</h3>
  {#if !agenda.length}
    <p>No scheduled starts on this day.</p>
  {:else}
    <ul>
      {#each agenda as { schedule, at } (`${schedule.id}:${at}`)}
        {@const label = occurrenceLabel(at, schedule.zone)}
        <li>{label} <button type="button" aria-label={`Edit ${label}`} onclick={(event) => edit(schedule, event.currentTarget)}>Edit</button></li>
      {/each}
    </ul>
  {/if}
{/if}
<button type="button" onclick={(event) => create(selected, event.currentTarget)}>New schedule</button>

<style>
  .month-tools { display: flex; justify-content: space-between; align-items: center; gap: 4px; }
  .month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); text-align: center; margin-block: 8px; gap: 2px; }
  .month span { font-size: 12px; }
  button { border: 1px solid var(--edge); background: var(--surface); color: var(--ink); font: inherit; min-height: 26px; padding: 0 3px; }
  .month button:not(:hover, [aria-pressed='true']) { border-color: transparent; background: transparent; }
  button:is(:hover, [aria-pressed='true']) { background: var(--ink); color: var(--surface); }
  h3, p { margin: 8px 0; }
  ul { padding-inline-start: 16px; }
</style>
