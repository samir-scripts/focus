<script lang="ts">
  let { size = 32 }: { size?: number } = $props();
</script>

<!-- Offset carriage and paper marks adapted from the approved bitmap proof. -->
<svg width={size} height={size} viewBox="3 0 92 92" fill="currentColor" aria-hidden="true" focusable="false">
  <path fill-rule="evenodd" d="M22 8h47v31h14v-6h9v14H6v-8h16zm7 6v25h33V14zM17 52h61l11 15v13H5V67zm0 13v5h10v-5zm15 0v5h33v-5zm39 0v5h7v-5z" />
  <path d="M33 21h18v4H33zm0 8h12v3H33zM9 83h68v2H9z" />
  <circle cx="54.5" cy="23" r="1.7" />
  <circle cx="59" cy="23" r="1" />
  <circle cx="48.5" cy="30.5" r="1.3" />
</svg>
