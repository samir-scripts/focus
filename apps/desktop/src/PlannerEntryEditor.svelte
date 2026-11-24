<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount, tick } from 'svelte';
  import PlannerClock from './PlannerClock.svelte';
  import { deviceZone, kindLabel, plannerTime, reminderLeads, type PlannerEntry, type PlannerKind } from './planner';
  import './planner.css';

  let { initial, existing, close }: { initial: PlannerEntry; existing: boolean; close: (changed: boolean) => void } = $props();
  const copy = () => ({ ...initial, time: initial.time.slice(0, 5), end: initial.end?.slice(0, 5) ?? null });
  let entry = $state(copy());
  let clock = $state<'time' | 'end'>();
  let busy = $state(false);
  let deleting = $state(false);
  let error = $state('');
  let confirmation = $state('');
  let alertsAvailable = $state<boolean>();
  let dialog: HTMLDialogElement;
  let title = $state<HTMLInputElement>();
  let timeButton = $state<HTMLButtonElement>();
  let endButton = $state<HTMLButtonElement>();
  let deleteButton = $state<HTMLButtonElement>();
  let keepButton = $state<HTMLButtonElement>();
  onMount(() => {
    dialog.showModal();
    title?.focus();
    void invoke<boolean>('planner_alerts_available').then(value => alertsAvailable = value, () => alertsAvailable = false);
  });

  const paths = {
    title: 'M2 11v3h3l9-9-3-3zM9 4l3 3', date: 'M2 3h12v11H2zM2 6h12M5 1v4M11 1v4M5 9h2m2 0h2',
    time: 'M6 2h4l4 4v4l-4 4H6l-4-4V6zM8 4v4h3',
    bell: 'M3 11h10l-2-3V5L9 3H7L5 5v3zM7 13h2',
    notes: 'M3 2h8l2 2v10H3zM5 6h6M5 9h6M5 12h4',
  };
  function changeKind(kind: PlannerKind) {
    if (kind === entry.kind) return;
    entry.kind = kind;
    entry.end = kind === 'plan' ? '10:00' : null;
    entry.lead = null;
    changed();
  }
  function changed() { error = ''; confirmation = ''; }
  async function closeClock(value?: string) {
    const field = clock;
    if (field && value) { entry[field] = value; changed(); }
    clock = undefined;
    await tick();
    (field === 'end' ? endButton : timeButton)?.focus();
  }
  function payload(): PlannerEntry {
    return { ...entry, time: `${entry.time}:00`, end: entry.end === null ? null : `${entry.end}:00`, notes: entry.notes || null };
  }
  function offset(seconds: number) {
    const n = Math.abs(seconds);
    return `UTC${seconds < 0 ? '−' : '+'}${String(Math.floor(n / 3600)).padStart(2, '0')}:${String(Math.floor(n % 3600 / 60)).padStart(2, '0')}`;
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    const draft = payload();
    try {
      const result = await invoke<{ time_offset: number | null; end_offset: number | null }>('planner_validate', { entry: draft });
      const folds = [result.time_offset === null ? '' : `${entry.kind === 'plan' ? 'Start' : 'Time'}: ${offset(result.time_offset)}`,
        result.end_offset === null ? '' : `End: ${offset(result.end_offset)}`].filter(Boolean);
      if (folds.length && !confirmation) {
        confirmation = `This time repeats. The first occurrence will be saved (${folds.join('; ')}).`;
        return;
      }
      await invoke('planner_save', { entry: draft });
      close(true);
    } catch (issue) {
      error = typeof issue === 'string' ? issue : 'save';
    } finally { busy = false; }
  }
  async function confirmDelete(value: boolean) {
    deleting = value;
    await tick();
    (value ? keepButton : deleteButton)?.focus();
  }
  async function remove() {
    if (busy) return;
    busy = true;
    try { await invoke('planner_delete', { id: entry.id }); close(true); }
    catch { error = 'delete'; }
    finally { busy = false; }
  }
  function cancel() {
    if (busy) return;
    if (deleting) void confirmDelete(false);
    else close(false);
  }
  const messages: Record<string, string> = {
    title: 'Enter a title.', zone: 'The saved time zone is unavailable.',
    time_gap: 'This time does not exist on this date in the saved zone.',
    end_gap: 'This end time does not exist on this date in the saved zone.',
    end_order: 'End must be after start on the same day.',
    alert_elapsed: 'The alert time has passed. Choose a future time or No alert.',
  };
  let field = $derived(error === 'time_gap' ? 'time' : error.startsWith('end_') ? 'end' : error);
</script>

{#snippet icon(path: string)}
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d={path}/></svg>
{/snippet}
<dialog class="planner entry-editor" aria-labelledby="planner-editor-heading" bind:this={dialog} oncancel={(event) => { event.preventDefault(); cancel(); }}>
  <h2 id="planner-editor-heading">{existing ? 'Edit entry' : 'Add entry'}</h2>
  {#if deleting}
    <p>Delete “{entry.title}” from the planner?</p>
    {#if error === 'delete'}<p role="alert">Could not delete the entry. Try again.</p>{/if}
    <div class="planner-actions">
      <button type="button" class="planner-key" bind:this={keepButton} disabled={busy} onclick={() => confirmDelete(false)}><span>Keep entry</span></button>
      <button type="button" class="planner-key" disabled={busy} onclick={remove}><span>Delete entry</span></button>
    </div>
  {:else}
    <form onsubmit={save}>
      <fieldset disabled={busy}>
        <div role="group" aria-label="Entry type" class="kinds">
          {#each Object.keys(kindLabel) as kind}<button type="button" class="planner-key" aria-pressed={entry.kind === kind} onclick={() => changeKind(kind as PlannerKind)}><span>{kindLabel[kind as PlannerKind]}</span></button>{/each}
        </div>
        <div class="fields">
          <label for="planner-title">{@render icon(paths.title)} Title</label>
          <input id="planner-title" bind:this={title} bind:value={entry.title} oninput={changed} required aria-invalid={field === 'title'} />
          {#if field === 'title'}<p role="alert" class="field-error">{messages.title}</p>{/if}
          <label for="planner-date">{@render icon(paths.date)} Date</label>
          <input id="planner-date" type="date" bind:value={entry.date} oninput={changed} required />
          <span id="planner-time-label">{@render icon(paths.time)} {entry.kind === 'plan' ? 'Start' : 'Time'}</span>
          <button type="button" class="planner-key time" aria-labelledby="planner-time-label planner-time" aria-haspopup="dialog" aria-describedby={field === 'time' ? 'planner-time-error' : undefined} bind:this={timeButton} onclick={() => clock = 'time'}><span id="planner-time">{plannerTime(entry.time)}</span></button>
          {#if field === 'time'}<p id="planner-time-error" role="alert" class="field-error">{messages[error]}</p>{/if}
          {#if entry.end !== null}
            <span id="planner-end-label">{@render icon(paths.time)} End</span>
            <button type="button" class="planner-key time" aria-labelledby="planner-end-label planner-end" aria-haspopup="dialog" aria-describedby={field === 'end' ? 'planner-end-error' : undefined} bind:this={endButton} onclick={() => clock = 'end'}><span id="planner-end">{plannerTime(entry.end)}</span></button>
            {#if field === 'end'}<p id="planner-end-error" role="alert" class="field-error">{messages[error]}</p>{/if}
          {/if}
          {#if entry.kind === 'reminder'}
            <label for="planner-lead">{@render icon(paths.bell)} Notify</label>
            <select id="planner-lead" bind:value={entry.lead} onchange={changed}>
              <option value={null}>No alert</option>
              {#each reminderLeads as [lead, label]}<option value={lead}>{label}</option>{/each}
            </select>
            {#if entry.lead !== null && alertsAvailable !== true}<p class="field-error">{alertsAvailable === false ? 'Local alerts are unavailable in this app. The reminder will still be saved.' : 'Checking local alert availability…'}</p>{/if}
            {#if error === 'alert_elapsed'}<p class="field-error" role="alert">{messages.alert_elapsed}</p>{/if}
          {/if}
          <label for="planner-notes">{@render icon(paths.notes)} Notes</label>
          <textarea id="planner-notes" rows="2" value={entry.notes ?? ''} oninput={(event) => { entry.notes = event.currentTarget.value; changed(); }}></textarea>
        </div>
        {#if entry.zone !== deviceZone()}<p>Saved time zone: {entry.zone}</p>{/if}
        {#if confirmation}<p role="status">{confirmation}</p>{/if}
        {#if error && !['title', 'time', 'end', 'alert_elapsed'].includes(field)}<p role="alert">{messages[error] ?? 'Could not save the entry. Check the fields and try again.'}</p>{/if}
        <div class="planner-actions">
          {#if existing}<button type="button" class="planner-key delete" bind:this={deleteButton} onclick={() => confirmDelete(true)}><span>Delete…</span></button>{/if}
          <button type="button" class="planner-key" onclick={cancel}><span>Cancel</span></button>
          <button type="submit" class="planner-key"><span>{confirmation ? 'Save first occurrence' : existing ? 'Save changes' : `Save ${kindLabel[entry.kind].toLowerCase()}`}</span></button>
        </div>
      </fieldset>
    </form>
  {/if}
</dialog>
{#if clock}<PlannerClock value={entry[clock] ?? entry.time} close={closeClock} />{/if}

<style>
  .entry-editor { inline-size: 420px; }
  h2 { margin: 0 0 10px; }
  fieldset { min-inline-size: 0; padding: 0; border: 0; margin: 0; }
  .kinds { display: flex; gap: 8px; margin-block-end: 12px; }
  .fields { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 16px; align-items: center; }
  .fields input, textarea { box-sizing: border-box; width: 100%; }
  .fields svg { vertical-align: text-bottom; margin-inline-end: 3px; }
  .time { text-align: start; }
  .field-error { grid-column: 2; margin: 0; }
  .delete { margin-inline-end: auto; }
  @media (max-width: 340px) { .fields { column-gap: 6px; } .fields svg { display: none; } }
</style>
