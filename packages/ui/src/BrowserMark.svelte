<script lang="ts">
  import chrome from './assets/browsers/chrome.svg?raw';
  import chromium from './assets/browsers/chromium.svg?raw';
  import brave from './assets/browsers/brave.svg?raw';
  import firefox from './assets/browsers/firefox.svg?raw';
  import zen from './assets/browsers/zen.svg?raw';

  const marks = { chrome, chromium, brave, firefox, zen };
  let { browser }: { browser: keyof typeof marks } = $props();
</script>

<!-- Static, reviewed SVGs bundled with the application. -->
{@html marks[browser]}
