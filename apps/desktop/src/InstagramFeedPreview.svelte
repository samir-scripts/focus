<script lang="ts">
  import SiteMark from '@focus/ui/SiteMark.svelte';
  import type { ContentRules } from './browser';

  let { rules, grayscale }: { rules: Extract<ContentRules, { site: 'instagram' }>; grayscale: boolean } = $props();
  const views = ['Home', 'Reels feed', 'Shared reel'] as const;
  let view = $state<(typeof views)[number]>('Home');
  let summary = $derived(view === 'Reels feed' && rules.hideReelsDiscovery ? 'Endless Reels feed hidden'
    : view === 'Shared reel' && rules.hideReelsDiscovery ? 'Shared reel stays playable'
    : view === 'Home' && rules.hideSuggestedHome && rules.hideReelsDiscovery ? 'Suggestions and Reels discovery hidden'
    : view === 'Home' && rules.hideSuggestedHome ? 'Suggested posts hidden'
    : view === 'Home' && rules.hideReelsDiscovery ? 'Reels discovery hidden' : 'Same as before');
</script>

{#snippet post(title: string, detail: string, suggested = false)}
  <div class="row"><span class="print" class:suggested aria-hidden="true"></span><span>{title}<small>{detail}</small></span></div>
{/snippet}

{#snippet feed(apply: boolean)}
  {@const reels = apply && rules.hideReelsDiscovery}
  <div class="feed" class:grayscale={apply && grayscale}>
    <div class="sample-nav"><SiteMark id="instagram" size={15} /><strong>Instagram</strong><span>Home</span>{#if !reels}<span>Reels</span>{/if}<span class="messages">Messages</span></div>
    {#if view === 'Reels feed' && reels}
      <p class="empty">Reels feed hidden</p>
    {:else if view !== 'Home'}
      <div class="row reel"><span class="poster" aria-hidden="true">▶</span><div>
        <strong>{view === 'Shared reel' ? 'Reel shared in Messages' : 'Recommended reel'}</strong>
        <small>Playback · Comments · Share</small>
        {#if !reels}<small>↓ More recommended reels</small>{/if}
      </div></div>
    {:else}
      <div class="stories"><i></i><i></i><i></i><span>Stories</span></div>
      {@render post('Weekend hike', 'Account you follow')}
      {#if !apply || !rules.hideSuggestedHome}{@render post('Street photography', 'Suggested for you', true)}{/if}
      {#if !reels}<div class="row"><span class="thumbs" aria-hidden="true"><i>▶</i><i>▶</i><i>▶</i></span><span>Recommended Reels</span></div>{/if}
    {/if}
  </div>
{/snippet}

<section class="preview" aria-label="Feed preview">
  <header><h2>Feed preview</h2><span>Illustrative sample content</span></header>
  <div class="views" role="group" aria-label="Preview surface">
    {#each views as option (option)}
      <button type="button" aria-pressed={view === option} onclick={() => { view = option; }}>{option}</button>
    {/each}
  </div>
  <div class="comparison">
    <section class="pane" aria-label="Before"><h3>Before</h3><p>Unfiltered sample</p>{@render feed(false)}</section>
    <section class="pane after" aria-label="With rules"><h3>With rules</h3><p role="status">{summary}</p>{@render feed(true)}</section>
  </div>
</section>

<style>
  .preview { margin-top: 12px; padding-top: 9px; border-top: 1px solid var(--divider); color: var(--ink); font: 400 12px/1.3 var(--font-ui); }
  header, .views, .sample-nav, .row, .stories, .thumbs { display: flex; align-items: center; gap: 8px; }
  header { justify-content: space-between; flex-wrap: wrap; }
  h2, h3, p { margin: 0; }
  h2 { font-size: 17px; }
  header span, small, .pane > p { color: var(--muted); }
  .views { flex-wrap: wrap; margin-block: 8px; }
  button { min-height: 30px; border: 1px solid var(--edge); border-radius: var(--radius-control); background: var(--surface); color: var(--ink); font: inherit; }
  button[aria-pressed='true'], button:is(:hover, :active) { background: var(--accent); color: var(--on-accent); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .pane { min-width: 0; border: 1px solid var(--edge); border-radius: var(--radius-control); overflow: hidden; background: var(--surface); }
  h3 { background: var(--rail); border-bottom: 1px solid var(--divider); padding: 7px 10px; font-size: 15px; }
  .pane > p { min-height: 30px; padding: 6px 10px; }
  .after > p { color: var(--ink); font-weight: 700; }
  .feed { margin: 0 8px 8px; border: 1px solid var(--divider); }
  .grayscale { filter: grayscale(1); }
  .sample-nav, .row, .stories, .empty { padding: 7px; border-bottom: 1px solid var(--divider); }
  .sample-nav { flex-wrap: wrap; }
  .messages { margin-inline-start: auto; }
  .row:last-child, .empty { border-bottom: 0; }
  small { display: block; }
  .stories i { width: 14px; height: 14px; border: 1px solid var(--accent); border-radius: 50%; background: var(--rail); }
  .print, .poster, .thumbs i { display: grid; place-items: center; background: var(--rail); border: 1px solid var(--edge); flex: none; font-style: normal; }
  .print {
    position: relative; overflow: hidden; width: 34px; height: 26px; border-radius: 2px;
    background: color-mix(in srgb, var(--accent) 22%, var(--surface));
  }
  .print::before {
    content: ''; position: absolute; inset: 0;
    background: color-mix(in srgb, var(--ink) 63%, var(--surface));
    clip-path: polygon(0% 72%, 24% 29%, 43% 69%, 62% 38%, 100% 80%, 100% 100%, 0% 100%);
  }
  .print.suggested::before { clip-path: polygon(0% 79%, 33% 31%, 56% 65%, 73% 28%, 100% 51%, 100% 100%, 0% 100%); }
  .poster { width: 58px; aspect-ratio: 3 / 4; }
  .thumbs { gap: 3px; }
  .thumbs i { width: 18px; height: 24px; font-size: 8px; }
  @media (max-width: 635px) { .comparison { grid-template-columns: minmax(0, 1fr); } }
  @media (forced-colors: active) {
    button[aria-pressed='true'] { forced-color-adjust: none; color: HighlightText; background: Highlight; border-color: Highlight; }
    .print { forced-color-adjust: none; background: Canvas; border-color: GrayText; }
    .print::before { background: CanvasText; }
  }
</style>
