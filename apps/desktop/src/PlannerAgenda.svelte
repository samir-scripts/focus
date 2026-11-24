<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount, tick } from 'svelte';
  import { dateLabel, localDate, occurrenceLabel } from './calendar';
  import { alertText, deviceZone, kindLabel, plannerTime, type AlertStatus, type PlannerEntry } from './planner';
  import EntryEditor from './PlannerEntryEditor.svelte';
  import PlannerExport from './PlannerExport.svelte';
  import type { Schedule, ScheduleOccurrence } from './schedules';

  let { day, occurrences, edit, create, back }: {
    day: string; occurrences: ScheduleOccurrence[];
    edit: (schedule: Schedule, source: HTMLButtonElement) => void;
    create?: (day: string, source: HTMLButtonElement) => void;
    back: () => void;
  } = $props();
  let entries = $state<PlannerEntry[]>([]);
  let alertStatuses = $state<Record<string, AlertStatus>>({});
  let pending = $state(true);
  let error = $state(false);
  let draft = $state<PlannerEntry>();
  let exporting = $state(false);
  let exported = $state(false);
  let exportButton = $state<HTMLButtonElement>();
  let add: HTMLButtonElement;
  let heading: HTMLHeadingElement;
  let opener: HTMLButtonElement;
  let serial = 0;
  let statusSerial = 0;
  const timeKey = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  let agenda = $derived([
    ...entries.filter(entry => entry.kind !== 'log').map(entry => ({ id: entry.id, time: entry.time.slice(0, 5), entry })),
    ...occurrences.flatMap(grace => {
      const date = new Date(grace.at * 1000);
      return localDate(date) === day ? [{ id: `${grace.schedule.id}:${grace.at}`, time: timeKey(date), grace }] : [];
    }),
  ].sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id)));
  let logs = $derived(entries.filter(entry => entry.kind === 'log'));

  async function refresh() {
    const request = ++serial;
    pending = true;
    error = false;
    try {
      const saved = await invoke<PlannerEntry[]>('planner_day', { date: day });
      if (request === serial) entries = saved;
    } catch {
      if (request === serial) error = true;
    } finally {
      if (request === serial) void refreshAlerts();
      if (request === serial) pending = false;
    }
  }
  async function refreshAlerts() {
    const request = ++statusSerial;
    if (!entries.some(entry => entry.lead !== null)) { alertStatuses = {}; return; }
    try {
      const statuses = await invoke<Record<string, AlertStatus>>('planner_alert_statuses', { date: day });
      if (request === statusSerial) alertStatuses = statuses;
    } catch {
      if (request === statusSerial) alertStatuses = {};
    }
  }

  onMount(() => {
    heading.focus();
    void refresh();
    window.addEventListener('focus', refreshAlerts);
    const timer = window.setInterval(refreshAlerts, 30_000);
    return () => {
      serial++;
      statusSerial++;
      window.removeEventListener('focus', refreshAlerts);
      window.clearInterval(timer);
    };
  });

  function open(source: HTMLButtonElement, entry?: PlannerEntry) {
    opener = source;
    draft = entry ? { ...entry } : {
      id: crypto.randomUUID(), kind: 'plan', title: '', notes: null, date: day,
      time: '09:00', end: '10:00', zone: deviceZone(), lead: null,
    };
  }
  async function close(changed: boolean) {
    draft = undefined;
    if (changed) await refresh();
    await tick();
    (opener.isConnected ? opener : add).focus();
  }
  async function closeExport(wrote: boolean) {
    exporting = false;
    exported = wrote;
    await tick();
    exportButton?.focus();
  }
</script>

{#snippet plannerRow(entry: PlannerEntry)}
  <li>
    <time>{plannerTime(entry.time)}{entry.end ? ` – ${plannerTime(entry.end)}` : ''}</time>
    <span>{entry.title}{entry.kind !== 'log' ? ` · ${kindLabel[entry.kind]}` : ''}
      {#if entry.zone !== deviceZone()}<small>{entry.zone}</small>{/if}
      {#if alertStatuses[entry.id]}<small role="status">{alertText[alertStatuses[entry.id]]}</small>{/if}
    </span>
    <button type="button" class="planner-key" aria-label={`Edit ${entry.title}`} onclick={(event) => open(event.currentTarget, entry)}><span>Edit</span></button>
  </li>
{/snippet}

<div class="planner">
  <button type="button" class="planner-key" onclick={back}><span>Back to Calendar</span></button>
  <header>
    <h2 tabindex="-1" bind:this={heading}>{dateLabel(day, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
    <button type="button" class="planner-key" bind:this={add} onclick={(event) => open(event.currentTarget)}><span>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M1.5 1.5h13v13h-13zM4 8h8M8 4v8"/></svg> Add entry
    </span></button>
  </header>
  {#if error}<p role="alert">Could not load planner entries. <button class="planner-key" onclick={refresh}><span>Try again</span></button></p>{/if}
  <h3>Agenda</h3>
  {#if pending}<p role="status">Loading entries…</p>{/if}
  {#if !pending && !error && !agenda.length}<p>No plans, reminders or scheduled starts.</p>{/if}
  <ul>
    {#each agenda as item (item.id)}
      {#if 'entry' in item}{@render plannerRow(item.entry)}
      {:else}
        <li><time>{plannerTime(item.time)}</time><span>{occurrenceLabel(item.grace.at, item.grace.schedule.zone)} · Grace</span>
          <button type="button" class="planner-key" aria-label={`Edit Grace schedule at ${plannerTime(item.time)}`} onclick={(event) => edit(item.grace.schedule, event.currentTarget)}><span>Edit</span></button>
        </li>
      {/if}
    {/each}
  </ul>
  {#if create}<button type="button" class="planner-key" onclick={(event) => create?.(day, event.currentTarget)}><span>New schedule</span></button>{/if}
  <h3>Day log</h3>
  {#if !pending && !error && !logs.length}<p>No work logged.</p>{/if}
  <ul>{#each logs as entry (entry.id)}{@render plannerRow(entry)}{/each}</ul>
  <footer>
    {#if exported}<span role="status">Planner CSV saved.</span>{/if}
    <button type="button" class="planner-key" bind:this={exportButton} onclick={() => { exported = false; exporting = true; }}><span>Export CSV</span></button>
  </footer>
</div>
{#if draft}<EntryEditor initial={draft} existing={entries.some(entry => entry.id === draft?.id)} {close} />{/if}
{#if exporting}<PlannerExport {day} close={closeExport} />{/if}

<style>
  header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-block: 16px; }
  h2, p { margin: 0; }
  h3 { margin: 20px 0 6px; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { display: grid; grid-template-columns: minmax(5ch, auto) minmax(0, 1fr) auto; gap: 10px; align-items: center; padding-block: 6px; border-bottom: 1px solid var(--edge); }
  li span { overflow-wrap: anywhere; }
  small { display: block; }
  footer { margin-block-start: 20px; border-top: 1px solid var(--edge); padding-top: 10px; display: flex; justify-content: flex-end; align-items: center; gap: 8px; flex-wrap: wrap; }
  svg { vertical-align: text-bottom; }
</style>
