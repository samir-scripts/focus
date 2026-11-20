<script module lang="ts">
  declare const chrome: any;
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import TypewriterMark from '@focus/ui/TypewriterMark.svelte';
  import SiteMark from '@focus/ui/SiteMark.svelte';
  import { catalog } from './sites/catalog';
  import { missingOrigins, siteOrigins } from './permissions';
  import './ui.css';
  let browser = navigator.userAgent.includes('Firefox') ? 'firefox' : 'chromium';
  let label = '';
  let status = 'Not connected';
  let selected: string[] = [];
  let origins: string[] = [];
  let message = '';
  let pairing = false;
  let granting = false;
  let hasProfile = false;

  function refresh() {
    chrome.permissions.getAll((permissions: { origins?: string[] }) => { origins = permissions?.origins ?? []; });
    chrome.storage.local.get(['status', 'profile'], (stored: { status?: string; profile?: object }) => { status = stored.status ?? 'Not connected'; hasProfile = !!stored.profile; });
  }
  onMount(() => {
    refresh();
    chrome.storage.onChanged.addListener(refresh);
    chrome.permissions.onAdded.addListener(refresh);
    chrome.permissions.onRemoved.addListener(refresh);
    return () => { chrome.storage.onChanged.removeListener(refresh); chrome.permissions.onAdded.removeListener(refresh); chrome.permissions.onRemoved.removeListener(refresh); };
  });
  function connect() {
    if (!label.trim()) { message = 'Enter a profile label.'; return; }
    pairing = true; message = '';
    chrome.runtime.sendMessage({ type: 'pair', browser, label }, (result: { ok?: boolean; error?: string }) => {
      pairing = false;
      message = result?.ok ? 'Confirm this profile in focus.' : (result?.error || 'Could not connect to focus.');
      refresh();
    });
  }
  function grant() {
    const requested = [...new Set(selected.flatMap((id) => missingOrigins(siteOrigins(id), origins)))];
    if (!requested.length) return;
    granting = true; message = '';
    // This request must remain directly in the click handler, before any await.
    chrome.permissions.request({ origins: requested }, (granted: boolean) => {
      granting = false;
      message = granted ? 'Access granted.' : 'Access not granted';
      if (granted) selected = [];
      refresh();
    });
  }
</script>

<main>
  <header><TypewriterMark size={24} /><span class="wordmark">focus.</span></header>
  <h1>Browser setup</h1>
  <p>Connect this browser profile to focus. Pairing does not grant access to sites.</p>
  <p class="notice" role="status">{status}</p>
  {#if !hasProfile}
    <label for="setup-browser">Browser</label>
    <div class="field"><select id="setup-browser" bind:value={browser}><option value="chrome">Chrome</option><option value="chromium">Chromium</option><option value="brave">Brave</option><option value="firefox">Firefox</option><option value="zen">Zen</option></select></div>
    <label class="field"><span>Profile label</span><input type="text" maxlength="48" bind:value={label} /></label>
    <button type="button" onclick={connect} disabled={pairing}>Connect to focus.</button>
  {/if}
  <h2>Site access</h2>
  <p class="muted">Choose sites for this profile. Your browser will ask for the exact listed hostnames on both HTTP and HTTPS.</p>
  {#each catalog as site (site.id)}
    {@const missing = missingOrigins(siteOrigins(site.id), origins)}
    <div class="site">
      <div>
        <label><input type="checkbox" value={site.id} bind:group={selected} disabled={missing.length === 0} /> <SiteMark id={site.id} /> {site.label}</label>
        <ul class="hosts">
          {#each siteOrigins(site.id) as origin (origin)}
            <li>{origin} — {missing.includes(origin) ? 'Not granted' : 'Granted'}</li>
          {/each}
        </ul>
      </div>
      <small>{missing.length === 0 ? 'Access granted' : missing.length === siteOrigins(site.id).length ? 'No access' : 'Partial access'}</small>
    </div>
  {/each}
  <button type="button" onclick={grant} disabled={granting || selected.length === 0}>Grant access</button>
  {#if message}<p role="status" class="notice">{message}</p>{/if}
</main>
