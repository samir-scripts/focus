<script lang="ts">
  let { particles = false }: { particles?: boolean } = $props();
</script>

<div class="stock" aria-hidden="true">
  {#if particles}
    <span class="toner slow"></span>
    <span class="toner mid"></span>
    <span class="toner quick"></span>
  {/if}
</div>

<style>
  .stock {
    display: none;
    position: absolute;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
  }

  .stock::before, .toner {
    position: absolute;
    inset: 0;
    background: var(--ink);
  }

  .stock::before {
    content: '';
    opacity: var(--grain-opacity, var(--grain-paper));
    -webkit-mask: url('./assets/paper-grain.png') 0 0 / 109px 113px repeat;
    mask: url('./assets/paper-grain.png') 0 0 / 109px 113px repeat;
  }

  .toner {
    --tile-width: 760px;
    inset: -8px 0 -8px calc(-1 * var(--tile-width));
    opacity: var(--toner-opacity);
    -webkit-mask: var(--tile) var(--toner-origin, 0 0) / var(--tile-width) 594px repeat;
    mask: var(--tile) var(--toner-origin, 0 0) / var(--tile-width) 594px repeat;
  }

  .slow { --tile: url('./assets/toner-slow.png'); --drift-time: 77s; --sway: 3px; }
  .mid { --tile: url('./assets/toner-mid.png'); --drift-time: 57s; --sway: -6px; }
  .quick { --tile: url('./assets/toner-quick.png'); --drift-time: 43s; --sway: 7px; }

  @media (prefers-reduced-motion: no-preference) {
    .toner {
      animation: drift-toner var(--drift-time) linear infinite;
      animation-play-state: var(--toner-play-state, running);
    }
  }

  @keyframes drift-toner {
    25% { transform: translate3d(calc(var(--tile-width) / 4), var(--sway), 0); }
    75% { transform: translate3d(calc(var(--tile-width) * .75), calc(-1 * var(--sway)), 0); }
    100% { transform: translate3d(var(--tile-width), 0, 0); }
  }

  @supports (mask: none) or (-webkit-mask: none) {
    .stock { display: block; }
  }

  @media (forced-colors: active) {
    .stock { display: none; }
  }
</style>
