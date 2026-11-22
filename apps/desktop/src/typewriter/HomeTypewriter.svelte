<script lang="ts">
  import { onMount } from 'svelte';
  import rest from './assets/rest.png';
  import './viewer.css';

  type Mount = typeof import('./viewer').mountTypewriter;
  let { paused }: { paused: boolean } = $props();
  let canvas: HTMLCanvasElement;
  let mode = $state<Parameters<Parameters<Mount>[1]['onMode']>[0]>('loading');
  let pressed = $state('');

  onMount(() => {
    let disposed = false;
    let viewer: ReturnType<Mount> | undefined;
    void import('./viewer').then(({ mountTypewriter }) => {
      if (disposed) return;
      viewer = mountTypewriter(canvas, {
        // Settings are on a different page; each Home visit reads the saved preference.
        paused,
        onMode(next) { if (!disposed) mode = next; },
        onPress(_id, label) { pressed = `${label} pressed.`; },
      });
    }).catch(() => {
      if (!disposed) mode = 'static';
    });
    return () => {
      disposed = true;
      viewer?.destroy();
    };
  });
</script>

<div class="art" data-print="launch" hidden={mode === 'hidden'}>
  <img src={rest} alt="Blue typewriter floating over a pink disc" width="208" height="192" hidden={mode === 'live'} />
  <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role (Passes arrows and physical keys through to the focused viewer.) -->
  <canvas bind:this={canvas} class="typewriter" role="application" aria-label="Cobalt typewriter"
    aria-describedby="home-typewriter-instructions" tabindex={mode === 'live' ? 0 : -1} hidden={mode !== 'live'}></canvas>
  {#if mode === 'live'}
    <p id="home-typewriter-instructions" class="visually-hidden">Drag to orbit. Tap a key to press it. With the viewer focused, use the arrows and physical keys. Esc resets the view.</p>
    <span class="visually-hidden" aria-live="polite">{pressed}</span>
  {/if}
</div>

<style>
  .art { position: relative; justify-self: center; width: min(416px, calc(100% - 32px)); aspect-ratio: 208 / 192; }
  :is(img, canvas):not([hidden]) { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
  canvas:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @media (forced-colors: active) { .art { display: none; } }
</style>
