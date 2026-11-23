<script lang="ts">
  import { webUrl, type ReadingSettings } from './reading';

  let { settings, save }: { settings: ReadingSettings; save: (settings: ReadingSettings) => Promise<void> } = $props();
  let url = $state('');
  let page = $state('');
  let pending = $state(false);
  let error = $state('');
  let editUrl = $state<string>();
  let name = $state('');

  async function apply(next: ReadingSettings) {
    if (pending) return false;
    pending = true;
    error = '';
    try { await save(next); return true; }
    catch (err) { error = typeof err === 'string' ? err : 'Could not save Reading settings.'; return false; }
    finally { pending = false; }
  }

  async function add(event: SubmitEvent) {
    event.preventDefault();
    const valid = webUrl(url.trim());
    if (!valid) { error = 'Use an absolute RSS or Atom HTTP(S) URL.'; return; }
    if (await apply({ ...settings, feeds: [...settings.feeds, { url: valid, name: '' }] })) url = '';
  }

  async function connect(event: SubmitEvent) {
    event.preventDefault();
    const valid = webUrl(page.trim());
    if (!valid) { error = 'Use an absolute HTTP(S) Glance page URL.'; return; }
    if (await apply({ ...settings, page: valid })) page = '';
  }
</script>

<p>Reading is off until you enable it. Feed requests go directly to the sources you add.</p>
<label><input type="checkbox" checked={settings.enabled} disabled={pending || (!settings.enabled && !settings.page && !settings.feeds.length)}
  onchange={(event) => apply({ ...settings, enabled: event.currentTarget.checked }).then(saved => { if (!saved && event.target instanceof HTMLInputElement) event.target.checked = settings.enabled; })} /> Enable Reading</label>

<section aria-labelledby="reading-feeds">
  <h2 id="reading-feeds">Subscriptions</h2>
  {#if settings.page}<p>Only these feeds appear on Home. Your Glance page manages its own feeds.</p>{/if}
  <form onsubmit={add}>
    <label>RSS or Atom URL <input type="url" bind:value={url} required autocomplete="off" /></label>
    <button type="submit" disabled={pending}>Add feed</button>
  </form>
  <ul>
    {#each settings.feeds as feed (feed.url)}
      <li>
        <div><strong>{feed.name || new URL(feed.url).hostname}</strong><br /><small>{feed.url}</small></div>
        {#if editUrl === feed.url}
          <form onsubmit={async (event) => {
            event.preventDefault();
            if (await apply({ ...settings, feeds: settings.feeds.map(item => item.url === feed.url ? { ...item, name } : item) })) editUrl = undefined;
          }}>
            <label>Subscription name <input bind:value={name} maxlength="100" /></label>
            <button type="submit" disabled={pending}>Save name</button>
            <button type="button" onclick={() => editUrl = undefined}>Cancel</button>
          </form>
        {:else}
          <button type="button" onclick={() => { editUrl = feed.url; name = feed.name; }}>Rename</button>
          <button type="button" disabled={pending} onclick={() => {
            const feeds = settings.feeds.filter(item => item.url !== feed.url);
            void apply({ ...settings, feeds, enabled: settings.enabled && (feeds.length > 0 || settings.page !== null) });
          }}>Remove</button>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<section aria-labelledby="reading-page">
  <h2 id="reading-page">Existing Glance page</h2>
  {#if settings.page}
    <p>Connected to {settings.page}</p>
    <button type="button" disabled={pending} onclick={() => apply({ ...settings, page: null, enabled: settings.enabled && settings.feeds.length > 0 })}>Disconnect page</button>
  {/if}
  <form onsubmit={connect}>
    <label>Glance page URL <input type="url" bind:value={page} required autocomplete="off" /></label>
    <button type="submit" disabled={pending}>{settings.page ? 'Change page' : 'Connect page'}</button>
  </form>
</section>
{#if error}<p role="alert">{error}</p>{/if}

<style>
  section { border-top: 1px solid var(--divider); margin-top: 16px; padding-block: 12px; }
  h2 { margin: 0 0 8px; }
  form, li { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; margin-block: 8px; }
  form label, li div { min-width: 0; overflow-wrap: anywhere; }
  input:not([type='checkbox']) { display: block; width: min(23rem, 75vw); padding: 5px; border: 1px solid var(--edge); background: var(--surface); color: var(--ink); font: inherit; }
  button { border: 1px solid var(--ink); border-radius: var(--radius-control); background: var(--surface); color: var(--ink); padding: 5px 9px; font: inherit; }
  button:not(:disabled):hover { background: var(--ink); color: var(--surface); }
  ul { padding: 0; }
</style>
