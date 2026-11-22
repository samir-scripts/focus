<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount, tick, untrack } from 'svelte';
  import { calendarDays, dateLabel, moveDate, moveMonth, occurrenceLabel, weekdayBit } from './calendar';
  import type { Schedule } from './schedules';

  let { initial, close, saved }: { initial: Schedule; close: () => void; saved: () => void } = $props();
  let dialog: HTMLDialogElement;
  const original = untrack(() => initial);
  let date = $state(original.date);
  let month = $state(original.date.slice(0, 7));
  let time = $state(original.time);
  let weekdays = $state(original.weekdays);
  let next = $state<number | null>();
  let pending = $state(false);
  let error = $state('');
  let validation = $state('');
  const zone = original.zone;
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const zoneLabel = zone === 'UTC' ? 'UTC' : zone.split('/').at(-1)?.replaceAll('_', ' ');
  let schedule = $derived({ id: initial.id, date, time, zone, weekdays });
  let cells = $derived(calendarDays(month));
  let focusDate = $derived(date.startsWith(month) ? date : `${month}-01`);

  onMount(() => { dialog.showModal(); });

  $effect(() => {
    const draft = schedule;
    let current = true;
    next = undefined;
    validation = '';
    if (draft.date && draft.time && draft.weekdays !== 0) {
      void invoke<number | null>('preview_schedule', { schedule: draft }).then(
        value => { if (current) next = value; },
        () => { if (current) validation = 'Check the date, time and time zone.'; },
      );
    }
    return () => { current = false; };
  });

  function choose(value: string) {
    date = value;
    if (value) month = value.slice(0, 7);
  }

  async function navigateDay(event: KeyboardEvent, value: string) {
    const direction = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (direction === undefined) return;
    event.preventDefault();
    const nextDay = moveDate(value, direction);
    choose(nextDay);
    await tick();
    dialog.querySelector<HTMLButtonElement>(`[data-date="${nextDay}"]`)?.focus();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (pending || !next || weekdays === 0) return;
    pending = true;
    error = '';
    try {
      await invoke('save_schedule', { schedule });
      saved();
      dialog.close();
    } catch {
      error = 'Could not save this schedule. Check that the start time is still in the future and try again.';
    } finally {
      pending = false;
    }
  }
</script>

<dialog class="schedule-dialog" bind:this={dialog} aria-labelledby="schedule-title" aria-describedby="schedule-intro" onclose={close}
  onkeydown={(event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (!pending) dialog.close();
  }}
  oncancel={(event) => { if (pending) event.preventDefault(); }}>
  <header>
    <h2 id="schedule-title">{initial.editing ? 'Edit schedule' : 'Schedule a session'}</h2>
    <p id="schedule-intro">focus. opens Grace at the scheduled time.</p>
  </header>
  <form onsubmit={submit}>
    <div class="columns">
      <section class="calendar" aria-label="Calendar">
        <div class="month">
          <strong aria-live="polite">{dateLabel(`${month}-01`, { month: 'long', year: 'numeric' })}</strong>
          <button type="button" aria-label="Previous month" onclick={() => { month = moveMonth(month, -1); }}>
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="m7.5 2-4 4 4 4" fill="none" stroke="currentColor" /></svg>
          </button>
          <button type="button" aria-label="Next month" onclick={() => { month = moveMonth(month, 1); }}>
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="m4.5 2 4 4-4 4" fill="none" stroke="currentColor" /></svg>
          </button>
        </div>
        <div class="days">
          {#each days as day}<small aria-hidden="true">{day.slice(0, 2)}</small>{/each}
          {#each cells as day}
            {#if day}
              <button type="button" data-date={day} tabindex={day === focusDate ? 0 : -1} aria-pressed={day === date}
                aria-label={dateLabel(day, { dateStyle: 'full' })} onclick={() => choose(day)} onkeydown={(event) => navigateDay(event, day)}>{Number(day.slice(-2))}</button>
            {:else}<span></span>{/if}
          {/each}
        </div>
      </section>
      <section class="fields" aria-label="Schedule details">
        <label for="schedule-date">Date</label>
        <input id="schedule-date" type="date" required value={date} onchange={(event) => choose(event.currentTarget.value)} />
        <label for="schedule-time">Time</label>
        <div class="time">
          <input id="schedule-time" type="time" required bind:value={time} aria-describedby={validation || next === null ? 'schedule-zone schedule-timing' : 'schedule-zone'} />
          <small id="schedule-zone" title={zone}>{zoneLabel}<span class="sr-only"> ({zone})</span></small>
        </div>
        {#if validation || next === null}<p id="schedule-timing" role="status">{validation || 'Choose a future date and time.'}</p>{/if}
        <label class="repeat"><input type="checkbox" checked={weekdays !== null}
          onchange={(event) => { weekdays = event.currentTarget.checked ? weekdayBit(date || initial.date) : null; }} /> Repeat weekly</label>
        {#if weekdays !== null}
          <div class="weekdays" role="group" aria-label="Repeat on">
            {#each days as day, i}
              {@const bit = 1 << i}
              <button type="button" aria-label={day} aria-pressed={(weekdays & bit) !== 0}
                onclick={() => { weekdays = (weekdays ?? 0) ^ bit; }}>{day.slice(0, 3)}</button>
            {/each}
          </div>
          {#if weekdays === 0}<p role="status">Choose at least one weekday.</p>
          {:else if time}<small>{days.filter((_, i) => ((weekdays ?? 0) & (1 << i)) !== 0).map(day => day.slice(0, 3)).join(', ')} at {new Date(`2000-01-01T${time}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</small>{/if}
        {/if}
        {#if next && weekdays !== null && new Intl.DateTimeFormat(undefined, { timeZone: zone, dateStyle: 'full' }).format(next * 1000) !== dateLabel(date, { dateStyle: 'full' })}
          <small>First start: {occurrenceLabel(next, zone)}</small>
        {/if}
      </section>
    </div>
    {#if error}<p role="alert">{error}</p>{/if}
    <footer>
      <button type="button" disabled={pending} onclick={() => dialog.close()}>Cancel</button>
      <button type="submit" disabled={pending || !next || weekdays === 0}>{pending ? 'Saving…' : initial.editing ? 'Save' : 'Schedule'}</button>
    </footer>
  </form>
</dialog>

<style>
  dialog { box-sizing: border-box; width: min(630px, calc(100% - 32px)); max-width: none; max-height: calc(100% - 32px); padding: 18px 20px 20px; border: 1px solid var(--edge); border-radius: var(--radius-dialog); background: var(--surface); color: var(--ink); }
  dialog::backdrop { background: color-mix(in srgb, var(--ink) 32%, transparent); }
  h2, p { margin: 0; }
  h2 { font-size: 24px; line-height: 1.25; }
  header p { margin-top: 3px; }
  .columns { margin: 15px 0; padding: 17px 0; display: grid; grid-template-columns: 46% 54%; border-block: 1px solid var(--edge); }
  .calendar { padding-right: 18px; }
  .month { display: flex; gap: 6px; align-items: center; margin-bottom: 14px; }
  .month strong { margin-right: auto; font-size: 18px; }
  .month button { display: grid; place-items: center; width: 24px; height: 24px; }
  .days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-auto-rows: 25px; place-items: center; }
  .days button { width: min(100%, 30px); height: 24px; padding: 0; }
  .days button, .month button { border-color: transparent; }
  .fields { min-width: 0; padding-left: 20px; border-left: 1px solid var(--edge); display: flex; flex-direction: column; gap: 4px; }
  label { font-weight: bold; }
  input { min-width: 0; }
  input:not([type=checkbox]) { font: inherit; color: inherit; background: var(--rail); border: 1px solid var(--edge); border-radius: var(--radius-control); box-sizing: border-box; padding: 4px 7px; }
  input[type=date] { width: 100%; margin-bottom: 4px; }
  input[type=time] { width: 118px; }
  input[type=checkbox] { appearance: none; display: grid; place-items: center; width: 16px; height: 16px; border: 1px solid var(--ink); border-radius: 2px; background: var(--rail); }
  input[type=checkbox]:checked { background: var(--accent); border-color: var(--accent); color: var(--surface); }
  input[type=checkbox]:checked::before { content: ''; width: 8px; height: 4px; border: solid currentColor; border-width: 0 0 2px 2px; transform: translateY(-1px) rotate(-45deg); }
  .time, .repeat { display: flex; align-items: center; gap: 8px; }
  .repeat { margin-top: 7px; font-weight: normal; }
  .repeat input { margin: 0; }
  .weekdays { display: flex; flex-wrap: wrap; gap: 4px; }
  .weekdays button { padding: 1px 4px; font-size: 13px; }
  small { font-size: 13px; }
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); }
  footer { display: flex; justify-content: end; gap: 8px; flex-wrap: wrap; }
  button { font: inherit; color: inherit; background: var(--rail); border: 1px solid var(--ink); border-radius: var(--radius-control); padding: 2px 12px; }
  .days button, .month button { background: transparent; }
  button[aria-pressed=true] { background: var(--accent); border-color: var(--accent); color: var(--surface); }
  button[type=submit]:not(:disabled) { color: var(--accent); border-color: var(--accent); }
  button:not(:disabled):hover, button:not(:disabled):active { background: var(--ink); color: var(--surface); }
  button:disabled { opacity: .65; }
  @media (max-width: 560px) {
    .columns { grid-template-columns: 1fr; gap: 12px; }
    .calendar { padding-right: 0; }
    .fields { padding: 12px 0 0; border-left: 0; border-top: 1px solid var(--edge); }
  }
  @media (forced-colors: active) {
    input[type=checkbox] { appearance: auto; }
    input[type=checkbox]:checked::before { content: none; }
    button[aria-pressed=true] { forced-color-adjust: none; background: Highlight; color: HighlightText; border-color: Highlight; }
  }
</style>
