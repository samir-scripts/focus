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
  const bezel = 'M16 1H84V2H88V4H91V6H94V9H96V12H98V16H99V84H98V88H96V91H94V94H91V96H88V98H84V99H16V98H12V96H9V94H6V91H4V88H2V84H1V16H2V12H4V9H6V6H9V4H12V2H16Z';
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
  function selectDial(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return;
    const dial = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    const dx = event.clientX - dial.x - dial.width / 2;
    const dy = event.clientY - dial.y - dial.height / 2;
    const radius = Math.hypot(dx, dy);
    if (radius < dial.width * .22 || radius > dial.width * .48) return;
    const angle = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
    const step = mode === 'hour' ? 5 : 1;
    void select(Math.round(angle * (60 / step)) * step % 60);
  }
  function finish() {
    const h = Number(hours), m = Number(minutes);
    if (!/^\d{1,2}$/.test(hours) || h < 1 || h > 12) { invalid = true; hourInput.focus(); return; }
    if (!/^\d{1,2}$/.test(minutes) || m > 59) { invalid = true; minuteInput.focus(); return; }
    close(`${String(h % 12 + (pm ? 12 : 0)).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
</script>

<dialog class="planner clock-picker" bind:this={dialog} aria-labelledby="planner-clock-heading"
  onkeydown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}
  oncancel={(event) => { event.preventDefault(); close(); }}>
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
    <svg viewBox="0 0 100 100" aria-hidden="true" onpointerup={selectDial}>
      <path class="bezel" d={bezel} />
      <path class="face" d={bezel} transform="translate(4 4) scale(.92)" />
      {#each indices as i}
        {@const [x, y] = point(i, 39)}
        {@const size = i % 15 === 0 ? 2 : i % 5 === 0 ? 1.4 : .65}
        <rect class:quarter={i % 15 === 0} class:major={i % 5 === 0} class="tick"
          x={x - size / 2} y={y - size / 2} width={size} height={size} />
      {/each}
      <line class="hour-hand" x1="50" y1="50" x2={hourPoint[0]} y2={hourPoint[1]} stroke-width="2.7" />
      <line x1="50" y1="50" x2={minutePoint[0]} y2={minutePoint[1]} stroke-width="1" />
      <rect x="47.5" y="47.5" width="5" height="5" transform="rotate(45 50 50)" />
      <rect class="pivot" x="48" y="48" width="4" height="4" />
    </svg>
    {#each indices as i}
      {#if mode === 'minute' || i % 5 === 0}
        {@const label = i % 5 === 0}
        {@const [x, y] = point(i, label ? 30 : 39)}
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
    <button type="button" class="planner-key primary" onclick={finish}><span>Set time</span></button>
  </div>
</dialog>

<style>
  h3 { margin: 0 0 12px; }
  .clock-picker { inline-size: 364px; }
  .clock-fields { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; }
  .clock-fields input { inline-size: 2.5ch; padding-inline: 0; text-align: center; font-size: 24px; line-height: 1.1; font-weight: bold; border: 0; border-bottom: 1px solid var(--edge); }
  .clock-fields input:focus { color: var(--accent); }
  .period { display: flex; gap: 4px; margin-inline-start: 4px; }
  .dial { position: relative; inline-size: min(100%, 288px); aspect-ratio: 1; margin: 14px auto 0; }
  .planner-actions { border-top: 1px solid var(--edge); padding-top: 10px; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; stroke: currentColor; shape-rendering: crispEdges; }
  .bezel { fill: var(--divider); stroke: var(--muted); stroke-width: .75; }
  .face { fill: var(--surface); stroke-width: 1; }
  .tick { fill: var(--muted); stroke: none; }
  .tick:not(.major) { opacity: .7; }
  .tick.quarter, .pivot { fill: var(--accent); stroke: none; }
  .hour-hand { stroke: var(--accent); }
  .dial-key { position: absolute; translate: -50% -50%; display: grid; place-items: center; width: 4.4%; aspect-ratio: 1; padding: 0; border: 0; color: inherit; background: transparent; font: inherit; transition: background-color var(--motion-hover) var(--ease), color var(--motion-hover) var(--ease); }
  .dial-key span { display: block; }
  .dial-key.numeral { width: 12%; font-size: clamp(14px, 4vw, 24px); font-weight: bold; }
  .dial-key.numeral span { transition: transform 180ms ease-out; }
  .dial-key:is(:hover, [aria-pressed='true']) { color: var(--surface); background: var(--ink); }
  .dial-key.numeral:active span { transform: translateY(1px); transition-duration: 55ms; }
  @media (prefers-reduced-motion: reduce) { .dial-key.numeral span, .dial-key.numeral:active span { transform: none; transition: none; } }
  @media (forced-colors: active) {
    .dial-key:is(:hover, [aria-pressed='true']) { forced-color-adjust: none; color: HighlightText; background: Highlight; }
    .pivot { fill: Highlight; }
  }
</style>
