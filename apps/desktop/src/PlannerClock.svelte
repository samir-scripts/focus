<script lang="ts">
  import { onMount, tick } from 'svelte';
  let { value, close }: { value: string; close: (value?: string) => void } = $props();
  const read = () => value.split(':').map(Number);
  let hours = $state(String(read()[0] % 12 || 12));
  let minutes = $state(String(read()[1]).padStart(2, '0'));
  let pm = $state(read()[0] >= 12);
  let mode = $state<'hour' | 'minute'>('hour');
  let invalid = $state(false);
  let dialog: HTMLDialogElement;
  let hourInput: HTMLInputElement;
  let minuteInput: HTMLInputElement;
  const indices = Array.from({ length: 60 }, (_, i) => i);
  const point = (index: number, radius: number) => [50 + radius * Math.sin(index * Math.PI / 30), 50 - radius * Math.cos(index * Math.PI / 30)];
  let hourPoint = $derived(point((Number(hours) % 12) * 5 + Number(minutes) / 12, 24));
  let minutePoint = $derived(point(Number(minutes), 33));
  onMount(() => { dialog.showModal(); hourInput.focus(); });

  async function select(index: number) {
    if (mode === 'hour') {
      hours = String(index / 5 || 12);
      mode = 'minute';
      await tick();
      minuteInput.focus();
    } else {
      minutes = String(index).padStart(2, '0');
    }
  }
  function finish() {
    const h = Number(hours), m = Number(minutes);
    if (!/^\d{1,2}$/.test(hours) || h < 1 || h > 12) { invalid = true; hourInput.focus(); return; }
    if (!/^\d{1,2}$/.test(minutes) || m > 59) { invalid = true; minuteInput.focus(); return; }
    close(`${String(h % 12 + (pm ? 12 : 0)).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
</script>

<dialog class="planner clock-picker" bind:this={dialog} aria-labelledby="planner-clock-heading" oncancel={(event) => { event.preventDefault(); close(); }}>
  <h3 id="planner-clock-heading">Set time</h3>
  <div class="clock-fields">
    <input bind:this={hourInput} bind:value={hours} aria-label="Hour" inputmode="numeric" maxlength="2" onfocus={() => mode = 'hour'} />
    <span aria-hidden="true">:</span>
    <input bind:this={minuteInput} bind:value={minutes} aria-label="Minute" inputmode="numeric" maxlength="2" onfocus={() => mode = 'minute'} />
    <div class="period" role="group" aria-label="AM or PM">
      <button type="button" class="planner-key" aria-pressed={!pm} onclick={() => pm = false}><span>AM</span></button>
      <button type="button" class="planner-key" aria-pressed={pm} onclick={() => pm = true}><span>PM</span></button>
    </div>
  </div>
  {#if invalid}<p role="alert">Enter an hour from 1 to 12 and a minute from 0 to 59.</p>{/if}
  <div class="dial" role="group" aria-label={mode === 'hour' ? 'Select hour' : 'Select minute'}>
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path class="bezel" d="M35 1H65V4H75V9H83V15H89V23H95V34H99V66H95V77H89V85H83V91H75V96H65V99H35V96H25V91H17V85H11V77H5V66H1V34H5V23H11V15H17V9H25V4H35Z" />
      <line x1="50" y1="50" x2={hourPoint[0]} y2={hourPoint[1]} stroke-width="2" />
      <line x1="50" y1="50" x2={minutePoint[0]} y2={minutePoint[1]} stroke-width="1" />
      <rect class="pivot" x="48" y="48" width="4" height="4" />
    </svg>
    {#each indices as i}
      {#if mode === 'minute' || i % 5 === 0}
        {@const label = i % 5 === 0}
        {@const [x, y] = point(i, label ? 33 : 43)}
        {@const selected = mode === 'hour' ? Number(hours) % 12 * 5 === i : Number(minutes) === i}
        <button type="button" class="dial-key" class:numeral={label} style:left={`${x}%`} style:top={`${y}%`}
          aria-label={mode === 'hour' ? `${i / 5 || 12} hours` : `${i} minutes`} aria-pressed={selected}
          tabindex={label || selected ? 0 : -1} onclick={() => select(i)}>
          <span>{label ? (mode === 'hour' ? i / 5 || 12 : String(i).padStart(2, '0')) : ''}</span>
        </button>
      {/if}
    {/each}
  </div>
  <div class="planner-actions">
    <button type="button" class="planner-key" onclick={() => close()}><span>Cancel</span></button>
    <button type="button" class="planner-key" onclick={finish}><span>Set time</span></button>
  </div>
</dialog>

<style>
  h3 { margin: 0 0 12px; }
  .clock-picker { inline-size: 340px; }
  .clock-fields { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .clock-fields input { inline-size: 2.5ch; padding-inline: 3px; text-align: center; }
  .period { display: flex; gap: 4px; margin-inline-start: 4px; }
  .period button { padding-inline: 5px; }
  .dial { position: relative; inline-size: min(100%, 260px); aspect-ratio: 1; margin: 14px auto 0; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; stroke: currentColor; }
  .bezel { fill: var(--surface); stroke-width: 1.5; }
  .pivot { fill: var(--accent); stroke: none; }
  .dial-key { position: absolute; translate: -50% -50%; display: grid; place-items: center; width: 4.4%; aspect-ratio: 1; padding: 0; border: 0; color: inherit; background: transparent; font: inherit; }
  .dial-key span { display: block; width: 3px; height: 3px; background: currentColor; }
  .dial-key.numeral { width: 12%; font-size: clamp(14px, 4vw, 21px); font-weight: bold; }
  .dial-key.numeral span { width: auto; height: auto; background: none; transition: transform 180ms ease-out; }
  .dial-key:is(:hover, [aria-pressed='true']) { color: var(--surface); background: var(--ink); }
  .dial-key.numeral:active span { transform: translateY(1px); transition-duration: 55ms; }
  @media (prefers-reduced-motion: reduce) { .dial-key.numeral span, .dial-key.numeral:active span { transform: none; transition: none; } }
  @media (forced-colors: active) {
    .dial-key:is(:hover, [aria-pressed='true']) { forced-color-adjust: none; color: HighlightText; background: Highlight; }
    .pivot { fill: Highlight; }
  }
</style>
