<script lang="ts">
  import './settings-print.css';
  let { heading = $bindable() }: { heading?: HTMLHeadingElement } = $props();
</script>

<h1 class="settings-print" tabindex="-1" bind:this={heading}>
  <span class="settings-print-ink">Settings</span>
  <span class="settings-print-ink settings-print-screen" aria-hidden="true">Settings</span>
</h1>
