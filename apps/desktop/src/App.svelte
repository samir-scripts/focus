<script lang="ts">
  import { onMount, tick } from 'svelte';
  import SiteMark from '@focus/ui/SiteMark.svelte';
  import TypewriterMark from '@focus/ui/TypewriterMark.svelte';
  import { invoke, isTauri } from '@tauri-apps/api/core';
  import { palettes, readAppearance, saveAppearance, type Mode, type Palette, type PaletteMode } from './appearance';
  import PaperStock from './PaperStock.svelte';
  import PrintImpression from './PrintImpression.svelte';
  import { sites as curatedSites } from './sites';
  import BrowserSettings from './BrowserSettings.svelte';
  import SettingsPrint from './SettingsPrint.svelte';
  import PairBrowser from './PairBrowser.svelte';
  import { browsers, nativeBrowserBridge, siteAccess, type BrowserBridge, type BrowserState } from './browser';
  import SiteEntryEditor from './SiteEntryEditor.svelte';
  import { normalizeHost } from '../../extension/src/protocol';
  import { graceMessage, startGraceSession, type GraceOutcome } from './grace';
  import graceMark from './assets/grace-mark.svg';
  import HomeTypewriter from './typewriter/HomeTypewriter.svelte';
  import HomeSchedules from './HomeSchedules.svelte';
  import typewriterStill from './typewriter/assets/rest.png';
  import ReadingPanel from './ReadingPanel.svelte';
  import ReadingSetup from './ReadingSetup.svelte';
  import { reading, type ReadingSettings } from './reading';

  let {
    browserBridge = isTauri() ? nativeBrowserBridge : null,
    startGrace = isTauri() ? startGraceSession : null,
    sessionsWindow = false,
    openSessions = isTauri() ? () => invoke<void>('open_sessions') : undefined,
    readingBridge = isTauri() ? reading : undefined,
  }: {
    browserBridge?: BrowserBridge | null;
    startGrace?: (() => Promise<GraceOutcome>) | null;
    sessionsWindow?: boolean;
    openSessions?: () => Promise<void>;
    readingBridge?: typeof reading;
  } = $props();

  const pages = ['Sites', 'Statistics', 'Settings'] as const;
  const nativeMacToolbar = isTauri() && navigator.platform.startsWith('Mac');
  const modes = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ] as const;
  type Page = 'Home' | (typeof pages)[number];
  const paletteModes = [
    { value: 'light', label: 'Light palette' },
    { value: 'dark', label: 'Dark palette' },
  ] as const;
  const paletteIds = Object.keys(palettes) as Palette[];

  const categories = {
    appearance: { label: 'Appearance', icon: 'M3 3h18v13H3zM8 21h8m-4-5v5' },
    accessibility: { label: 'Accessibility', icon: 'M10 3h4v4h-4zM4 9h16m-8 0v6m0-2-5 8m5-8 5 8' },
    browser: { label: 'Browser setup', icon: 'M3 4h18v16H3zM3 9h18M6 6.5h1m2 0h1' },
    reading: { label: 'Reading', icon: 'M3 5h7l2 2 2-2h7v14h-7l-2 2-2-2H3zM12 7v14' },
  };
  type Category = keyof typeof categories;
  function settingsRoute() {
    const hash = location.hash;
    if (hash === '#settings') return null;
    const key = hash.startsWith('#settings/') ? hash.slice(10) : '';
    return Object.hasOwn(categories, key) && (key !== 'reading' || readingBridge) ? key as Category : undefined;
  }
  let category = $state<Category | null>(settingsRoute() ?? null);
  let page = $state<Page>(settingsRoute() === undefined ? 'Home' : 'Settings');
  let launchPending = $state(false);
  let launchOutcome = $state<GraceOutcome>();
  let sessionsError = $state(false);
  let browserState = $state.raw<BrowserState>();
  let siteId = $state(curatedSites[0].id);
  let libraryList: HTMLUListElement | undefined = $state();
  let sites = $derived([...curatedSites, ...(browserState?.sites ?? [])
    .filter((entry) => entry.id.startsWith('custom:'))
    .map((entry) => ({ id: entry.id, label: entry.label, hosts: entry.hosts, hostname: entry.hosts[0], rules: [] }))]);
  let site = $derived(sites.find((entry) => entry.id === siteId) ?? curatedSites[0]);
  let currentPolicy = $derived(browserState?.sites.find((entry) => entry.id === siteId));
  let adding = $state(false);
  let hostInput = $state('');
  let hostField: HTMLInputElement | undefined = $state();
  let addTrigger: HTMLButtonElement | undefined = $state();
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
  let accessibilityDirty = $state(false);
  let holdSeconds = $state<number | undefined>(15);
  let twoStepConfirmation = $state(false);
  let accessibilityRevision = 0;
  let decidingPair = $state(false);
  let pendingPair = $derived(browserState?.pending[0]);
  let pull: Promise<void> | undefined;

  function refresh() {
    if (!browserBridge) return;
    if (pull) return pull;
    pull = browserBridge.state().then(async (next) => {
      browserState = next;
      if (!accessibilityDirty && next.accessibility) {
        holdSeconds = next.accessibility.holdSeconds;
        twoStepConfirmation = next.accessibility.twoStepConfirmation;
        accessibilityRevision = next.revision;
      }
      browserError = '';
      if (next.open) {
        const target = curatedSites.some((entry) => entry.id === next.open?.siteId) || next.sites.some((entry) => entry.id === next.open?.siteId);
        if (target && next.open.siteId) siteId = next.open.siteId;
        revealPage = false;
        revealSite = false;
        page = target ? 'Sites' : 'Settings';
        if (!target) {
          category = 'browser';
          history.replaceState(null, '', '#settings/browser');
        }
        if (target) await focusSiteSelection();
        else {
          await tick();
          heading?.focus();
        }
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

  async function focusSiteSelection() {
    await tick();
    const rail = libraryList;
    // At narrow widths the list stacks into the workspace, which heading focus may scroll.
    if (!rail || getComputedStyle(rail).overflowY !== 'auto') {
      heading?.focus();
      return;
    }
    const row = rail.querySelector('button[aria-pressed="true"]');
    if (row) {
      const viewportTop = rail.getBoundingClientRect().top + rail.clientTop;
      const viewportBottom = viewportTop + rail.clientHeight;
      const { top, bottom } = row.getBoundingClientRect();
      if (top < viewportTop) rail.scrollTop += Math.floor(top - viewportTop);
      else if (bottom > viewportBottom) rail.scrollTop += Math.ceil(bottom - viewportBottom);
    }
    heading?.focus();
  }

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

  async function saveAccessibility(event: SubmitEvent) {
    event.preventDefault();
    if (!browserBridge || !browserState || editingRule || holdSeconds === undefined ||
        !Number.isInteger(holdSeconds) || holdSeconds < 15 || holdSeconds > 600) return;
    editingRule = true;
    actionError = '';
    try {
      await browserBridge.setAccessibility(accessibilityRevision, { holdSeconds, twoStepConfirmation });
      accessibilityDirty = false;
    } catch (error) {
      actionError = error === 'stale_revision' ? 'Rules changed. Review the current setting and try again.' : 'Could not save accessibility settings.';
      if (error === 'stale_revision') accessibilityDirty = false;
    } finally {
      await pull;
      await refresh();
      editingRule = false;
    }
  }

  async function openDesignation() {
    adding = true;
    await tick();
    hostField?.focus();
  }

  async function cancelDesignation() {
    adding = false;
    hostInput = '';
    await tick();
    addTrigger?.focus();
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
      revealSite = false;
      hostInput = '';
      await focusSiteSelection();
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

  async function launchGrace() {
    if (launchPending) return;
    launchPending = true;
    launchOutcome = undefined;
    try {
      launchOutcome = startGrace ? await startGrace() : 'unsupported';
    } catch {
      launchOutcome = 'unconfirmed';
    } finally {
      launchPending = false;
    }
  }

  async function showSessions() {
    if (!openSessions) return;
    sessionsError = false;
    try { await openSessions(); }
    catch { sessionsError = true; }
  }

  let readingSettings = $state<ReadingSettings>();
  let readingError = $state(false);
  let readingCollapsed = $state(false);
  $effect(() => {
    const bridge = sessionsWindow ? undefined : readingBridge;
    if (!bridge) return;
    let mounted = true;
    let unlisten: (() => void) | undefined;
    void bridge.onConfirmed(() => { if (mounted) readingCollapsed = true; })
      .then(stop => { if (mounted) unlisten = stop; else stop(); }, () => {});
    void bridge.settings().then(
      settings => { if (mounted) readingSettings = settings; },
      () => { if (mounted) readingError = true; },
    );
    return () => { mounted = false; unlisten?.(); };
  });
  async function saveReading(settings: ReadingSettings) {
    if (!readingBridge) return;
    readingSettings = await readingBridge.save(settings);
    readingCollapsed = false;
  }
  async function showReading(external = false) {
    await readingBridge?.open(external);
    readingCollapsed = false;
  }

  async function openPage(next: Page, event: MouseEvent, nextCategory: Category | null = null) {
    if (next === page && (next !== 'Settings' || category === nextCategory)) return;
    revealPage = event.detail > 0;
    revealSite = false;
    openPalette = null;
    page = next;
    category = nextCategory;
    const hash = next === 'Settings' ? `#settings${category ? `/${category}` : ''}` : '';
    if (hash !== location.hash) history.pushState(null, '', hash || location.pathname + location.search);
    await tick();
    heading?.focus();
  }

  async function followCategory(event: MouseEvent, next: Category | null) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const previous = category;
    await openPage('Settings', event, next);
    if (next === null && previous) document.getElementById(`settings-row-${previous}`)?.focus();
  }

  async function followSettingsHash() {
    const next = settingsRoute();
    const previous = category;
    if (next === undefined && page !== 'Settings') return;
    revealPage = false;
    page = next === undefined ? 'Home' : 'Settings';
    category = next ?? null;
    await tick();
    if (next === null && previous) document.getElementById(`settings-row-${previous}`)?.focus();
    else heading?.focus();
  }
  let mark = $state<HTMLButtonElement>();
  let quickMenu = $state<HTMLDivElement>();
  let quickOpen = $state(false);
  let index = $state(0);
  let heldClick = false;
  let hold: { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | undefined;
  let quickPages = $derived<(Page | 'Reading' | 'Sessions' | 'Calendar')[]>([
    'Home', ...(openSessions ? ['Sessions' as const] : []), ...(isTauri() ? ['Calendar' as const] : []),
    ...(readingSettings?.enabled ? ['Reading' as const] : []), ...pages,
  ]);
  function cancelHold() {
    if (hold) clearTimeout(hold.timer);
    hold = undefined;
  }
  function pressMark(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return;
    heldClick = false;
    cancelHold();
    hold = { id: event.pointerId, x: event.clientX, y: event.clientY, timer: setTimeout(() => {
      cancelHold();
      heldClick = true;
      void focusQuick(0);
    }, 500) };
  }
  function moveMark(event: PointerEvent) {
    if (hold?.id === event.pointerId && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 8) cancelHold();
  }
  async function focusQuick(next: number) {
    quickOpen = true;
    index = (next + quickPages.length) % quickPages.length;
    await tick();
    quickMenu?.querySelectorAll('button')[index]?.focus();
  }
  function quickKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      quickOpen = false;
      mark?.focus();
    } else if (event.key === 'Tab') {
      mark?.focus();
      quickOpen = false;
      return;
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      void focusQuick(index + (event.key === 'ArrowDown' ? 1 : -1));
    } else return;
    event.preventDefault();
  }
  function outsideQuick(event: PointerEvent) {
    if (!mark?.contains(event.target as Node) && !quickMenu?.contains(event.target as Node)) quickOpen = false;
  }
</script>

<svelte:document onvisibilitychange={() => windowHidden = document.hidden} />
<svelte:window onhashchange={followSettingsHash} onpointerdown={outsideQuick} onpointerup={cancelHold}
  onpointermove={moveMark} onpointercancel={cancelHold} onblur={() => { cancelHold(); quickOpen = false; }} />

{#if pendingPair}
  {#key pendingPair.id}
    <PairBrowser request={pendingPair} error={pairError} busy={decidingPair} decide={decidePair} />
  {/key}
{/if}

<div class="shell" class:toner-paused={appearance.tonerPaused || windowHidden}>
  {#if !sessionsWindow}
  <header class="toolbar" class:native-mac={nativeMacToolbar}>
    <PaperStock />
    <nav aria-label="Main" class:move-indicator={revealPage} data-page={page}>
      <button type="button" class="brand" aria-label="Home" title="Home" bind:this={mark}
        aria-haspopup="menu" aria-expanded={quickOpen} onpointerdown={pressMark} ondragstart={cancelHold}
        onkeydown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); void focusQuick(0); } }}
        aria-current={page === 'Home' ? 'page' : undefined} onclick={(event) => {
          if (heldClick && event.detail > 0) { heldClick = false; return; }
          quickOpen = false;
          void openPage('Home', event);
        }}>
        <TypewriterMark size={32} /> <span class="toner-type">focus<span class="brand-stop">.</span></span>
      </button>
      {#if quickOpen}
        <div class="quick-menu" role="menu" aria-label="Quick switch" tabindex="-1" bind:this={quickMenu} onkeydown={quickKey}>
          {#each quickPages as entry, i}
            <button type="button" role="menuitem" tabindex={index === i ? 0 : -1} onclick={(event) => {
              quickOpen = false;
              mark?.focus();
              if (entry === 'Reading') {
                void showReading().catch(() => { void openPage('Home', event); });
                return;
              }
              if (entry === 'Sessions') { void showSessions(); return; }
              if (entry === 'Calendar') {
                void openPage('Home', event).then(() => document.querySelector<HTMLElement>('.dashboard-calendar h2')?.focus());
                return;
              }
              void openPage(entry, event);
            }}>{entry}</button>
          {/each}
        </div>
      {/if}
      <div class="nav-items">
        {#each pages as entry}
          <button type="button" aria-label={entry} title={entry} aria-current={page === entry ? 'page' : undefined}
            onclick={(event) => openPage(entry, event)}>
            {#if entry === 'Sites'}
              Sites
            {:else}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                {#if entry === 'Statistics'}
                  <path d="M5 19v-5m7 5V9m7 10V4" stroke-width="2.5" />
                {:else}
                  <path d="M10 3.5h4l.6 2.4 1.7 1 2.4-.7 2 3.5-1.8 1.7v2l1.8 1.7-2 3.5-2.4-.7-1.7 1-.6 2.4h-4l-.6-2.4-1.7-1-2.4.7-2-3.5 1.8-1.7v-2L3.3 9.7l2-3.5 2.4.7 1.7-1z" />
                  <circle cx="12" cy="12.4" r="2.7" />
                {/if}
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    </nav>
  </header>
  {/if}

  <div class="workspace" class:with-library={page === 'Sites'}>
    {#if page === 'Sites'}
      <section class="library" aria-labelledby="library-heading">
        <PaperStock particles />
        <h2 id="library-heading">Site Library</h2>
        <ul bind:this={libraryList}>
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
          <div class="library-action">
            {#if adding}
              <form class="designate" onsubmit={addSite}>
                <label for="custom-host">Hostname or URL</label>
                <input id="custom-host" type="text" placeholder="example.org" bind:this={hostField} bind:value={hostInput} maxlength="2048" />
                {#if customHost}<p>Exact hostname: <strong>{customHost}</strong></p>
                {:else if hostInput}<p>Enter an exact hostname, without credentials or a port.</p>{/if}
                <div><button type="submit" class="outline" disabled={!customHost || editingRule}>Add</button>
                  <button type="button" class="outline" onclick={cancelDesignation}>Cancel</button></div>
              </form>
            {:else}
              <button type="button" class="outline designate-trigger" bind:this={addTrigger} onclick={openDesignation}>
                <span aria-hidden="true">+</span> Add site
              </button>
            {/if}
          </div>
        {/if}
      </section>
    {/if}

    <main class:home={page === 'Home'}>
      <PaperStock particles />
      {#if browserError || actionError}
        <p class="browser-error" role="alert">{browserError || actionError}</p>
      {/if}
      {#key page}
        <div class="page" class:home-page={page === 'Home'} class:reveal={revealPage && page === 'Settings'}>
          {#if page === 'Home'}
            {#if sessionsWindow}
            <div class="launch-hero">
              <div class="hero-copy">
                <h1 tabindex="-1" bind:this={heading}>Start a<br />session</h1>
                <p>Grace opens and runs your session.</p>
                <button class="launch-action" type="button" aria-disabled={launchPending} onclick={launchGrace}>
                  <img src={graceMark} alt="" width="26" height="18" />Start in Grace
                </button>
                <p class="launch-status" role="status">{launchPending ? 'Waiting for Grace…' : launchOutcome ? graceMessage[launchOutcome] : ''}</p>
              </div>
              {#if appearance.printIllustrations}
                <HomeTypewriter paused={appearance.tonerPaused} />
              {/if}
            </div>
            {#if isTauri()}<HomeSchedules />{/if}
            {:else}
              <div class="dashboard">
                <h1 class="dashboard-title" tabindex="-1" bind:this={heading}>Home</h1>
                <div class="dashboard-side">
                {#if isTauri()}<div class="dashboard-calendar"><HomeSchedules calendar /></div>{/if}
                <section class="sessions-summary" aria-labelledby="sessions-summary-heading">
                  <h2 id="sessions-summary-heading">Sessions</h2>
                  {#if appearance.printIllustrations}
                    <img class="typewriter-still" data-print="launch" src={typewriterStill} alt="Blue typewriter floating over a pink disc" width="104" height="96" />
                  {/if}
                  {#if openSessions}<button type="button" class="outline" onclick={showSessions}>Open sessions</button>{/if}
                  {#if sessionsError}<p role="alert">Could not open Sessions.</p>{/if}
                </section>
                </div>
                {#if readingBridge}
                  <ReadingPanel settings={readingSettings} collapsed={readingCollapsed} error={readingError}
                    setup={(event) => openPage('Settings', event, 'reading')} expand={() => readingCollapsed = false}
                    load={readingBridge.preview} open={showReading} article={readingBridge.article} />
                {/if}
              </div>
            {/if}
          {:else if page === 'Sites'}
            <header class="page-heading site-title-row">
              {#key site.id}
                <div class="site-heading">
                  <span class="site-mark"><SiteMark id={site.id} size={27} /></span>
                  <h1 class="toner-type" tabindex="-1" bind:this={heading}><span class:reveal={revealPage || revealSite}>{site.label}</span></h1>
                  <p class="host" class:reveal={revealPage || revealSite}>{site.hostname}</p>
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
              <button type="button" class="outline" onclick={(event) => openPage('Settings', event, 'browser')}>Browser settings</button>
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
          {:else if category === null}
            <header class="page-heading"><SettingsPrint bind:heading /></header>
            <ul class="settings-categories">
              {#each Object.entries(categories).filter(([key]) => key !== 'reading' || readingBridge) as [key, entry]}
                <li><a href={`#settings/${key}`} id={`settings-row-${key}`} onclick={(event) => followCategory(event, key as Category)}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d={entry.icon} /></svg>
                  <span>{entry.label}</span>
                </a></li>
              {/each}
            </ul>
          {:else}
            {#key category}
              <header class="page-heading">
                <a href="#settings" onclick={(event) => followCategory(event, null)}>Back to Settings</a>
                <h1 bind:this={heading} tabindex="-1">{categories[category].label}</h1>
              </header>
            {/key}
            {#if category === 'appearance'}
            <fieldset aria-label="Appearance">
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
            {:else if category === 'accessibility'}
            <fieldset disabled={!browserBridge || !browserState || editingRule}>
              <legend>Accessibility</legend>
              {#if !browserState?.entryAvailable}<p>Site entry is unavailable in this build. These settings apply only when it is enabled.</p>{/if}
              <form onsubmit={saveAccessibility}>
                <label class="accessibility-seconds">
                  <span>Hold duration (seconds)</span>
                  <input type="number" min="15" max="600" step="1" required bind:value={holdSeconds}
                    oninput={() => accessibilityDirty = true} />
                </label>
                <p>Choose a duration from 15 to 600 seconds for the press-and-hold confirmation.</p>
                <label class="preference effect-preference">
                  <input type="checkbox" bind:checked={twoStepConfirmation} onchange={() => accessibilityDirty = true} />
                  <span class="choice-mark" aria-hidden="true"></span>
                  <span>Use two-step confirmation instead of holding</span>
                </label>
                <button type="submit" class="outline" disabled={!accessibilityDirty}>Save accessibility settings</button>
              </form>
              {#if actionError}<p class="browser-error" role="alert">{actionError}</p>{/if}
            </fieldset>
            {:else if category === 'reading'}
              {#if readingSettings}<ReadingSetup settings={readingSettings} save={saveReading} />
              {:else}<p role="status">{readingError ? 'Reading settings are unavailable.' : 'Loading Reading settings…'}</p>{/if}
            {:else}
              <BrowserSettings profiles={browserState?.profiles ?? []} bridge={browserBridge} disconnect={revoke} active={true} />
            {/if}
          {/if}
        </div>
      {/key}
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
    :global(html) { --scrollbar-track: var(--canvas); }
    .library > ul { --scrollbar-track: var(--rail); }
    :global(.schedule-dialog) { --scrollbar-track: var(--surface); }

    /* Prefer the WebKit parts where available so the thumb can be inset
       without shrinking its hit area. A non-auto scrollbar-color overrides them. */
    @supports selector(::-webkit-scrollbar) {
      :global(html::-webkit-scrollbar),
      :global(.schedule-dialog::-webkit-scrollbar),
      :is(.workspace, .library > ul, .with-library > main)::-webkit-scrollbar {
        width: 14px;
        height: 14px;
        background: var(--scrollbar-track);
      }
      :global(html::-webkit-scrollbar-track),
      :global(.schedule-dialog::-webkit-scrollbar-track),
      :is(.workspace, .library > ul, .with-library > main)::-webkit-scrollbar-track {
        background: var(--scrollbar-track);
      }
      :global(html::-webkit-scrollbar-thumb),
      :global(.schedule-dialog::-webkit-scrollbar-thumb),
      :is(.workspace, .library > ul, .with-library > main)::-webkit-scrollbar-thumb {
        border: 3px solid transparent;
        border-radius: var(--radius-dialog);
        background: var(--edge) padding-box;
      }
    }
    @supports not selector(::-webkit-scrollbar) {
      :global(html), :global(.schedule-dialog), :is(.workspace, .library > ul, .with-library > main) {
        scrollbar-color: var(--edge) var(--scrollbar-track);
      }
    }
  }

  .shell { display: flex; flex-direction: column; min-height: 100dvh; }
  .shell:has(> .toolbar.native-mac) { height: 100dvh; }
  .toner-paused { --toner-play-state: paused; }

  .toolbar, .library, main { isolation: isolate; position: relative; }
  .toolbar, .library { --grain-opacity: var(--grain-rail); }

  .toolbar {
    --home-target: 124px;
    --navigation-width: 148px;
    --traffic-inset: 0px;
    display: flex;
    min-height: 46px;
    background: var(--rail);
    border-bottom: 1px solid var(--divider);
    z-index: 1;
  }

  /* These CSS-pixel hit regions match titlebar.rs before WebKit page zoom. */
  .toolbar.native-mac { --traffic-inset: 72px; flex: none; box-sizing: border-box; height: 46px; user-select: none; }

  .workspace { flex: 1; display: flex; flex-direction: column; }
  .brand, .nav-items, .library h2, .library ul, .library-action { background: var(--rail); }
  /* Keep the scrollbar below the toolbar so AppKit and the navigation share the same right edge. */
  .toolbar.native-mac + .workspace { overflow: auto; }
  .with-library { display: grid; grid-template-columns: 196px minmax(0, 1fr); }

  nav .brand {
    position: absolute;
    inset-inline-start: max(var(--traffic-inset), min(calc((100% - var(--home-target)) / 2), calc(100% - var(--navigation-width) - var(--home-target))));
    inset-block: 0;
    display: flex;
    justify-content: center;
    gap: 6px;
    width: var(--home-target);
    padding: 0;
    font: 700 24px/1 var(--font-wordmark);
  }
  .quick-menu {
    position: absolute;
    z-index: 2;
    inset-block-start: 100%;
    inset-inline-start: max(var(--traffic-inset), min(calc((100% - var(--home-target)) / 2), calc(100% - var(--navigation-width) - var(--home-target))));
    min-width: var(--home-target);
    border: 1px solid var(--ink);
    border-radius: var(--radius-control);
    background: var(--surface);
  }
  nav .quick-menu button { width: 100%; justify-content: start; padding-inline: 10px; }
  .brand-stop { color: var(--secondary); }
  .brand[aria-current]::after {
    content: '';
    position: absolute;
    inset: auto 9px 0;
    height: 2px;
    background: var(--accent);
    pointer-events: none;
  }

  nav { position: relative; display: flex; justify-content: end; width: 100%; }
  .nav-items {
    --sites-target: 60px;
    --nav-gap: 2px;
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex: none;
    width: var(--navigation-width);
    gap: var(--nav-gap);
    align-items: center;
    padding-inline: 4px 8px;
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
    width: 36px;
    min-height: 36px;
    padding: 0;
    border-radius: var(--radius-control);
    color: var(--ink);
  }
  .nav-items button:first-child { width: var(--sites-target); font-weight: 700; }
  nav button:focus-visible { outline-offset: -2px; }
  .nav-items::after {
    content: '';
    position: absolute;
    inset: auto auto 0 4px;
    width: 18px;
    height: 2px;
    background: var(--accent);
    pointer-events: none;
    transform: translateX(var(--indicator-left, calc((var(--sites-target) - 18px) / 2)));
  }
  nav[data-page='Home'] .nav-items::after { display: none; }
  nav[data-page='Statistics'] .nav-items { --indicator-left: calc(var(--sites-target) + var(--nav-gap) + 9px); }
  nav[data-page='Settings'] .nav-items { --indicator-left: calc(var(--sites-target) + 2 * var(--nav-gap) + 45px); }
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

  .library { display: flex; flex-direction: column; padding-block: 16px; border-inline-end: 1px solid var(--divider); background: var(--rail); --toner-origin: -117px -48px; }
  .library h2 { margin: 0; padding: 0 14px 4px; font-size: 15px; color: var(--ink); }
  .library-label { display: grid; min-width: 0; overflow-wrap: anywhere; }
  .library-label small { font-size: 12px; font-weight: 400; }
  .library-action { margin-block-start: auto; border-block-start: 1px solid var(--divider); padding: 10px 14px 0; }
  .designate-trigger { width: 100%; justify-content: center; font-weight: 700; }
  .designate-trigger.outline:not(:hover, :active) { border-color: var(--accent); color: var(--accent); }
  .designate input { display: block; box-sizing: border-box; width: 100%; min-width: 0; margin-top: 6px; padding: 4px; border: 1px solid var(--edge); border-radius: var(--radius-control); color: var(--ink); background: var(--surface); font: inherit; }
  .designate input::placeholder { color: var(--muted); opacity: 1; }
  .designate div { display: flex; flex-wrap: wrap; gap: 6px; }

  main { flex: 1; padding: 24px; min-width: 0; background: var(--canvas); }
  /* Print is visible on open stock, not through copy, browser data or controls. */
  .page, .browser-error { background: var(--canvas); }
  .page { max-width: 760px; }
  .page:not([hidden]) { display: flow-root; }

  main.home { padding: 0; }
  .home-page { max-width: none; background: transparent; }
  .dashboard { display: grid; grid-template-columns: minmax(210px, 30%) minmax(0, 1fr); gap: 20px; padding: 24px; }
  .dashboard-title { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .dashboard-side { display: grid; min-width: 0; align-content: start; gap: 16px; border-inline-end: 1px solid var(--divider); padding-inline-end: 18px; background: var(--canvas); }
  .sessions-summary { display: grid; justify-items: start; gap: 8px; border-block-start: 1px solid var(--divider); padding-top: 12px; }
  .typewriter-still { image-rendering: pixelated; }
  @media (max-width: 635px) {
    .dashboard { grid-template-columns: minmax(0, 1fr); }
    .dashboard-side { border-inline-end: 0; padding-inline-end: 0; }
  }
  @media (forced-colors: active) { .typewriter-still { display: none; } }
  .launch-hero { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: center; min-height: max(345px, 47vw); }
  .hero-copy { position: relative; width: fit-content; max-width: min(88%, 410px); margin: 32px 0 32px 7.6%; }
  .hero-copy h1 { font: 800 clamp(42px, 6.85vw, 72px)/.99 var(--font-display); }
  .hero-copy p { color: var(--ink); }
  .hero-copy h1 + p { margin: 18px 0 32px; font-size: 17px; }
  .launch-action {
    min-height: 44px;
    border: 2px solid var(--accent);
    border-radius: var(--radius-control);
    padding: 5px 16px;
    color: var(--accent);
    background: var(--canvas);
    font-size: 20px;
    font-weight: 700;
  }
  .launch-action img { flex: none; }
  .launch-action[aria-disabled='true'] { cursor: wait; }
  .hero-copy .launch-status { position: absolute; top: calc(100% + 5px); margin-top: 0; }
  @media (max-width: 635px) {
    .launch-hero { grid-template-columns: minmax(0, 1fr); align-items: start; min-height: 0; }
    .hero-copy { max-width: calc(100% - 32px); margin: 28px 16px; }
    .hero-copy .launch-status { position: static; margin-top: 8px; }
  }
  @media (forced-colors: active) {
    .launch-action { border-color: ButtonText; color: ButtonText; }
  }

  .settings-categories { list-style: none; margin: 0; padding: 0; }
  .settings-categories a { display: flex; align-items: center; gap: 12px; min-height: 48px; border-bottom: 1px solid var(--divider); padding-inline: 8px; text-decoration: none; color: var(--ink); }
  .settings-categories a:hover { background: var(--accent); color: var(--on-accent); }
  .page-heading { padding-bottom: 16px; border-bottom: 1px solid var(--divider); }
  @media (forced-colors: none) {
    .page-heading, .rule-row, .palette-picker, .effect-preference { position: relative; border-color: transparent; }
    .page-heading::after, .rule-row::before, .palette-picker::after, .effect-preference::after {
      content: ''; position: absolute; inset-inline: 0; height: 3px; pointer-events: none;
      background: var(--muted);
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
  .site-heading h1 > span { display: block; }
  h1:focus { outline: none; }
  .site-title-row, .statistics-empty { display: flex; justify-content: space-between; gap: 16px; }
  .site-title-row { align-items: center; padding-bottom: 12px; }
  .site-heading { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 12px; min-width: 0; }
  .impression { pointer-events: none; }
  .margin { flex: none; align-self: end; }
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
  .connection span { width: 5px; height: 5px; flex: none; border-radius: 50%; background: var(--secondary); }
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
  .accessibility-seconds { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .accessibility-seconds input { width: 6em; min-height: 36px; padding: 4px 8px; border: 1px solid var(--edge); border-radius: var(--radius-control); background: var(--surface); color: var(--ink); font: inherit; }
  .accessibility-seconds + p { margin-bottom: 8px; }
  form .outline { margin-top: 12px; }
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

  @media (min-width: 636px) {
    .shell { height: 100dvh; }
    .toolbar { flex: none; }
    .workspace { min-height: 0; }
    .with-library { grid-template-rows: minmax(0, 1fr); }
    .library > ul, .with-library > main { overflow: auto; }
    .library-action { flex-shrink: 0; }
  }

  @media (max-width: 635px) {
    .toolbar { --home-target: 112px; --navigation-width: 130px; }
    .nav-items { --sites-target: 50px; --nav-gap: 0px; padding-inline-end: 4px; }
    nav .brand { font-size: 21px; }
    .with-library { display: flex; flex-direction: column; }
    .library { padding: 8px 12px; border-inline-end: 0; border-bottom: 1px solid var(--divider); }
    .library h2 { padding-inline: 8px; }
    .library-action { margin-block-start: 8px; padding-inline: 8px; }
    .designate-trigger { width: fit-content; }
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
    li button[aria-pressed='true'] { border-inline-start: 2px solid Highlight; box-shadow: none; }
  }

  @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) and (forced-colors: none) {
    @supports (background-clip: text) or (-webkit-background-clip: text) {
      .brand:is(:hover, :active) .toner-type { --sweep-ink: var(--on-accent); }
      .toner-type:hover {
        --sweep-width: var(--toner-sweep-width, 36px);
        color: transparent;
        background-color: var(--sweep-ink, var(--ink));
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
    nav.move-indicator .nav-items::after { transition: transform var(--motion-interaction) var(--ease); }
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
