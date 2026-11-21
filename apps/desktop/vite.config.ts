import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte({ preprocess: vitePreprocess() }), svelteTesting()],
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  // The VM environment uses jsdom's own window, not Node's Web Storage globals.
  test: { environment: 'jsdom', pool: 'vmThreads', include: ['apps/desktop/src/**/*.test.ts', 'tests/{sites,entry}/**/*.test.ts'] },
});
