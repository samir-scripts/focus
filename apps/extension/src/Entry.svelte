<script module lang="ts">
  import type { EntryView } from './site-entry';
  declare const chrome: { runtime: {
    lastError?: unknown;
    sendMessage(message: object, reply: (result?: EntryView) => void): void;
  } };
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import TypewriterMark from '@focus/ui/TypewriterMark.svelte';
  import './ui.css';

  let view: EntryView = {};
  let loading = true;
  let speaking = '';
  let previousNonce: string | undefined;
  let busy = false;
  $: seconds = Math.ceil((view.remaining ?? 0) / 1000);

  function request(type: 'entry-view' | 'entry-continue' | 'entry-back') {
    if (busy) return;
    busy = true;
    chrome.runtime.sendMessage({ type, nonce: view.nonce }, (result) => {
      busy = false;
      loading = false;
      if (chrome.runtime.lastError || !result || type === 'entry-back') return;
      if (previousNonce !== result.nonce) speaking = '';
      previousNonce = result.nonce;
      view = result;
      if (view.mode === 'pause' && view.finish === 'manual' && view.remaining === 0) speaking = 'Continue is available.';
    });
  }

  onMount(() => {
    request('entry-view');
    const timer = window.setInterval(() => request('entry-view'), 250);
    return () => window.clearInterval(timer);
  });
</script>

<main>
  <header><TypewriterMark size={24} /><span class="wordmark">focus.</span></header>
  <h1>{view.label ?? 'Site entry'}</h1>
  {#if view.mode === 'pause'}
    <p>Pause before opening this site.</p>
    <p class="countdown" aria-label="Time remaining">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>
  {:else if view.mode === 'block'}
    <p>Site entry is blocked. Change this setting in focus.</p>
  {:else if loading}
    <p>Checking site entry…</p>
  {:else}
    <p>This entry request is no longer available.</p>
  {/if}
  <div class="actions">
    <button type="button" onclick={() => request('entry-back')}>Go back</button>
    {#if view.mode === 'pause' && view.finish === 'manual'}
      <button type="button" disabled={seconds !== 0} onclick={() => request('entry-continue')}>Continue</button>
    {/if}
  </div>
  <span class="sr-only" role="status">{speaking}</span>
</main>

<style>
  .countdown { font: 700 48px/1 var(--font-ui); font-variant-numeric: tabular-nums; }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
