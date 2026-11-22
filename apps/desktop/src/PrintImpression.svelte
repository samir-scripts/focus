<script lang="ts">
  let { variant }: { variant: 'margin' | 'sheet' } = $props();
  const id = $props.id();
</script>

{#if variant === 'margin'}
  <div class="sites-print" data-print={variant} aria-hidden="true"></div>
{:else}
<svg data-print={variant} width="192" height="96" viewBox="0 0 192 96"
  fill="currentColor" aria-hidden="true" focusable="false">
  <defs>
    {#each [3, 2, 1] as diameter (diameter)}
      <pattern id={`${id}-dots-${diameter}`} width="4" height="8" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r={diameter / 2} />
        <circle cx="0" cy="6" r={diameter / 2} />
        <circle cx="4" cy="6" r={diameter / 2} />
      </pattern>
    {/each}
  </defs>

  <!-- The paper edge stays crisp until it curls into the inked impression. -->
  <path d="M24 76 47 12h78c-12 7-15 18-6 27-10-6-11-16-3-24H49L27 76Z" />
  <path d="M48 61c16 4 37 5 52-3 13-7 14-17 8-23 14 4 25 11 38 11l22-1-15 3-10 1c-11 0-21-4-27-7 3 12-18 26-45 26-10 0-19-3-23-7Z" />
  <path fill={`url(#${id}-dots-3)`} d="M114 44c15 8 28 7 46 6-13 5-25 6-38 1-3 13-22 20-41 21 17-5 29-14 33-28Z" />
  <path fill={`url(#${id}-dots-2)`} d="M122 51c16 6 29 4 48 1-16 9-34 10-48 6-8 11-29 16-54 16l13-2c19-1 38-8 41-21Z" />
  <path fill={`url(#${id}-dots-1)`} d="M122 58c19 5 42 1 64-5-18 10-47 17-66 11-11 7-24 11-51 11 22-3 42-6 53-17Z" />

  <!-- Three uneven toner pulls, then the straight platen. -->
  <path d="m142 46 28-2 15-1-11 2-15 2-17 1Zm-4 9 18 1 28-3-19 4-17 1-13-1Zm-12 9 21 2 30-5-14 4-22 3-18-2Z" />
  <path d="M14 77h164v3H14zm7 6h150v1H21z" />
</svg>
{/if}

<style>
  .sites-print {
    --light-print: url('./assets/sites-sage.png');
    --dark-print: url('./assets/sites-sage.png');
    inline-size: 132px;
    aspect-ratio: 22 / 13;
    background: var(--light-print) center / contain no-repeat;
  }
  :global(html[data-palette-light='cobalt']) .sites-print { --light-print: url('./assets/sites-cobalt.png'); }
  :global(html[data-palette-dark='cobalt']) .sites-print { --dark-print: url('./assets/sites-cobalt.png'); }
  :global(html[data-palette-light='plum']) .sites-print { --light-print: url('./assets/sites-plum.png'); }
  :global(html[data-palette-dark='plum']) .sites-print { --dark-print: url('./assets/sites-plum.png'); }
  :global(html[data-theme='dark']) .sites-print { background-image: var(--dark-print); }
  @media (prefers-color-scheme: dark) {
    :global(html[data-theme='system']) .sites-print { background-image: var(--dark-print); }
  }
  svg { display: block; max-inline-size: 100%; block-size: auto; color: var(--accent); pointer-events: none; }
</style>
