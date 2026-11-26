<script lang="ts">
  import type { ContentRules } from './browser';

  let { rules, busy, save }: { rules: ContentRules; busy: boolean; save: (rules: ContentRules, pointer: boolean) => void } = $props();
  const labels = {
    x: [['Off', 'Show the usual Home timeline.'], ['Hide For you', 'Keep Following available.'], ['Open Following instead', 'Select X’s Following tab on Home.']],
    reddit: [['Off', 'Show the usual Home feeds.'], ['Hide recommendations', 'Keep the Following feed.'], ['Hide all Home feeds', 'Hide For You and Following feeds.']],
    youtube: [['Hide Home recommendations', 'Remove suggested videos from Home.'], ['Hide Shorts shelves and discovery', 'Keep directly opened Shorts playable.']],
    instagram: [['Hide suggested Home posts', 'Keep posts from accounts you follow.'], ['Hide Reels discovery', 'Keep individually opened reels playable.']],
  };
  let pointer = false;
  let independent = $derived(rules.site === 'youtube' || rules.site === 'instagram');
  let selected = $derived(rules.site === 'youtube' ? [rules.hideHomeRecommendations, rules.hideShorts]
    : rules.site === 'instagram' ? [rules.hideSuggestedHome, rules.hideReelsDiscovery]
    : rules.site === 'x' ? [!rules.hideForYou && !rules.openFollowing, rules.hideForYou, rules.openFollowing]
    : [!rules.hideRecommendations && !rules.hideAllHome, rules.hideRecommendations, rules.hideAllHome]);
  function change(index: number, event: Event & { currentTarget: HTMLInputElement }) {
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

<style>
  fieldset { border: 0; padding: 0; margin: 4px 0 0; min-width: 0; }
  label { display: flex; align-items: baseline; gap: 8px; min-height: 32px; padding-block: 4px; font-size: 14px; cursor: pointer; }
  input { margin: 0; width: 15px; height: 15px; align-self: start; margin-top: 2px; flex: none; accent-color: var(--accent); }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  small { color: var(--muted); font-size: 12px; }
  .instagram small { display: block; }
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
