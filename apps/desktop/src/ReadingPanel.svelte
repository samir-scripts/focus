<script lang="ts">
  import type { Preview, ReadingSettings } from './reading';

  let { settings, collapsed, error, setup, expand, load, open, article }: {
    settings?: ReadingSettings; collapsed: boolean; error: boolean;
    setup: (event: MouseEvent) => void; expand: () => void;
    load: () => Promise<Preview>; open: (external?: boolean) => Promise<void>;
    article: (url: string) => Promise<void>;
  } = $props();

  let preview = $state<Preview>();
  let actionError = $state('');
  let revision = $state(0);
  let request = 0;
  $effect(() => {
    void revision;
    const id = ++request;
    const enabled = settings?.enabled && settings.feeds.length > 0 && !collapsed;
    preview = undefined;
    if (enabled) void load().then(
      value => { if (request === id) preview = value; },
      () => { if (request === id) preview = { state: 'offline', items: [] }; },
    );
    return () => { request++; };
  });

  async function act(action: () => Promise<void>) {
    actionError = '';
    try { await action(); }
    catch { actionError = 'Could not open this destination. Try again.'; }
  }
</script>

<section aria-labelledby="reading-title">
  <h2 id="reading-title">Reading</h2>
  {#if error}
    <p role="status">Could not load Reading settings.</p>
  {:else if !settings}
    <p role="status">Loading Reading settings…</p>
  {:else if !settings.enabled}
    <p>Choose what you want to read. Reading is off by default.</p>
    <button type="button" onclick={setup}>Set up Reading</button>
  {:else}
    {#if settings.page}<p class="destination">Connected to {settings.page}</p>{/if}
    <div class="actions">
      <button type="button" onclick={() => act(open)}>Open Reading</button>
      {#if settings.page}<button type="button" onclick={() => act(() => open(true))}>Open in browser</button>{/if}
      {#if collapsed}<button type="button" onclick={expand}>Show headlines</button>{/if}
    </div>
    {#if !collapsed && settings.feeds.length}
      {#if !preview}<p role="status">Loading feeds…</p>
      {:else}
        {#if preview.state === 'empty'}<p role="status">No headlines yet.</p>{/if}
        {#if preview.state === 'partial'}<p role="status">Some feeds are unavailable.</p>{/if}
        {#if preview.state === 'offline'}<p role="status">Feeds are unavailable or you are offline.</p>{/if}
        {#if preview.items.length}
          <ul>
            {#each preview.items as item (item.url)}
              <li><button type="button" onclick={() => act(() => article(item.url))}>{item.title}</button><small>{item.source}</small></li>
            {/each}
          </ul>
        {/if}
        <button type="button" onclick={() => revision++}>Refresh headlines</button>
      {/if}
    {/if}
  {/if}
  {#if actionError}<p role="alert">{actionError}</p>{/if}
</section>

<style>
  section { background: var(--canvas); border-block-start: 1px solid var(--divider); padding: 10px 0; min-width: 0; }
  h2 { margin: 0; }
  p { margin: 6px 0; }
  .destination { overflow-wrap: anywhere; }
  ul { list-style: none; padding: 0; }
  li { border-block-start: 1px solid var(--divider); padding-block: 8px; overflow-wrap: anywhere; }
  small { display: block; margin-block-start: 4px; color: var(--muted); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  button { background: var(--surface); color: var(--ink); border: 1px solid var(--ink); border-radius: var(--radius-control); font: inherit; padding: 5px 9px; text-align: start; }
  li button { background: none; border: none; padding: 0; text-decoration: underline; }
  button:hover { background: var(--ink); color: var(--surface); }
</style>
