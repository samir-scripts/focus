<script lang="ts">
  import SiteMark from '@focus/ui/SiteMark.svelte';
  import type { ContentRules } from './browser';

  let { rules, pulse }: { rules: Exclude<ContentRules, { site: 'instagram' }>; pulse: number } = $props();
  const icons = {
    search: 'M10 9.5l4 4M11 7.5a3.5 3.5 0 1 1-7 0a3.5 3.5 0 0 1 7 0Z',
    up: 'M8 13V3M4 7l4-4l4 4', down: 'M8 3v10m-4-4l4 4l4-4',
    comment: 'M13.5 8a5.3 5.3 0 0 1-5.5 5H3l1.1-2.2a5.2 5.2 0 0 1-1.6-3.5A5.3 5.3 0 0 1 8 2.5 5.3 5.3 0 0 1 13.5 8Z',
    share: 'M8 3l4 4M12 7L8 11M12 7H7a3.5 3.5 0 0 0-3.5 3.5V13',
    shorts: 'M5 4l5-2 2 3-2 2 2 2-1 3-5 2-2-3 2-2-2-2zM7 6.8l2.2 1.3L7 9.5z',
  };
  const protectedContent = {
    x: 'Search, direct posts, messages and composing stay available.',
    reddit: 'Communities, threads and search stay available.',
    youtube: 'Subscriptions, search, watch pages and direct Shorts stay available.',
  };
  let summary = $derived.by(() => {
    if (rules.site === 'x') return rules.openFollowing ? 'Following opens on Home' : rules.hideForYou ? 'For you hidden · Following stays' : 'Same as before';
    if (rules.site === 'reddit') return rules.hideAllHome ? 'Both Home feeds hidden' : rules.hideRecommendations ? 'Recommendations hidden · Following stays' : 'Same as before';
    if (rules.hideHomeRecommendations) return rules.hideShorts ? 'Recommendations and Shorts hidden' : 'Recommendations hidden · Shorts stay';
    return rules.hideShorts ? 'Shorts hidden · Recommendations stay' : 'Same as before';
  });
</script>

{#snippet icon(name: keyof typeof icons)}
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d={icons[name]} /></svg>
{/snippet}
{#snippet hidden()}
  <p class="hidden">Hidden by this rule</p>
{/snippet}
{#snippet lines()}
  <div class="lines"><i class="bone"></i><i class="bone short"></i></div>
{/snippet}
{#snippet videos(portrait: boolean)}
  <div class="videos" class:portrait>
    {#each (portrait ? [1, 2, 3] : [1, 2]) as slot (slot)}
      <div><div class="bone thumb">{#if !portrait}<i class="duration"></i>{/if}</div>
        <div class="metadata">{#if !portrait}<i class="bone avatar"></i>{/if}{@render lines()}</div>
      </div>
    {/each}
  </div>
{/snippet}
{#snippet redditPost()}
  <div class="community"><i class="bone avatar"></i>r/<i class="bone name"></i></div>
  {@render lines()}
  <div class="actions"><span>{@render icon('up')}<i class="bone"></i>{@render icon('down')}</span><span>{@render icon('comment')}</span><span>{@render icon('share')}</span></div>
{/snippet}
{#snippet xPost(media: boolean)}
  <div class="post"><i class="bone avatar"></i><div><i class="bone name"></i>{@render lines()}{#if media}<div class="bone media"></div>{/if}</div></div>
{/snippet}
{#snippet feed(apply: boolean)}
  <div class="illustration" data-site={rules.site} aria-hidden="true">
    <div class="masthead"><span class="brand"><span class="mark"><SiteMark id={rules.site} size={15} /></span>{rules.site === 'x' ? 'Home' : rules.site === 'reddit' ? 'reddit' : 'YouTube'}</span>
      {#if rules.site !== 'x'}<span class="search">{@render icon('search')}<span>{rules.site === 'reddit' ? 'Search Reddit' : 'Search'}</span></span>{/if}
    </div>
    {#if rules.site === 'x'}
      {@const following = apply && rules.openFollowing}
      <div class="tabs"><span class:chosen={!following}>For you</span><span class:chosen={following}>Following</span></div>
      {#if apply && rules.hideForYou}{@render hidden()}{:else}{@render xPost(!following)}{@render xPost(false)}{/if}
    {:else if rules.site === 'reddit'}
      <div class="tabs"><span class="chosen">For You</span><span>Following</span></div>
      <div class="sample"><strong>Suggested post</strong>
        {#if apply && (rules.hideRecommendations || rules.hideAllHome)}{@render hidden()}{:else}{@render redditPost()}{/if}
      </div>
      <div class="sample"><strong>Following</strong>
        {#if apply && rules.hideAllHome}{@render hidden()}{:else}{@render redditPost()}{/if}
      </div>
    {:else}
      <div class="topics"><span>All</span><span>Music</span><span>Live</span></div>
      <div class="sample"><strong>Recommended videos</strong>
        {#if apply && rules.hideHomeRecommendations}{@render hidden()}{:else}{@render videos(false)}{/if}
      </div>
      <div class="sample"><strong class="shorts">{@render icon('shorts')}Shorts</strong>
        {#if apply && rules.hideShorts}{@render hidden()}{:else}{@render videos(true)}{/if}
      </div>
    {/if}
  </div>
{/snippet}

<section class="preview" aria-label="Feed preview">
  <header><h2>Feed preview</h2><span>Illustrative sample content</span></header>
  <div class="comparison">
    <section class="pane" aria-label="Before"><h3>Before</h3><p>Unfiltered sample</p>{@render feed(false)}</section>
    <section class="pane after" aria-label="With rules"><h3>With rules</h3><p aria-live="polite">{summary}</p>
      {#key pulse}<div class:pulse={pulse > 0}>{@render feed(true)}</div>{/key}
    </section>
  </div>
  <p class="protected">{protectedContent[rules.site]}</p>
</section>

<style>
  .preview { margin-top: 12px; padding-top: 9px; border-top: 1px solid var(--divider); color: var(--ink); font: 400 12px/1.3 var(--font-ui); }
  header, .masthead, .brand, .search, .tabs, .topics, .community, .actions, .actions span, .shorts { display: flex; align-items: center; }
  header { justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; margin-bottom: 8px; }
  header span, .protected { color: var(--muted); }
  h2, h3, p { margin: 0; }
  h2 { font-size: 17px; }
  h3 { background: var(--rail); border-bottom: 1px solid var(--divider); padding: 7px 10px; font-size: 15px; }
  .comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .pane { min-width: 0; border: 1px solid var(--edge); border-radius: var(--radius-control); overflow: hidden; background: var(--surface); }
  .pane > p { min-height: 30px; padding: 6px 10px; color: var(--muted); }
  .after > p { color: var(--ink); font-weight: 700; }
  .protected { margin-top: 8px; }
  .illustration { --site-brand: var(--ink); padding: 0 10px 9px; }
  [data-site='youtube'] { --site-brand: #ce222b; }
  [data-site='reddit'] { --site-brand: #b93614; }
  :global(html[data-theme='dark']) [data-site='youtube'] { --site-brand: #ff6470; }
  :global(html[data-theme='dark']) [data-site='reddit'] { --site-brand: #ff8a62; }
  @media (prefers-color-scheme: dark) {
    :global(html[data-theme='system']) [data-site='youtube'] { --site-brand: #ff6470; }
    :global(html[data-theme='system']) [data-site='reddit'] { --site-brand: #ff8a62; }
  }
  .masthead { gap: 8px; border-block: 1px solid var(--divider); padding-block: 4px; margin-bottom: 6px; }
  .brand { gap: 4px; font-weight: 700; font-size: 13px; }
  .mark { color: var(--site-brand); display: flex; }
  svg { width: 11px; height: 11px; flex: none; stroke: currentColor; fill: none; stroke-width: 1.65; stroke-linecap: round; stroke-linejoin: round; }
  .search { min-width: 0; flex: 1; gap: 4px; padding: 1px 6px; border: 1px solid var(--divider); border-radius: 11px; color: var(--muted); font-size: 10px; }
  .search span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .tabs { gap: 10px; border-bottom: 1px solid var(--divider); margin-bottom: 5px; padding-bottom: 4px; color: var(--muted); }
  .tabs .chosen { border-bottom: 2px solid var(--site-brand); color: var(--ink); }
  .topics { gap: 5px; flex-wrap: wrap; margin-bottom: 4px; }
  .topics span { background: var(--selected); padding: 1px 5px; border-radius: 4px; }
  .topics span:first-child { background: var(--ink); color: var(--surface); }
  .sample + .sample, .post + .post { margin-top: 6px; border-top: 1px solid var(--divider); padding-top: 6px; }
  strong { display: block; margin-bottom: 5px; }
  .shorts { gap: 4px; }
  .shorts svg { color: var(--site-brand); }
  .hidden { color: var(--muted); padding-block: 4px; }
  .bone { display: block; background: var(--selected); border-radius: 2px; }
  .lines { display: grid; gap: 4px; }
  .lines .bone { width: 81%; height: 5px; }
  .lines .short { width: 62%; }
  .avatar { border-radius: 50%; background: color-mix(in srgb, var(--ink) 36%, var(--selected)); width: 14px; height: 14px; flex: none; }
  .name { width: 39px; height: 4px; }
  .post { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 7px; padding: 5px 0; }
  .post .avatar { width: 20px; height: 20px; }
  .post .name, .community { margin-bottom: 4px; }
  .media { height: 33px; margin-top: 5px; }
  .community, .actions, .actions span { gap: 4px; }
  .community, .actions { color: var(--muted); }
  .actions { margin-top: 5px; }
  .actions span { border-radius: 8px; padding: 2px 5px; background: var(--selected); }
  .actions .bone { background: var(--divider); width: 7px; height: 3px; }
  .videos { display: grid; grid-template-columns: repeat(2, minmax(0, 96px)); gap: 8px; }
  .videos.portrait { grid-template-columns: repeat(3, minmax(0, 35px)); }
  .thumb { position: relative; aspect-ratio: 16/9; margin-bottom: 4px; }
  .media, .thumb { position: relative; overflow: hidden; }
  .media::after, .thumb::after {
    content: ''; position: absolute; inset: auto 0 0; height: 44%; opacity: .55;
    background: var(--divider);
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' shape-rendering='crispEdges'%3E%3Cpath d='M0 0h1v1H0zm2 2h1v1H2z'/%3E%3C/svg%3E");
  }
  .portrait .thumb { aspect-ratio: 9/14; }
  .duration { position: absolute; z-index: 1; inset: auto 3px 3px auto; width: 15px; height: 7px; background: var(--muted); border-radius: 2px; }
  .metadata { display: flex; gap: 4px; }
  .metadata .lines { flex: 1; gap: 3px; }
  .metadata .lines .bone { height: 4px; }
  @media (max-width: 635px) { .comparison { grid-template-columns: minmax(0, 1fr); } }
  @media (prefers-reduced-motion: no-preference) and (forced-colors: none) {
    :global(.shell:not(.toner-paused)) .pulse .bone { animation: feed-ink 420ms steps(4, end) 1; }
    @keyframes feed-ink { 0%, 100% { opacity: 1; } 36% { opacity: .57; } 66% { opacity: .83; } }
  }
  @media (forced-colors: active) {
    .bone, .topics span { border: 1px solid GrayText; }
    .media::after, .thumb::after { display: none; }
  }
</style>
