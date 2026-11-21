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
  let polling = false;
  let holding: { input: string; nonce: string; revision: number } | undefined;
  let holdTimer: number | undefined;
  $: seconds = Math.ceil((view.remaining ?? 0) / 1000);
  $: gestureSeconds = Math.ceil((view.gestureRemaining ?? 0) / 1000);

  type RequestType = 'entry-view' | 'entry-continue' | 'entry-back' | 'entry-hold-start' | 'entry-hold-cancel'
    | 'entry-hold-complete' | 'entry-two-step-start' | 'entry-two-step-confirm';
  function request(type: RequestType, identity = { nonce: view.nonce, revision: view.revision }, done?: (result: EntryView) => void) {
    if (type === 'entry-view' && polling) return;
    if (type === 'entry-view') polling = true;
    chrome.runtime.sendMessage({ type, ...identity }, (result) => {
      if (type === 'entry-view') polling = false;
      loading = false;
      if (chrome.runtime.lastError || !result || type === 'entry-back') return;
      if (previousNonce !== result.nonce) speaking = '';
      previousNonce = result.nonce;
      view = result;
      if (view.mode === 'pause' && view.finish === 'manual' && view.remaining === 0 && view.manual === 'continue') speaking = 'Continue is available.';
      done?.(result);
    });
  }

  function startHold(input: string) {
    if (holding || seconds !== 0 || !view.nonce || view.revision === undefined) return;
    const active = { input, nonce: view.nonce, revision: view.revision };
    holding = active;
    request('entry-hold-start', active, (result) => {
      if (holding !== active || result.nonce !== active.nonce || result.gestureRemaining === undefined) return;
      holdTimer = window.setTimeout(() => {
        if (holding !== active) return;
        holding = undefined;
        holdTimer = undefined;
        request('entry-hold-complete', active);
      }, result.gestureRemaining + 10);
    });
  }

  function cancelHold(input?: string) {
    const active = holding;
    if (!active || input && active.input !== input) return;
    holding = undefined;
    window.clearTimeout(holdTimer);
    holdTimer = undefined;
    request('entry-hold-cancel', active);
  }

  onMount(() => {
    const blur = () => cancelHold();
    const visibility = () => { if (document.hidden) cancelHold(); };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    request('entry-view');
    const timer = window.setInterval(() => request('entry-view'), 250);
    return () => {
      cancelHold();
      window.clearInterval(timer);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
    };
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
      {#if view.manual === 'continue'}
        <button type="button" disabled={seconds !== 0} onclick={() => request('entry-continue')}>Continue</button>
      {:else if view.manual === 'hold'}
        <button type="button" disabled={seconds !== 0}
          onpointerdown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            startHold(`pointer:${event.pointerId}`);
          }}
          onpointerup={(event) => cancelHold(`pointer:${event.pointerId}`)}
          onpointercancel={(event) => cancelHold(`pointer:${event.pointerId}`)}
          onlostpointercapture={(event) => cancelHold(`pointer:${event.pointerId}`)}
          onkeydown={(event) => {
            if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
              event.preventDefault();
              startHold(`key:${event.key}`);
            }
          }}
          onkeyup={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              cancelHold(`key:${event.key}`);
            }
          }}
          onblur={() => cancelHold()}>Hold to enter</button>
        {#if view.gestureRemaining !== undefined}<p>Keep holding: {gestureSeconds}s</p>{/if}
      {:else if view.manual === 'two-step'}
        {#if view.gestureRemaining === undefined}
          <button type="button" disabled={seconds !== 0} onclick={() => request('entry-two-step-start')}>Start confirmation</button>
        {:else}
          <button type="button" disabled={gestureSeconds !== 0} onclick={() => request('entry-two-step-confirm')}>Enter site</button>
          {#if gestureSeconds !== 0}<p>Wait {gestureSeconds}s before entering.</p>{/if}
        {/if}
      {/if}
    {/if}
  </div>
  <span class="sr-only" role="status">{speaking}</span>
</main>

<style>
  .countdown { font: 700 48px/1 var(--font-ui); font-variant-numeric: tabular-nums; }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
