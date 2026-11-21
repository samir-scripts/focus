<script lang="ts">
  import { onMount, tick } from 'svelte';
  import SiteMark from '@focus/ui/SiteMark.svelte';
  import TypewriterMark from '@focus/ui/TypewriterMark.svelte';
  import { isTauri } from '@tauri-apps/api/core';
  import { palettes, readAppearance, saveAppearance, type Mode, type Palette, type PaletteMode } from './appearance';
  import PaperStock from './PaperStock.svelte';
  import PrintImpression from './PrintImpression.svelte';
  import { sites as curatedSites } from './sites';
  import BrowserSettings from './BrowserSettings.svelte';
  import PairBrowser from './PairBrowser.svelte';
  import { browsers, nativeBrowserBridge, siteAccess, type BrowserBridge, type BrowserState } from './browser';
  import SiteEntryEditor from './SiteEntryEditor.svelte';
  import { normalizeHost } from '../../extension/src/protocol';

  let { browserBridge = isTauri() ? nativeBrowserBridge : null }: { browserBridge?: BrowserBridge | null } = $props();

  const pages = ['Sites', 'Statistics', 'Settings'] as const;
  const nativeMacToolbar = isTauri() && navigator.platform.startsWith('Mac');
  const modes = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ] as const;
  type Page = (typeof pages)[number];
  const paletteModes = [
    { value: 'light', label: 'Light palette' },
    { value: 'dark', label: 'Dark palette' },
  ] as const;
  const paletteIds = Object.keys(palettes) as Palette[];

  let page = $state<Page>('Sites');
  let browserState = $state.raw<BrowserState>();
  let siteId = $state(curatedSites[0].id);
  let sites = $derived([...curatedSites, ...(browserState?.sites ?? [])
    .filter((entry) => entry.id.startsWith('custom:'))
    .map((entry) => ({ id: entry.id, label: entry.label, hosts: entry.hosts, hostname: entry.hosts[0], rules: [] }))]);
  let site = $derived(sites.find((entry) => entry.id === siteId) ?? curatedSites[0]);
  let currentPolicy = $derived(browserState?.sites.find((entry) => entry.id === siteId));
  let adding = $state(false);
  let hostInput = $state('');
  let customHost = $derived(normalizeHost(hostInput.trim().match(/^https?:\/\/([^/?#\\]+)/i)?.[1] ?? hostInput));
  let revealPage = $state(false);
  let revealSite = $state(false);
  let appearance = $state(readAppearance());
  let windowHidden = $state(document.hidden);
  let openPalette = $state<PaletteMode | null>(null);
  let heading: HTMLHeadingElement | undefined = $state();
  let browserError = $state('');
  let actionError = $state('');
  let pairError = $state('');
  let editingRule = $state(false);
  let decidingPair = $state(false);
  let pendingPair = $derived(browserState?.pending[0]);
  let pull: Promise<void> | undefined;

  function refresh() {
    if (!browserBridge) return;
    if (pull) return pull;
    pull = browserBridge.state().then(async (next) => {
      browserState = next;
      browserError = '';
      if (next.open) {
        const target = curatedSites.some((entry) => entry.id === next.open?.siteId) || next.sites.some((entry) => entry.id === next.open?.siteId);
        if (target && next.open.siteId) siteId = next.open.siteId;
        revealPage = false;
        revealSite = false;
        page = target ? 'Sites' : 'Settings';
        await tick();
        heading?.focus();
      }
    }).catch(() => {
      browserError = 'Database unavailable';
      browserState = undefined;
    }).finally(() => { pull = undefined; });
    return pull;
  }

  onMount(() => {
    if (!browserBridge) return;
    void refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  });

  async function savePolicy(change: (bridge: BrowserBridge, revision: number) => Promise<void>) {
    if (!browserBridge || !browserState || editingRule) return;
    editingRule = true;
    actionError = '';
    try {
      await change(browserBridge, browserState.revision);
    } catch (error) {
      actionError = error === 'stale_revision' ? 'Rules changed. Review the current setting and try again.' : 'Could not save rule.';
    } finally {
      await pull;
      await refresh();
      editingRule = false;
    }
  }

  async function addSite(event: SubmitEvent) {
    event.preventDefault();
    if (!browserBridge || !customHost || editingRule) return;
    editingRule = true;
    actionError = '';
    try {
      const id = await browserBridge.designateSite(customHost);
      await pull;
      await refresh();
      siteId = id;
      adding = false;
      hostInput = '';
      await tick();
      heading?.focus();
    } catch {
      actionError = 'Could not add this hostname.';
    } finally {
      editingRule = false;
    }
  }

  async function decidePair(id: string, approved: boolean, label: string | null) {
    if (!browserBridge || decidingPair) return;
    decidingPair = true;
    pairError = '';
    try {
      await browserBridge.decidePair(id, approved, label);
    } catch {
      pairError = 'Could not complete this request. Check the label or start again in the browser.';
    } finally {
      await pull;
      await refresh();
      decidingPair = false;
    }
  }

  async function revoke(id: string) {
    if (!browserBridge) return;
    actionError = '';
    try {
      await browserBridge.revoke(id);
    } catch {
      actionError = 'Could not disconnect profile.';
    }
    await pull;
    await refresh();
  }

  $effect(() => {
    const root = document.documentElement;
    root.dataset.theme = appearance.mode;
    root.dataset.paletteLight = appearance.light;
    root.dataset.paletteDark = appearance.dark;
  });

  function setMode(mode: Mode) {
    appearance.mode = mode;
    saveAppearance('mode', mode);
  }

  function setPalette(mode: PaletteMode, palette: Palette) {
    appearance[mode] = palette;
    saveAppearance(mode, palette);
  }

  function setPrintIllustrations(enabled: boolean) {
    appearance.printIllustrations = enabled;
    saveAppearance('printIllustrations', enabled);
  }

  function setTonerPaused(paused: boolean) {
    appearance.tonerPaused = paused;
    saveAppearance('tonerPaused', paused);
  }

  async function openPage(next: Page, event: MouseEvent) {
    if (next === page) return;
    revealPage = event.detail > 0;
    revealSite = false;
    openPalette = null;
    page = next;
    await tick();
    heading?.focus();
  }
</script>

<svelte:document onvisibilitychange={() => windowHidden = document.hidden} />

{#if pendingPair}
  {#key pendingPair.id}
    <PairBrowser request={pendingPair} error={pairError} busy={decidingPair} decide={decidePair} />
  {/key}
{/if}

<div class="shell" class:toner-paused={appearance.tonerPaused || windowHidden}>
  <header class="toolbar" class:native-mac={nativeMacToolbar}>
    <PaperStock />
    <div class="brand"><TypewriterMark size={22} /> <span class="toner-type">focus.</span></div>
    <nav aria-label="Main" class:move-indicator={revealPage} style:--active-index={pages.indexOf(page)}>
      {#each pages as entry}
        <button type="button" aria-label={entry} title={entry} aria-current={page === entry ? 'page' : undefined}
          onclick={(event) => openPage(entry, event)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            {#if entry === 'Sites'}
              <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
              <path d="M4 9.5h16M9.5 10v9" />
            {:else if entry === 'Statistics'}
              <path d="M5 19v-5m7 5V9m7 10V4" stroke-width="2.5" />
            {:else}
              <path d="M10 3.5h4l.6 2.4 1.7 1 2.4-.7 2 3.5-1.8 1.7v2l1.8 1.7-2 3.5-2.4-.7-1.7 1-.6 2.4h-4l-.6-2.4-1.7-1-2.4.7-2-3.5 1.8-1.7v-2L3.3 9.7l2-3.5 2.4.7 1.7-1z" />
              <circle cx="12" cy="12.4" r="2.7" />
            {/if}
          </svg>
        </button>
      {/each}
    </nav>
  </header>

  <div class="workspace" class:with-library={page === 'Sites'}>
    {#if page === 'Sites'}
      <section class="library" aria-labelledby="library-heading">
        <PaperStock particles />
        <h2 id="library-heading">Site Library</h2>
        <ul>
          {#each sites as entry (entry.id)}
            <li>
              <button type="button" aria-label={entry.label} aria-pressed={siteId === entry.id} onclick={(event) => {
                if (siteId === entry.id) return;
                revealSite = event.detail > 0;
                siteId = entry.id;
              }}>
                <span class="site-mark"><SiteMark id={entry.id} size={20} /></span>
                <span class="library-label">{entry.label}<small>{entry.hostname}</small></span>
              </button>
            </li>
          {/each}
        </ul>
        {#if browserState}
          {#if adding}
            <form class="designate" onsubmit={addSite}>
              <label for="custom-host">Hostname or URL</label>
              <input id="custom-host" type="text" placeholder="example.org" bind:value={hostInput} maxlength="2048" />
              {#if customHost}<p>Exact hostname: <strong>{customHost}</strong></p>
              {:else if hostInput}<p>Enter an exact hostname, without credentials or a port.</p>{/if}
              <div><button type="submit" class="outline" disabled={!customHost || editingRule}>Add</button>
                <button type="button" class="outline" onclick={() => { adding = false; hostInput = ''; }}>Cancel</button></div>
            </form>
          {:else}
            <button type="button" class="designate-trigger" onclick={() => { adding = true; }}>Add site</button>
          {/if}
        {/if}
      </section>
    {/if}

    <main>
      <PaperStock particles />
      {#if browserError || actionError}
        <p class="browser-error" role="alert">{browserError || actionError}</p>
      {/if}
      {#key page}
        <div class="page" class:reveal={revealPage && page === 'Settings'}>
          {#if page === 'Sites'}
            <header class="page-heading site-title-row">
              {#key site.id}
                <div class="site-heading" class:reveal={revealPage || revealSite}>
                  <span class="site-mark"><SiteMark id={site.id} size={27} /></span>
                  <h1 class="toner-type" tabindex="-1" bind:this={heading}>{site.label}</h1>
                  <p class="host">{site.hostname}</p>
                </div>
              {/key}
              {#if appearance.printIllustrations}
                <div class="impression margin"><PrintImpression variant="margin" /></div>
              {/if}
            </header>
            <section class="details access-row" class:reveal={revealPage}>
              <div>
                <h2>Browser access</h2>
                {#if browserState?.profiles.length}
                  {#each browserState.profiles as profile (profile.id)}
                    {@const access = siteAccess(profile, site, browserState.revision, currentPolicy?.entry)}
                    <p><strong>{profile.label}</strong> · {browsers[profile.browser]} · {access.status}</p>
                    {#if access.origins.length}<p class="origins">Granted: {access.origins.join(', ')}</p>{/if}
                    {#if access.missing.length}<p class="origins">Missing: {access.missing.join(', ')}</p>{/if}
                  {/each}
                {:else if !browserBridge || browserState}
                  <p class="connection"><span aria-hidden="true"></span>No browsers connected</p>
                {/if}
              </div>
              <button type="button" class="outline" onclick={(event) => openPage('Settings', event)}>Browser settings</button>
            </section>
            {#if currentPolicy && browserState?.entryAvailable}
              {@const policy = currentPolicy}
              <SiteEntryEditor entry={policy.entry} busy={editingRule} save={(entry) => savePolicy((bridge, revision) => bridge.setEntry(revision, policy.id, entry))} />
            {/if}
            {#if browserState && (currentPolicy || site.id === 'youtube')}
              <section class="details rule-row">
                <h2>Content rules</h2>
                {#if currentPolicy}
                  {@const policy = currentPolicy}
                  <label class="preference">
                    <input type="checkbox" checked={policy.grayscale} disabled={editingRule} onchange={(event) => {
                      const enabled = event.currentTarget.checked;
                      event.currentTarget.checked = policy.grayscale;
                      void savePolicy((bridge, revision) => bridge.setGrayscale(revision, policy.id, enabled));
                    }} />
                    <span class="choice-mark" aria-hidden="true"></span>
                    <span>Grayscale</span>
                  </label>
                {/if}
                {#if site.id === 'youtube'}
                  <label class="preference">
                    <input type="checkbox" checked={browserState.hideShorts} disabled={editingRule} onchange={(event) => {
                      const enabled = event.currentTarget.checked;
                      event.currentTarget.checked = browserState?.hideShorts ?? false;
                      void savePolicy((bridge, revision) => bridge.setHideShorts(revision, enabled));
                    }} />
                    <span class="choice-mark" aria-hidden="true"></span>
                    <span>{site.rules[0].label}</span>
                  </label>
                {/if}
                <p>Rules apply only in browser profiles with access to the exact address.</p>
              </section>
            {/if}
          {:else if page === 'Statistics'}
            <header class="page-heading" class:reveal={revealPage}>
              <h1 tabindex="-1" bind:this={heading}>Statistics</h1>
            </header>
            <section class="details statistics-empty">
              <h2 class:reveal={revealPage}>No time recorded</h2>
              {#if appearance.printIllustrations}
                <div class="impression sheet"><PrintImpression variant="sheet" /></div>
              {/if}
            </section>
          {:else}
            <header class="page-heading"><h1 tabindex="-1" bind:this={heading}>Settings</h1></header>
            <fieldset>
              <legend>Appearance</legend>
              <div class="appearances">
                {#each modes as option}
                  <label>
                    <input type="radio" name="appearance" value={option.value} checked={appearance.mode === option.value}
                      onchange={() => setMode(option.value)} />
                    <span>{option.label}</span>
                  </label>
                {/each}
              </div>
              {#each paletteModes as { value, label }}
                <div class="palette-picker">
                  <button type="button" class="palette-trigger" aria-expanded={openPalette === value}
                    aria-controls={`${value}-palettes`} onclick={() => openPalette = openPalette === value ? null : value}>
                    <span>{label}</span>
                    <span class="palette-value">
                      <span class="swatch" data-swatch={`${appearance[value]}-${value}`} aria-hidden="true"></span>
                      {palettes[appearance[value]]}
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"
                        aria-hidden="true" focusable="false"><path d="m2.5 4.5 3.5 3.5 3.5-3.5" /></svg>
                    </span>
                  </button>
                  <fieldset class="palette-options" id={`${value}-palettes`} aria-label={label} hidden={openPalette !== value}>
                    {#each paletteIds as id}
                      <label class="preference">
                        <input type="radio" name={`${value}-palette`} value={id} checked={appearance[value] === id}
                          onchange={() => setPalette(value, id)} />
                        <span class="choice-mark" aria-hidden="true"></span>
                        <span class="swatch" data-swatch={`${id}-${value}`} aria-hidden="true"></span>
                        <span>{palettes[id]}</span>
                      </label>
                    {/each}
                  </fieldset>
                </div>
              {/each}
              <label class="preference effect-preference">
                <input type="checkbox" checked={appearance.printIllustrations}
                  onchange={(event) => setPrintIllustrations(event.currentTarget.checked)} />
                <span class="choice-mark" aria-hidden="true"></span>
                <span>Print illustrations</span>
              </label>
              <label class="preference effect-preference">
                <input type="checkbox" checked={appearance.tonerPaused}
                  onchange={(event) => setTonerPaused(event.currentTarget.checked)} />
                <span class="choice-mark" aria-hidden="true"></span>
                <span>Pause toner particles</span>
              </label>
            </fieldset>
          {/if}
        </div>
      {/key}
      <div class="page" class:reveal={revealPage && page === 'Settings'} hidden={page !== 'Settings'}>
        <BrowserSettings profiles={browserState?.profiles ?? []} bridge={browserBridge} disconnect={revoke} active={page === 'Settings'} />
      </div>
    </main>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    background: var(--canvas);
    color: var(--ink);
    font: 15px/1.5 var(--font-ui);
  }

  @media (forced-colors: none) {
    :global(html) { scrollbar-color: var(--ink) var(--canvas); }
    .toolbar.native-mac + .workspace { scrollbar-color: var(--ink) var(--canvas); }
  }
  @supports not (scrollbar-color: auto) {
    @media (forced-colors: none) {
      :global(html::-webkit-scrollbar), .toolbar.native-mac + .workspace::-webkit-scrollbar { background: var(--canvas); }
      :global(html::-webkit-scrollbar-thumb), .toolbar.native-mac + .workspace::-webkit-scrollbar-thumb { background: var(--ink); }
      :global(html::-webkit-scrollbar-track), .toolbar.native-mac + .workspace::-webkit-scrollbar-track { background: var(--canvas); }
    }
  }

  .shell { display: flex; flex-direction: column; min-height: 100dvh; }
  .shell:has(> .toolbar.native-mac) { height: 100dvh; }
  .toner-paused { --toner-play-state: paused; }

  .toolbar, .library, main { isolation: isolate; position: relative; }
  .toolbar, .library { --grain-opacity: var(--grain-rail); }

  .toolbar {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    min-height: 46px;
    background: var(--canvas);
    border-bottom: 1px solid var(--divider);
  }

  /* AppKit scales the 46px toolbar and 124px navigation hit region with page zoom. */
  .toolbar.native-mac { flex: none; box-sizing: border-box; height: 46px; padding-inline-start: 72px; flex-wrap: nowrap; user-select: none; }
  .toolbar.native-mac nav { flex: none; flex-wrap: nowrap; }
  .toolbar.native-mac .brand { padding-inline: 3px 12px; }

  .workspace { flex: 1; display: flex; flex-direction: column; }
  /* Keep the scrollbar below the toolbar so AppKit and the navigation share the same right edge. */
  .toolbar.native-mac + .workspace { overflow: auto; }
  .with-library { display: grid; grid-template-columns: 196px minmax(0, 1fr); }

  .brand {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 16px;
    font: 700 24px/1 var(--font-wordmark);
  }

  nav {
    --nav-target: 36px;
    --nav-gap: 2px;
    --nav-start: 4px;
    --indicator-width: 18px;
    position: relative;
    display: flex;
    gap: var(--nav-gap);
    align-items: center;
    padding-inline: var(--nav-start) 8px;
  }
  ul { display: grid; margin: 0; padding: 0; list-style: none; }
  li { min-width: 0; }

  button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    text-align: start;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  nav button {
    position: relative;
    justify-content: center;
    width: var(--nav-target);
    height: var(--nav-target);
    padding: 0;
    border-radius: var(--radius-control);
    color: var(--muted);
  }
  nav button[aria-current] { color: var(--ink); background: var(--selected); }
  nav button:focus-visible { outline-offset: -2px; }
  nav::after {
    content: '';
    position: absolute;
    inset: auto auto 0 calc(var(--nav-start) + (var(--nav-target) - var(--indicator-width)) / 2);
    width: var(--indicator-width);
    height: 2px;
    background: var(--accent);
    pointer-events: none;
    transform: translateX(calc(var(--active-index) * (var(--nav-target) + var(--nav-gap))));
  }
  li button { width: 100%; min-height: 42px; gap: 12px; }
  li button:focus-visible { outline-offset: -4px; }
  .site-mark { display: grid; place-items: center; flex: none; color: var(--muted); }
  [aria-pressed='true'] .site-mark, .site-heading .site-mark { color: var(--ink); }
  li button:is(:hover, :active) .site-mark { color: var(--on-accent); }
  li button[aria-pressed='true'] {
    background: var(--selected);
    box-shadow: inset 2px 0 var(--accent);
    font-weight: 700;
  }

  button:is(:hover, :active), nav button[aria-current]:is(:hover, :active),
  li button[aria-pressed='true']:is(:hover, :active), .appearances label:is(:hover, :active) {
    background: var(--accent);
    color: var(--on-accent);
  }
  nav button:is(:hover, :active):focus-visible, li button:is(:hover, :active):focus-visible {
    outline-color: var(--on-accent);
  }

  .library { padding: 16px 0; border-inline-end: 1px solid var(--divider); background: var(--rail); --toner-origin: -117px -48px; }
  .library h2 { margin: 0 14px 4px; font-size: 15px; color: var(--ink); }
  .library-label { display: grid; min-width: 0; overflow-wrap: anywhere; }
  .library-label small { font-size: 12px; font-weight: 400; }
  .designate, .designate-trigger { margin: 8px 14px; }
  .designate-trigger { padding-inline: 0; }
  .designate input { display: block; width: 100%; min-width: 0; margin-top: 6px; padding: 4px; border: 1px solid var(--edge); border-radius: var(--radius-control); color: var(--ink); background: var(--surface); font: inherit; }
  .designate div { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }

  main { flex: 1; padding: 24px; min-width: 0; background: var(--surface); }
  .page { max-width: 760px; }

  .page-heading { padding-bottom: 16px; border-bottom: 1px solid var(--divider); }
  @media (forced-colors: none) {
    .page-heading, .rule-row, .palette-picker, .effect-preference { position: relative; border-color: transparent; }
    .page-heading::after, .rule-row::before, .palette-picker::after, .effect-preference::after {
      content: ''; position: absolute; inset-inline: 0; height: 3px; pointer-events: none;
      background: var(--ink);
      -webkit-mask: url('./assets/ink-rule.svg') repeat-x left center / 223px 3px;
      mask: url('./assets/ink-rule.svg') repeat-x left center / 223px 3px;
    }
    .page-heading::after, .palette-picker::after, .effect-preference::after { bottom: -1px; }
    .rule-row::before { top: -1px; }
    .palette-picker:nth-of-type(even)::after, .effect-preference:nth-of-type(even)::after { mask-position: -67px center; -webkit-mask-position: -67px center; }
  }
  h1, h2, p { margin: 0; }
  h1 { font-size: 28px; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
  .site-heading h1 { font: 800 50px/.98 var(--font-display); --toner-sweep-width: 72px; }
  h1:focus { outline: none; }
  .site-title-row, .statistics-empty { display: flex; justify-content: space-between; gap: 16px; }
  .site-title-row { align-items: center; padding-bottom: 12px; }
  .site-heading { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 12px; min-width: 0; }
  .impression { pointer-events: none; }
  .margin { flex: none; }
  .sheet { width: 192px; max-width: 100%; }
  h2, legend { font-size: 15px; font-weight: 700; }
  p { margin-top: 4px; font-size: 15px; color: var(--muted); overflow-wrap: anywhere; }
  .host { grid-column: 2; margin-top: 2px; font-family: var(--font-code); font-size: 14px; letter-spacing: .03em; }
  .details, fieldset { margin-top: 16px; }
  .access-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .connection { display: flex; align-items: center; gap: 6px; }
  .origins { font-family: var(--font-code); font-size: 13px; }
  .browser-error { position: relative; color: var(--error); }
  .rule-row { border-block-start: 1px solid var(--divider); padding-block-start: 12px; }
  .connection span { width: 5px; height: 5px; border-radius: 50%; background: var(--muted); }
  .outline { min-height: 36px; border: 1px solid var(--edge); border-radius: var(--radius-control); padding-inline: 10px; }
  .outline:not(:hover, :active) { background: var(--surface); }
  fieldset { border: 0; padding: 0; min-width: 0; }
  legend { padding: 0; margin-bottom: 8px; }
  .appearances { position: relative; display: flex; width: fit-content; max-width: 100%; }
  .appearances label { position: relative; display: flex; align-items: center; min-height: 36px; padding: 4px 16px; border: 1px solid var(--edge); font-size: 14px; cursor: pointer; }
  @media (forced-colors: none) {
    .appearances::before, .outline::before {
      content: ''; position: absolute; inset: -2px; pointer-events: none; border: 2px solid var(--ink);
      border-radius: inherit;
      -webkit-mask: url('./assets/ink-rule.svg') repeat left center / 223px 2px;
      mask: url('./assets/ink-rule.svg') repeat left center / 223px 2px;
    }
    .appearances::before { border-radius: var(--radius-control); }
    .outline { position: relative; }
  }
  .appearances label:first-child { border-radius: var(--radius-control) 0 0 var(--radius-control); }
  .appearances label:last-child { border-radius: 0 var(--radius-control) var(--radius-control) 0; }
  .appearances label + label { border-inline-start: 0; }
  .appearances label:has(:checked):not(:hover, :active) { background: var(--selected); }
  .appearances label:focus-within { z-index: 1; outline: 2px solid var(--accent); outline-offset: 3px; }
  .appearances input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; width: 100%; height: 100%; }

  .palette-picker, .effect-preference { border-block-end: 1px solid var(--divider); }
  .appearances + .palette-picker { margin-block-start: 12px; }
  .palette-trigger {
    width: 100%;
    min-height: 44px;
    justify-content: space-between;
    flex-wrap: wrap;
    padding: 6px 8px;
    font-size: 14px;
  }
  .palette-trigger:focus-visible { outline-offset: -2px; }
  .palette-trigger:is(:hover, :active):focus-visible { outline-color: var(--on-accent); }
  .palette-trigger[aria-expanded='true'] svg { transform: rotate(180deg); }
  .palette-value { display: inline-flex; align-items: center; gap: 8px; }
  .swatch {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 22px;
    height: 14px;
    border: 1px solid var(--swatch-ink);
    background: var(--swatch-paper);
  }
  .swatch::after { content: ''; width: 10px; height: 2px; background: var(--swatch-ink); }
  .palette-options { margin: 0; padding-inline-start: 8px; }
  .preference {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding-inline: 8px;
    font-size: 14px;
    cursor: pointer;
  }
  .palette-options .preference:has(:checked) { background: var(--selected); }
  .preference:hover { text-decoration: underline; text-underline-offset: 3px; }
  .preference input { flex: none; margin: 0; accent-color: var(--accent); cursor: pointer; }
  .choice-mark { display: none; }
  @media (forced-colors: none) {
    .preference { position: relative; }
    .preference input { position: absolute; inline-size: 16px; block-size: 16px; opacity: 0; }
    .choice-mark {
      display: grid; place-items: center; flex: none; box-sizing: border-box;
      inline-size: 16px; block-size: 16px; border: 1px solid var(--ink);
      background: var(--surface); pointer-events: none;
    }
    .preference input[type='radio'] + .choice-mark { border-radius: 50%; }
    .preference input:checked + .choice-mark { background: var(--ink); }
    .preference input:checked + .choice-mark::after { content: ''; display: block; background: var(--surface); }
    .preference input[type='checkbox']:checked + .choice-mark::after {
      inline-size: 10px; block-size: 9px; clip-path: polygon(0 45%, 18% 27%, 39% 51%, 81% 4%, 100% 22%, 39% 92%);
    }
    .preference input[type='radio']:checked + .choice-mark::after { inline-size: 6px; block-size: 6px; border-radius: 50%; }
    .preference input:focus-visible + .choice-mark { outline: 2px solid var(--accent); outline-offset: 3px; }
    .preference input:disabled + .choice-mark { opacity: .55; }
    .preference:has(input:disabled) { cursor: default; }
  }

  @media (max-width: 635px) {
    .toolbar { display: flex; flex-wrap: wrap; }
    .brand { min-height: 44px; }
    nav { min-height: 44px; }
    .with-library { display: flex; flex-direction: column; }
    .library { padding: 8px 12px; border-inline-end: 0; border-bottom: 1px solid var(--divider); }
    ul { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 4px; }
    main { padding: 16px; }
    .site-heading h1 { font-size: 42px; }
    li button { gap: 8px; padding-inline: 8px; }
    .impression.margin { display: none; }
    .statistics-empty { flex-direction: column; }
  }

  @media (max-width: 340px) {
    ul { grid-template-columns: minmax(0, 1fr); }
    .appearances label { padding-inline: 10px; }
  }

  @media (forced-colors: active) {
    .impression { display: none; }
  }

  @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) and (forced-colors: none) {
    @supports (background-clip: text) or (-webkit-background-clip: text) {
      .toner-type:hover {
        --sweep-width: var(--toner-sweep-width, 36px);
        color: transparent;
        background-color: var(--ink);
        background-image: url('./assets/toner-sweep.svg');
        background-repeat: no-repeat;
        background-size: var(--sweep-width) 100%;
        background-position: left calc(-1 * var(--sweep-width)) center;
        -webkit-background-clip: text;
        background-clip: text;
        animation: sweep-toner var(--motion-toner-sweep) steps(15, end);
      }
      .toner-type::selection { background: var(--accent); color: var(--on-accent); }
      @keyframes sweep-toner {
        to { background-position: right calc(-1 * var(--sweep-width)) center; }
      }
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    nav.move-indicator::after { transition: transform var(--motion-interaction) var(--ease); }
    .reveal {
      transform-origin: top left;
      animation: settle var(--motion-view) var(--ease);
    }
    @keyframes settle {
      from { opacity: .65; transform: scale(.98); }
      to { opacity: 1; transform: scale(1); }
    }
    button, .appearances label {
      --press-duration: var(--motion-interaction);
      transition:
        background-color var(--motion-hover) ease-in-out,
        color var(--motion-hover) ease-in-out,
        transform var(--press-duration) var(--ease);
    }
    li .site-mark { transition: color var(--motion-hover) ease-in-out; }
    button:active, .appearances label:active {
      --press-duration: var(--motion-press);
      transform: translateY(1px);
    }
  }
</style>
