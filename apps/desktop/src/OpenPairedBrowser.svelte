<script lang="ts">
  import { catalog } from '../../extension/src/sites/catalog';
  import { VERSION } from '../../extension/src/protocol';
  import { browsers, type BrowserBridge, type BrowserState } from './browser';

  let { bridge, state: browserState, siteId, saving }: { bridge: BrowserBridge; state: BrowserState; siteId: string; saving: boolean } = $props();
  let home = $derived(catalog.find((site) => site.id === siteId)?.home);
  let eligible = $derived(home ? browserState.profiles.filter((profile) => profile.online && !profile.updateRequired &&
    profile.protocol === VERSION && profile.ackRevision === browserState.revision &&
    profile.origins.includes(`${new URL(home).origin}/*`)) : []);
  let selected = $state('');
  let target = $derived(eligible.find((profile) => profile.id === selected) ?? eligible[0]);
  let busy = $state(false);
  let result = $state('');
  async function open() {
    if (!target || busy || saving) return;
    const { id, label } = target;
    result = '';
    busy = true;
    try {
      await bridge.openPairedBrowser(id, siteId, browserState.revision);
      result = `Opened in ${label}.`;
    } catch {
      result = 'Could not confirm that the site opened. Check Browser access.';
    } finally {
      busy = false;
    }
  }
</script>

{#if eligible.length || busy || result}
  <div class="paired-action">
    {#if eligible.length > 1}
      <label>Browser profile
        <select value={target?.id} disabled={busy} onchange={(event) => { selected = event.currentTarget.value; }}>
          {#each eligible as profile (profile.id)}<option value={profile.id}>{profile.label} · {browsers[profile.browser]}</option>{/each}
        </select>
      </label>
    {/if}
    {#if eligible.length || busy}<button type="button" disabled={busy || saving} onclick={open}>Open in paired browser</button>{/if}
    <span role="status">{result}</span>
  </div>
{/if}

<style>
  .paired-action { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  label { display: grid; gap: 4px; min-width: 0; font-size: 13px; }
  select, button { min-height: 36px; max-width: 100%; border: 1px solid var(--edge); border-radius: var(--radius-control); padding-inline: 10px; background: var(--surface); color: var(--ink); font: inherit; }
  button:not(:disabled):is(:hover, :active) { background: var(--accent); color: var(--on-accent); }
  :is(button, select):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  [role='status'] { flex-basis: 100%; font-size: 13px; color: var(--muted); }
  [role='status']:empty { display: none; }
</style>
