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
  $: hideShorts = !!policy?.sites.find((entry) => entry.id === 'youtube')?.rules['youtube.hide-shorts'];
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
  <header><TypewriterMark size={24} /><span class="wordmark">focus.</span></header>
  <h1>{#if site}<SiteMark id={site.id} /> {site.label}{:else}Browser access{/if}</h1>
  <p>{status}</p>
  {#if !hasAccess}<p>Needs access on supported sites. Choose exact addresses in browser setup.</p>
  {:else}
    <p>Site entry: {detail?.entry.mode === 'block' ? 'Block' : detail?.entry.mode === 'pause' ? 'Pause' : 'Allow'}</p>
    <p>Grayscale is {detail?.grayscale ? 'on' : 'off'}.</p>
    {#if isShortsHost}<p>{hideShorts ? 'Hide Shorts is on' : 'Hide Shorts is off'}.</p>{/if}
    {#if status === 'Disconnected' || status === 'Update required'}<p>Last applied policy.</p>{/if}
  {/if}
  {#if openSite}
    <button type="button" onclick={openDesktop}>Open in focus.</button>
  {:else}
    <p><button type="button" onclick={setup}>Browser setup</button></p>
  {/if}
  {#if error}<p role="status">{error}</p>{/if}
</main>
