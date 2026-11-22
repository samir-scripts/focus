<script lang="ts">
  import type { EntryPolicy } from '../../extension/src/protocol';

  const modes = [{ value: 'allow', label: 'Allow' }, { value: 'pause', label: 'Pause' }, { value: 'block', label: 'Block' }] as const;
  let { entry, busy, save }: { entry: EntryPolicy; busy: boolean; save: (policy: EntryPolicy) => Promise<void> } = $props();

  function select(mode: EntryPolicy['mode']) {
    if (mode === entry.mode) return;
    void save(mode === 'pause' ? { mode, seconds: 15, finish: 'manual', frequency: 'visit' } : { mode });
  }

  async function update(input: HTMLInputElement | HTMLSelectElement, policy: EntryPolicy, previous: string) {
    input.value = previous;
    await save(policy);
  }
</script>

<section aria-labelledby="site-entry-heading">
  <div class="heading">
    <svg viewBox="0 0 24 24" aria-hidden="true" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="9" />
      {#if entry.mode === 'pause'}<path d="M10 8v8m4-8v8" />
      {:else if entry.mode === 'block'}<path d="m6 18 12-12" />
      {:else}<path d="m8 12 3 3 5-6" />{/if}
    </svg>
    <h2 id="site-entry-heading">Site entry</h2>
  </div>
  <p id="site-entry-note">In Chromium, a site may briefly load before Block redirects it to the blocked page.</p>
  <fieldset aria-labelledby="site-entry-heading" aria-describedby="site-entry-note" disabled={busy}>
    <div class="modes">
      {#each modes as mode (mode.value)}
        <label><input type="radio" name="site-entry" checked={entry.mode === mode.value} onchange={() => select(mode.value)} />{mode.label}</label>
      {/each}
    </div>
    {#if entry.mode === 'pause'}
      {@const pause = entry}
      <div class="options">
        <label>Wait (seconds)
          <input type="number" min="5" max="600" step="1" required value={pause.seconds} onchange={(event) => {
            const input = event.currentTarget;
            if (!input.reportValidity()) { input.value = String(pause.seconds); return; }
            void update(input, { ...pause, seconds: input.valueAsNumber }, String(pause.seconds));
          }} />
        </label>
        <label>After waiting
          <select value={pause.finish} onchange={(event) => void update(event.currentTarget, {
            ...pause, finish: event.currentTarget.value === 'auto' ? 'auto' : 'manual',
          }, pause.finish)}>
            <option value="manual">Manual entry</option><option value="auto">Open automatically</option>
          </select>
        </label>
        <label>Pause for
          <select value={pause.frequency} onchange={(event) => void update(event.currentTarget, {
            ...pause, frequency: event.currentTarget.value === 'page' ? 'page' : 'visit',
          }, pause.frequency)}>
            <option value="visit">Each visit</option><option value="page">Each page</option>
          </select>
        </label>
      </div>
    {/if}
  </fieldset>
</section>

<style>
  section { margin-block-start: 16px; border-block-start: 1px solid var(--divider); padding-block-start: 12px; }
  h2 { font-size: 15px; margin: 0; }
  p { margin: 8px 0 0; }
  .heading, .modes, .options { display: flex; flex-wrap: wrap; align-items: start; gap: 8px 12px; }
  .heading { align-items: center; }
  fieldset { border: 0; margin: 8px 0 0; padding: 0; min-width: 0; }
  .modes label { display: flex; align-items: center; gap: 6px; border-radius: var(--radius-control); padding: 6px; cursor: pointer; }
  .modes label:has(:checked) { background: var(--selected); }
  .modes label:is(:hover, :active) { background: var(--accent); color: var(--on-accent); }
  .modes input { margin: 0; }
  @media (forced-colors: none) {
    .modes input {
      appearance: none;
      box-sizing: border-box;
      color: inherit;
      flex: none;
      inline-size: 16px;
      block-size: 16px;
      border: 2px solid currentColor;
      border-radius: 50%;
      background: var(--radio-paper, var(--canvas));
    }
    .modes input:checked {
      background: currentColor;
      box-shadow: inset 0 0 0 3px var(--radio-paper, var(--canvas));
    }
    .modes label:is(:hover, :active) { --radio-paper: var(--accent); }
    .modes label:is(:hover, :active) input:focus-visible { outline-color: currentColor; }
  }
  .options { margin-top: 10px; }
  .options label { display: grid; gap: 4px; min-width: 0; max-width: 100%; }
  .options input, .options select { min-height: 32px; padding: 4px 6px; border: 1px solid var(--edge); border-radius: var(--radius-control); background: var(--surface); color: var(--ink); font: inherit; max-width: 100%; }
  .options input { width: 8ch; }
</style>
