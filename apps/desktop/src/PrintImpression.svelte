<script lang="ts">
  let { variant }: { variant: 'margin' | 'sheet' } = $props();
  const id = $props.id();
</script>

{#if variant === 'margin'}
  <!-- The approved wide crop: a solid ink edge tapering into a staggered screen. -->
  <svg data-print={variant} width="96" height="40" viewBox="0 0 96 40" fill="currentColor" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={`${id}-curl`}>
        <path d="M0 40V7C0 2 3 0 8 0h14c16 1 23 12 74 1C86 16 75 27 96 27 72 44 49 40 0 40Z" />
      </clipPath>
      {#each [2.7, 2.15, 1.6, .9] as diameter (diameter)}
        <pattern id={`${id}-curl-${diameter}`} width="5.5" height="5.5" patternUnits="userSpaceOnUse">
          <circle cx="1.375" cy="1.375" r={diameter / 2} />
          <circle cx="4.125" cy="1.375" r={diameter / 2} />
          <circle cx="0" cy="4.125" r={diameter / 2} />
          <circle cx="2.75" cy="4.125" r={diameter / 2} />
          <circle cx="5.5" cy="4.125" r={diameter / 2} />
        </pattern>
      {/each}
    </defs>
    <g clip-path={`url(#${id}-curl)`}>
      <path d="M0 0h16c1 15 5 25 11 40H0Z" />
      <path fill={`url(#${id}-curl-2.7)`} d="M16 0h14c0 15 6 29 14 40H27C21 25 17 15 16 0Z" />
      <path fill={`url(#${id}-curl-2.15)`} d="M30 0h18c-2 17 5 30 13 40H44C36 29 30 15 30 0Z" />
      <path fill={`url(#${id}-curl-1.6)`} d="M48 0h19c-1 17 5 30 12 40H61C53 30 46 17 48 0Z" />
      <path fill={`url(#${id}-curl-0.9)`} d="M67 0h29v40H79c-7-10-13-23-12-40Z" />
      <path d="M16 0h6C39 9 61 13 96 1 74 12 47 18 22 4ZM37 40c20-2 39-3 59-13-17 13-31 15-59 13Z" />
    </g>
  </svg>
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
  svg { display: block; max-inline-size: 100%; block-size: auto; color: var(--accent); pointer-events: none; }
</style>
