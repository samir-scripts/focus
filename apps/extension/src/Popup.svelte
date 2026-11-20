<script module lang="ts">
  declare const chrome: any;
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import TypewriterMark from '@focus/ui/TypewriterMark.svelte';
  import SiteMark from '@focus/ui/SiteMark.svelte';
  import { catalog, type SiteDefinition } from './sites/catalog';
  import type { Snapshot } from './protocol';
  import './ui.css';
  let status = 'Not connected';
  let site: SiteDefinition | undefined;
  let isShortsHost = false;
  let hideShorts = false;
  let error = '';
  onMount(() => {
    chrome.storage.local.get(['status', 'policy'], (stored: { status?: string; policy?: Snapshot }) => {
      status = stored.status ?? 'Not connected';
      hideShorts = !!stored.policy?.sites.find((entry) => entry.id === 'youtube')?.rules['youtube.hide-shorts'];
    });
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]: { url?: string; incognito?: boolean }[]) => {
      if (!tab?.url || tab.incognito) return;
      const url = new URL(tab.url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      site = catalog.find((entry) => entry.hosts.includes(url.hostname));
      isShortsHost = site?.id === 'youtube' && url.hostname !== 'youtu.be';
    });
  });
  function setup() { chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') }); window.close(); }
  function openDesktop() {
    chrome.runtime.sendMessage({ type: 'open-desktop', siteId: site?.id ?? null }, (result: { ok?: boolean }) => {
      if (chrome.runtime.lastError || !result?.ok) error = 'Could not open focus. Check the profile connection.';
    });
  }
</script>

<main class="popup">
  <header><TypewriterMark size={24} /><span class="wordmark">focus.</span></header>
  <h1>{#if site}<SiteMark id={site.id} /> {site.label}{:else}Browser access{/if}</h1>
  <p>{status}</p>
  {#if !site}<p>Needs access on supported sites. Choose exact addresses in browser setup.</p>
  {:else if isShortsHost}
    <p>{hideShorts ? 'Hide Shorts is on' : 'Hide Shorts is off'}{status === 'Disconnected' ? ' · last saved policy' : ''}.</p>
  {:else}<p>No content rules for this address.</p>{/if}
  {#if status === 'Connected'}<button type="button" onclick={openDesktop}>Open in focus.</button>{/if}
  <p><button type="button" onclick={setup}>Browser setup</button></p>
  {#if error}<p role="status">{error}</p>{/if}
</main>
