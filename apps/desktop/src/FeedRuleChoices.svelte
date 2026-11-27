<script lang="ts">
  import type { ContentRules, NavigationMode } from './browser';

  let { rules, busy, save }: { rules: ContentRules; busy: boolean; save: (rules: ContentRules, pointer: boolean) => void } = $props();
  const labels = {
    x: [['Off', 'Show the usual Home timeline.'], ['Hide For you', 'Keep Following available.'], ['Open Following instead', 'Select X’s Following tab on Home.']],
    reddit: [['Off', 'Show the usual Home feeds.'], ['Hide recommendations', 'Keep the Following feed.'], ['Hide all Home feeds', 'Hide For You and Following feeds.']],
    youtube: [['Hide Home recommendations', 'Remove suggested videos from Home.'], ['Hide Shorts shelves and discovery', 'Keep directly opened Shorts playable.']],
    instagram: [['Hide suggested Home posts', 'Keep posts from accounts you follow.'], ['Hide Reels discovery', 'Keep individually opened reels playable.']],
  };
  const modes: readonly [NavigationMode, string, string?][] = [
    ['off', 'Off'],
    ['openedVideos', 'Opened videos', 'Keep an individually opened video selected.'],
    ['allShortVideoViewers', 'All short-video viewers', 'Also keep the active video selected in discovery feeds.'],
  ];
  let pointer = false;
  let independent = $derived(rules.site === 'youtube' || rules.site === 'instagram');
  let selected = $derived(rules.site === 'youtube' ? [rules.hideHomeRecommendations, rules.hideShorts]
    : rules.site === 'instagram' ? [rules.hideSuggestedHome, rules.hideReelsDiscovery]
    : rules.site === 'x' ? [!rules.hideForYou && !rules.openFollowing, rules.hideForYou, rules.openFollowing]
    : rules.site === 'reddit' ? [!rules.hideRecommendations && !rules.hideAllHome, rules.hideRecommendations, rules.hideAllHome] : []);
  function change(index: number, event: Event & { currentTarget: HTMLInputElement }) {
    if (rules.site === 'tiktok') return;
    const checked = event.currentTarget.checked;
    const next: ContentRules = rules.site === 'youtube'
      ? { ...rules, ...(index === 0 ? { hideHomeRecommendations: checked } : { hideShorts: checked }) }
      : rules.site === 'instagram' ? { ...rules, ...(index === 0 ? { hideSuggestedHome: checked } : { hideReelsDiscovery: checked }) }
      : rules.site === 'x' ? { site: 'x', hideForYou: index === 1, openFollowing: index === 2 }
      : { site: 'reddit', hideRecommendations: index === 1, hideAllHome: index === 2 };
    save(next, pointer);
    pointer = false;
  }
</script>

{#if rules.site !== 'tiktok'}
<fieldset aria-label={rules.site === 'instagram' ? 'Instagram content rules' : independent ? 'Discovery' : 'Home feed'} disabled={busy} class:instagram={rules.site === 'instagram'}>
  {#each labels[rules.site] as [label, hint], index (label)}
    <label onpointerdown={() => { pointer = true; }} onpointercancel={() => { pointer = false; }}>
      <input type={independent ? 'checkbox' : 'radio'} name={independent ? undefined : `${rules.site}-feed`}
        aria-label={label} aria-describedby={`feed-hint-${index}`} checked={selected[index]}
        onkeydown={() => { pointer = false; }} onchange={(event) => change(index, event)} />
      <span><strong>{label}</strong> <small id={`feed-hint-${index}`}>{hint}</small></span>
    </label>
  {/each}
</fieldset>
{/if}
{#if 'navigationMode' in rules}
  <fieldset class="navigation" disabled={busy}>
    <legend>Limit short-video navigation</legend>
    {#each modes as [mode, label, hint] (mode)}
      <label onpointerdown={() => { pointer = true; }} onpointercancel={() => { pointer = false; }}>
        <input type="radio" name="short-video-navigation" aria-label={label}
          aria-describedby={hint ? `navigation-${mode}` : undefined} checked={rules.navigationMode === mode}
          onkeydown={() => { pointer = false; }} onchange={() => {
            if ('navigationMode' in rules) save({ ...rules, navigationMode: mode }, pointer);
            pointer = false;
          }} />
        <span><strong>{label}</strong>{#if hint}<small id={`navigation-${mode}`}>{hint}</small>{/if}</span>
      </label>
    {/each}
  </fieldset>
  <small class="comments">Comments and replies can still scroll.</small>
{/if}

<style>
  fieldset { border: 0; padding: 0; margin: 4px 0 0; min-width: 0; }
  label { display: flex; align-items: baseline; gap: 8px; min-height: 32px; padding-block: 4px; font-size: 14px; cursor: pointer; }
  input { margin: 0; width: 15px; height: 15px; align-self: start; margin-top: 2px; flex: none; accent-color: var(--accent); }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  small { color: var(--muted); font-size: 12px; }
  .instagram small { display: block; }
  .navigation legend { padding: 0; font-size: 14px; font-weight: 700; }
  .navigation label { align-items: start; min-height: 0; padding-block: 3px; }
  .navigation small { display: block; margin-top: 1px; }
  .comments { display: block; margin: 3px 0 0 23px; }
  @media (forced-colors: none) {
    input {
      appearance: none; display: grid; place-items: center;
      border: 1px solid var(--edge); background: var(--surface);
    }
    input[type='radio'] { border-radius: 50%; }
    input:checked { border-color: var(--accent); background: var(--accent); }
    input:checked::after { content: ''; display: block; background: var(--on-accent); }
    input[type='checkbox']:checked::after {
      width: 10px; height: 9px; clip-path: polygon(0 45%, 18% 27%, 39% 51%, 81% 4%, 100% 22%, 39% 92%);
    }
    input[type='radio']:checked::after { width: 6px; height: 6px; border-radius: 50%; }
    input:disabled { opacity: .55; }
  }
  @media (max-width: 635px) { small { display: block; } }
</style>
