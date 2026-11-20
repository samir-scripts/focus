<script lang="ts">
  import { tick } from 'svelte';
  import SiteMark from '@focus/ui/SiteMark.svelte';
  import TypewriterMark from '@focus/ui/TypewriterMark.svelte';
  import { sites } from './sites';

  const pages = ['Sites', 'Statistics', 'Settings'] as const;
  const appearances = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ] as const;
  type Page = (typeof pages)[number];
  type Appearance = (typeof appearances)[number]['value'];
  const appearanceKey = 'focus.appearance';

  function readAppearance(): Appearance {
    try {
      const saved = window.localStorage.getItem(appearanceKey);
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
      return 'system';
    }
  }

  let page = $state<Page>('Sites');
  let site = $state.raw<(typeof sites)[number]>(sites[0]);
  let appearance = $state(readAppearance());
  let heading: HTMLHeadingElement | undefined = $state();

  $effect(() => {
    document.documentElement.dataset.theme = appearance;
  });

  function setAppearance(value: Appearance) {
    appearance = value;
    try {
      if (value === 'system') window.localStorage.removeItem(appearanceKey);
      else window.localStorage.setItem(appearanceKey, value);
    } catch {
      // The selection still applies for this window if storage is unavailable.
    }
  }

  async function openPage(next: Page) {
    if (next === page) return;
    page = next;
    await tick();
    heading?.focus();
  }
</script>

<div class="shell">
  <header class="toolbar">
    <div class="brand"><TypewriterMark size={22} /> <span>focus.</span></div>
    <nav aria-label="Main">
      {#each pages as entry}
        <button type="button" aria-current={page === entry ? 'page' : undefined} onclick={() => openPage(entry)}>
          {entry}
        </button>
      {/each}
    </nav>
  </header>

  <div class="workspace" class:with-library={page === 'Sites'}>
    {#if page === 'Sites'}
      <section class="library" aria-labelledby="library-heading">
        <h2 id="library-heading">Site library</h2>
        <ul>
          {#each sites as entry (entry.id)}
            <li>
              <button type="button" aria-pressed={site === entry} onclick={() => (site = entry)}>
                <span class="site-mark"><SiteMark id={entry.id} size={20} /></span>
                <span>{entry.label}</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <main>
      {#key page}
        <div class="page">
          {#if page === 'Sites'}
            <header class="page-heading site-heading">
              <span class="site-mark"><SiteMark id={site.id} size={27} /></span>
              <div>
                <h1 tabindex="-1" bind:this={heading}>{site.label}</h1>
                <p class="host">{site.hostname}</p>
              </div>
            </header>
            <section class="details access-row">
              <div>
                <h2>Browser access</h2>
                <p class="connection"><span aria-hidden="true"></span>No browsers connected</p>
              </div>
              <button type="button" class="outline" onclick={() => openPage('Settings')}>Browser settings</button>
            </section>
          {:else if page === 'Statistics'}
            <header class="page-heading"><h1 tabindex="-1" bind:this={heading}>Statistics</h1></header>
            <section class="details">
              <h2>No time recorded</h2>
            </section>
          {:else}
            <header class="page-heading"><h1 tabindex="-1" bind:this={heading}>Settings</h1></header>
            <fieldset>
              <legend>Appearance</legend>
              <div class="appearances">
                {#each appearances as option}
                  <label>
                    <input type="radio" name="appearance" value={option.value} checked={appearance === option.value}
                      onchange={() => setAppearance(option.value)} />
                    <span>{option.label}</span>
                  </label>
                {/each}
              </div>
            </fieldset>
            <section class="details">
              <h2>Browsers</h2>
              <p>No browsers connected</p>
            </section>
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
    font: 15px/1.5 'Mona Sans', system-ui, sans-serif;
  }

  .shell { display: flex; flex-direction: column; min-height: 100dvh; }

  .toolbar {
    display: grid;
    grid-template-columns: 196px minmax(0, 1fr);
    min-height: 46px;
    background: var(--canvas);
    border-bottom: 1px solid var(--divider);
  }

  .workspace { flex: 1; }
  .with-library { display: grid; grid-template-columns: 196px minmax(0, 1fr); }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    font-family: 'Mona Sans Mono', ui-monospace, monospace;
    font-size: 18px;
    font-weight: 650;
    letter-spacing: -0.04em;
  }

  nav { display: flex; gap: 2px; align-items: stretch; padding-inline: 12px; }
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
    transition: background-color var(--motion-interaction) var(--ease);
  }

  nav button { position: relative; color: var(--muted); width: auto; font-size: 14px; }
  nav button[aria-current] { color: var(--ink); font-weight: 650; }
  nav button[aria-current]::after {
    content: '';
    position: absolute;
    inset: auto 12px 0;
    height: 2px;
    background: var(--accent);
  }
  li button { width: 100%; min-height: 42px; gap: 12px; font-size: 15px; font-weight: 500; }
  li button:focus-visible { outline-offset: -4px; }
  .site-mark { display: grid; place-items: center; flex: none; color: var(--muted); }
  [aria-pressed='true'] .site-mark, .site-heading .site-mark { color: var(--ink); }
  button:hover { background: var(--hover); }
  li button[aria-pressed='true'] {
    background: var(--selected);
    box-shadow: inset 2px 0 var(--accent);
    font-weight: 650;
  }

  .library { padding: 12px 0; border-inline-end: 1px solid var(--divider); background: var(--rail); }
  .library h2 { margin: 0 14px 8px; font-size: 14px; color: var(--muted); }

  main { padding: 24px; min-width: 0; background: var(--surface); }
  .page { max-width: 760px; animation: enter var(--motion-view) var(--ease) both; }
  @keyframes enter {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .page-heading { padding-bottom: 16px; border-bottom: 1px solid var(--divider); }
  h1, h2, p { margin: 0; }
  h1 { font-size: 28px; font-weight: 620; line-height: 1.2; letter-spacing: -0.025em; }
  h1:focus { outline: none; }
  .site-heading { display: flex; align-items: center; gap: 12px; }
  h2, legend { font-size: 16px; font-weight: 620; }
  p { margin-top: 4px; font-size: 15px; color: var(--muted); overflow-wrap: anywhere; }
  .host { font-family: 'Mona Sans Mono', ui-monospace, monospace; font-size: 14px; }
  .details, fieldset { margin-top: 16px; }
  .access-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .connection { display: flex; align-items: center; gap: 6px; }
  .connection span { width: 5px; height: 5px; border-radius: 50%; background: var(--muted); }
  .outline { min-height: 36px; border: 1px solid var(--edge); border-radius: var(--radius-control); font-size: 14px; }
  fieldset { border: 0; padding: 0; min-width: 0; }
  legend { padding: 0; margin-bottom: 8px; }
  .appearances { display: flex; width: fit-content; max-width: 100%; }
  label { position: relative; display: flex; align-items: center; min-height: 36px; padding: 4px 16px; border: 1px solid var(--edge); font-size: 14px; cursor: pointer; }
  label:first-child { border-radius: var(--radius-control) 0 0 var(--radius-control); }
  label:last-child { border-radius: 0 var(--radius-control) var(--radius-control) 0; }
  label + label { border-inline-start: 0; }
  label:hover, label:has(:checked) { background: var(--selected); }
  label:focus-within { z-index: 1; outline: 2px solid var(--accent); outline-offset: 3px; }
  input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; width: 100%; height: 100%; }

  @media (max-width: 635px) {
    .toolbar { display: flex; flex-wrap: wrap; }
    .brand { min-height: 44px; }
    nav { min-height: 44px; flex-wrap: wrap; }
    .with-library { display: flex; flex-direction: column; }
    .library { padding: 8px 12px; border-inline-end: 0; border-bottom: 1px solid var(--divider); }
    ul { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 4px; }
    main { padding: 16px; }
    li button { gap: 8px; padding-inline: 8px; }
  }

  @media (max-width: 340px) {
    ul { grid-template-columns: minmax(0, 1fr); }
    label { padding-inline: 10px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .page, button { animation: none; transition: none; }
  }
</style>
