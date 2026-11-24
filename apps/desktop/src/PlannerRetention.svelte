<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount, tick } from 'svelte';
  import { dateLabel } from './calendar';
  import './planner.css';

  const options = { keep: 'Until I delete them', days30: '30 days', days90: '90 days', year: '1 year' } as const;
  type Policy = keyof typeof options;
  type Preview = { cutoff: string | null; count: number; token: string };
  type Update = { status: 'applied' } | { status: 'changed'; preview: Preview };
  let policy = $state<Policy>();
  let selected = $state<Policy>('keep');
  let preview = $state<Preview>();
  let busy = $state(false);
  let error = $state('');
  let status = $state('');
  let select = $state<HTMLSelectElement>();
  let cancel = $state<HTMLButtonElement>();

  async function load() {
    error = '';
    try { selected = policy = await invoke<Policy>('planner_retention'); }
    catch { error = 'Could not load retention settings.'; }
  }
  onMount(() => { void load(); });

  async function apply(token?: string) {
    if (busy || policy === undefined) return;
    const next = selected;
    busy = true;
    error = status = '';
    let review = false;
    try {
      const result = await invoke<Update>('planner_retention_apply', { policy: next, token: token ?? null });
      if (result.status === 'changed') {
        preview = result.preview;
        status = token ? 'The affected entries changed. Review the updated cleanup before applying.' : '';
        review = true;
      } else {
        policy = next;
        preview = undefined;
        status = 'Retention setting saved.';
      }
    } catch {
      error = 'Could not change retention. Try again.';
      if (!preview) selected = policy;
    } finally { busy = false; }
    await tick();
    (review ? cancel : select)?.focus();
  }
  async function cancelReview() {
    selected = policy ?? 'keep';
    preview = undefined;
    error = status = '';
    await tick();
    select?.focus();
  }
  async function exportRows() {
    if (busy || !preview) return;
    busy = true;
    error = status = '';
    try {
      if (await invoke<boolean>('planner_retention_export', { policy: selected, token: preview.token })) status = 'Cleanup CSV saved.';
    } catch (issue) {
      if (issue !== 'stale_preview') error = 'Could not write the file. Choose a writable location and try again.';
      else {
        try {
          preview = await invoke<Preview>('planner_retention_preview', { policy: selected });
          status = 'The affected entries changed. Review the updated cleanup.';
        } catch { error = 'Could not refresh the cleanup. Cancel and try again.'; }
      }
    } finally { busy = false; }
  }
</script>

<section class="planner retention" aria-label="Planner retention settings">
  {#if error}<p role="alert">{error}</p>{/if}
  {#if policy === undefined}
    {#if error}<button class="planner-key" type="button" onclick={load}><span>Try again</span></button>
    {:else}<p role="status">Loading retention setting…</p>{/if}
  {:else}
    <div class="policy">
      <label for="planner-retention">Past planner entries</label>
      <select id="planner-retention" bind:this={select} bind:value={selected} disabled={busy} onchange={() => { preview = undefined; void apply(); }}>
        {#each Object.entries(options) as [value, label]}<option {value}>{label}</option>{/each}
      </select>
    </div>
    {#if preview}
      <div class="review">
        <h2>Review cleanup</h2>
        <p>{preview.count} {preview.count === 1 ? 'entry' : 'entries'} before {preview.cutoff ? dateLabel(preview.cutoff, { dateStyle: 'medium' }) : ''}</p>
        <div class="planner-actions">
          <button class="planner-key export" type="button" disabled={busy} onclick={exportRows}><span>Export CSV</span></button>
          <button class="planner-key" type="button" bind:this={cancel} disabled={busy} onclick={cancelReview}><span>Cancel</span></button>
          <button class="planner-key" type="button" disabled={busy} onclick={() => apply(preview?.token)}><span>Apply {options[selected]}</span></button>
        </div>
      </div>
    {/if}
    {#if status}<p role="status">{status}</p>{/if}
  {/if}
</section>

<style>
  .retention { margin: 18px 24px; max-inline-size: 730px; }
  .policy { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  select { inline-size: min(100%, 280px); }
  .review { border-top: 1px solid var(--edge); margin-block-start: 20px; padding-block-start: 18px; }
  h2 { margin: 0; }
  .export { margin-inline-end: auto; }
</style>
