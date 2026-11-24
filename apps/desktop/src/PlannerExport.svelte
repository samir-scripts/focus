<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';
  import './planner.css';

  let { day, close }: { day: string; close: (exported: boolean) => void } = $props();
  const initialDate = () => day;
  let from = $state(initialDate());
  let through = $state(initialDate());
  let count = $state<number>();
  let busy = $state(false);
  let error = $state('');
  let reload = $state(0);
  let dialog: HTMLDialogElement;
  onMount(() => { dialog.showModal(); });

  $effect(() => {
    const range = { from, through };
    void reload;
    count = undefined;
    error = '';
    if (!range.from || !range.through) return;
    if (range.through < range.from) { error = 'Through must be on or after From.'; return; }
    let current = true;
    void invoke<number>('planner_export_count', range).then(value => {
      if (current) count = value;
    }, () => { if (current) error = 'Could not count entries for this range.'; });
    return () => { current = false; };
  });
  async function choose(event: SubmitEvent) {
    event.preventDefault();
    if (busy || count === undefined) return;
    busy = true;
    error = '';
    try {
      if (await invoke<boolean>('planner_export', { from, through, count })) close(true);
    } catch (issue) {
      if (issue === 'stale_export') reload++;
      else error = 'Could not write the file. Choose a writable location and try again.';
    } finally { busy = false; }
  }
</script>

<dialog class="planner export" bind:this={dialog} aria-labelledby="planner-export-heading"
  oncancel={(event) => { event.preventDefault(); if (!busy) close(false); }}>
  <h2 id="planner-export-heading">Export CSV</h2>
  <form onsubmit={choose}>
    <fieldset disabled={busy}>
      <div class="dates">
        <label for="export-from">From</label><input id="export-from" type="date" required bind:value={from} />
        <label for="export-through">Through</label><input id="export-through" type="date" required bind:value={through} />
      </div>
      {#if error}<p role="alert">{error}</p>
      {:else if count !== undefined}<p role="status">{count} planner {count === 1 ? 'entry' : 'entries'}</p>
      {:else if from && through}<p role="status">Counting entries…</p>{/if}
      <div class="planner-actions">
        <button class="planner-key" type="button" onclick={() => close(false)}><span>Cancel</span></button>
        <button class="planner-key" type="submit" disabled={count === undefined}><span>Choose file…</span></button>
      </div>
    </fieldset>
  </form>
</dialog>

<style>
  .export { inline-size: 340px; }
  h2 { margin: 0 0 12px; }
  fieldset { padding: 0; border: 0; margin: 0; min-inline-size: 0; }
  .dates { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 12px; align-items: center; }
  p { border-top: 1px solid var(--edge); padding-top: 10px; margin-block-end: 0; }
</style>
