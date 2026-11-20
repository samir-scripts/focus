<script lang="ts">
  import { untrack } from 'svelte';
  import { browsers, type Pair } from './browser';

  let { request, error, busy, decide }: { request: Pair; error: string; busy: boolean; decide: (id: string, approved: boolean, label: string | null) => void } = $props();
  let label = $state(untrack(() => request.label));
  let dialog: HTMLDialogElement;

  $effect(() => {
    if (!dialog.open) dialog.showModal();
  });
</script>

<dialog bind:this={dialog} aria-labelledby="pair-heading" oncancel={(event) => event.preventDefault()}>
  <form onsubmit={(event) => { event.preventDefault(); decide(request.id, true, label); }}>
    <h2 id="pair-heading">Connect browser profile?</h2>
    <p>{browsers[request.browser]}</p>
    <label>Profile label <input bind:value={label} maxlength="48" required /></label>
    {#if error}<p role="alert">{error}</p>{/if}
    <div class="actions">
      <button type="button" disabled={busy} onclick={() => decide(request.id, false, null)}>Decline</button>
      <button type="submit" disabled={busy || !label.trim()}>Connect</button>
    </div>
  </form>
</dialog>

<style>
  dialog { border: 1px solid var(--edge); border-radius: var(--radius-dialog); background: var(--surface); color: var(--ink); max-width: min(400px, 85vw); padding: 20px; }
  dialog::backdrop { background: color-mix(in srgb, var(--ink) 32%, transparent); }
  h2, p { margin: 0 0 8px; }
  h2 { font-size: 18px; }
  label { display: grid; gap: 4px; margin-block: 12px; }
  input, button { font: inherit; color: inherit; border: 1px solid var(--edge); background: var(--canvas); border-radius: var(--radius-control); padding: 6px 8px; }
  button:enabled:hover { background: var(--ink); color: var(--canvas); cursor: pointer; }
  input:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .actions { display: flex; flex-wrap: wrap; justify-content: end; gap: 8px; }
</style>
