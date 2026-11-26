<script lang="ts">
  import type { ContentRules } from './browser';

  let { rules, busy, save }: { rules: ContentRules; busy: boolean; save: (rules: ContentRules, pointer: boolean) => void } = $props();
  const labels = {
    x: [['Off', 'Show the usual Home timeline.'], ['Hide For you', 'Keep Following available.'], ['Open Following instead', 'Select X’s Following tab on Home.']],
    reddit: [['Off', 'Show the usual Home feeds.'], ['Hide recommendations', 'Keep the Following feed.'], ['Hide all Home feeds', 'Hide For You and Following feeds.']],
    youtube: [['Hide Home recommendations', 'Remove suggested videos from Home.'], ['Hide Shorts shelves and discovery', 'Keep directly opened Shorts playable.']],
  };
  let pointer = false;
  let selected = $derived(rules.site === 'youtube' ? [rules.hideHomeRecommendations, rules.hideShorts]
    : rules.site === 'x' ? [!rules.hideForYou && !rules.openFollowing, rules.hideForYou, rules.openFollowing]
    : [!rules.hideRecommendations && !rules.hideAllHome, rules.hideRecommendations, rules.hideAllHome]);
  function change(index: number, event: Event & { currentTarget: HTMLInputElement }) {
    const checked = event.currentTarget.checked;
    const next: ContentRules = rules.site === 'youtube'
      ? { ...rules, ...(index === 0 ? { hideHomeRecommendations: checked } : { hideShorts: checked }) }
      : rules.site === 'x' ? { site: 'x', hideForYou: index === 1, openFollowing: index === 2 }
      : { site: 'reddit', hideRecommendations: index === 1, hideAllHome: index === 2 };
    save(next, pointer);
    pointer = false;
  }
</script>

<fieldset aria-label={rules.site === 'youtube' ? 'Discovery' : 'Home feed'} disabled={busy}>
  {#each labels[rules.site] as [label, hint], index (label)}
    <label onpointerdown={() => { pointer = true; }} onpointercancel={() => { pointer = false; }}>
      <input type={rules.site === 'youtube' ? 'checkbox' : 'radio'} name={rules.site === 'youtube' ? undefined : `${rules.site}-feed`}
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
  @media (max-width: 635px) { small { display: block; } }
</style>
