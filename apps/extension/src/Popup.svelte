<script module lang="ts">
  declare const chrome: any;
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import TypewriterMark from '@focus/ui/TypewriterMark.svelte';
  import SiteMark from '@focus/ui/SiteMark.svelte';
  import { catalog } from './sites/catalog';
  import { grantedOrigins } from './permissions';
  import { validSnapshot, type Snapshot } from './protocol';
  import { matchPattern, webTarget } from './entry-rules';
  import './ui.css';
  let status = 'Not connected';
  let target: URL | undefined;
  let policy: Snapshot | undefined;
  let grants = new Set<string>();
  $: origin = target ? matchPattern(target) : '';
  $: savedSite = target && policy?.sites.find((entry) => 'hosts' in entry && entry.hosts.includes(target!.hostname));
  $: detail = savedSite && 'hosts' in savedSite ? savedSite : undefined;
  $: site = detail ?? catalog.find((entry) => target && entry.hosts.includes(target.hostname));
  $: isShortsHost = site?.id === 'youtube' && target?.hostname !== 'youtu.be';
  $: hideShorts = policy?.sites.find((entry) => entry.id === 'youtube')?.rules['youtube.hide-shorts'];
  $: showsShorts = isShortsHost && hideShorts !== undefined;
  let error = '';
  $: hasAccess = !!site && grants.has(origin);
  $: openSite = hasAccess && status === 'Connected' ? site : undefined;

  onMount(() => {
    chrome.storage.local.get(['status', 'policy'], (stored: { status?: string; policy?: unknown }) => {
      status = stored.status ?? 'Not connected';
      policy = validSnapshot(stored.policy) ? stored.policy : undefined;
    });
    chrome.permissions.getAll((permissions: { origins?: string[] }) => {
      grants = new Set(grantedOrigins(permissions?.origins ?? []));
    });
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]: { url?: string; incognito?: boolean }[]) => {
      if (!tab?.url || tab.incognito) return;
      const entry = `${chrome.runtime.getURL('entry.html')}#`;
      target = webTarget(tab.url.startsWith(entry) ? tab.url.slice(entry.length) : tab.url);
    });
  });
  function setup() { chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') }); window.close(); }
  function openDesktop() {
    if (!openSite) return;
    chrome.runtime.sendMessage({ type: 'open-desktop', siteId: openSite.id }, (result: { ok?: boolean }) => {
      if (chrome.runtime.lastError || !result?.ok) error = 'Could not open focus. Check the profile connection.';
    });
  }
</script>

<main class="popup">
  <header><TypewriterMark size={22} /><span class="wordmark">focus.</span></header>
  <h1>{#if site}<SiteMark id={site.id} /> <span>{site.label}</span>{:else}Browser access{/if}</h1>
  <p class="connection" class:connected={status === 'Connected'}>{status}</p>
  {#if !hasAccess}
    <p class="muted">Needs access on supported sites. Choose exact addresses in browser setup.</p>
  {:else if detail || showsShorts}
    <dl aria-label="Applied policy">
      {#if detail}
        <div><dt>Site entry</dt><dd>{detail.entry.mode === 'block' ? 'Block' : detail.entry.mode === 'pause' ? 'Pause' : 'Allow'}</dd></div>
        <div><dt>Grayscale</dt><dd>{detail.grayscale ? 'On' : 'Off'}</dd></div>
      {/if}
      {#if showsShorts}<div><dt>Hide Shorts</dt><dd>{hideShorts ? 'On' : 'Off'}</dd></div>{/if}
    </dl>
    {#if status === 'Disconnected' || status === 'Update required'}<p class="muted">Last applied policy.</p>{/if}
  {:else}
    <p class="muted">No applied policy available.</p>
  {/if}
  <footer>
    {#if openSite}
      <button type="button" onclick={openDesktop}>Open in focus.</button>
    {:else}
      <button type="button" onclick={setup}>Browser setup</button>
    {/if}
    {#if error}<p role="status">{error}</p>{/if}
  </footer>
</main>

<style>
  .popup { inline-size: 360px; max-inline-size: 100%; padding: 16px 20px 20px; }
  header { margin: 0 0 16px; padding-bottom: 10px; }
  h1 { display: flex; align-items: center; gap: 8px; margin: 0; font: 700 22px/1.2 var(--font-ui); overflow-wrap: anywhere; }
  h1 :global(svg) { flex: none; }
  p { margin: 8px 0 0; font-size: 15px; }
  .connection { display: flex; align-items: center; gap: 7px; font-weight: 700; }
  .connection::before { content: ''; inline-size: 6px; block-size: 6px; flex: none; background: var(--secondary); }
  .connection.connected::before { background: var(--accent); }
  dl { margin: 12px 0 0; font-size: 15px; border-block-end: 1px solid var(--divider); }
  dl div { display: flex; flex-wrap: wrap; gap: 0 12px; justify-content: space-between; padding: 6px 0; border-block-start: 1px solid var(--divider); }
  dt { color: var(--muted); }
  dd { margin: 0; font-weight: 700; }
  footer { margin-top: 16px; }
  footer button { display: block; min-block-size: 36px; color: var(--accent); border-color: var(--accent); }
  footer button:is(:hover, :active) { color: var(--on-accent); background: var(--accent); }
  footer p { color: var(--error); }
  @media (prefers-reduced-motion: no-preference) {
    footer button { transition: color var(--motion-hover) ease-in-out, background-color var(--motion-hover) ease-in-out, transform var(--motion-press) var(--ease); }
    footer button:active { transform: translateY(1px); }
  }
</style>
