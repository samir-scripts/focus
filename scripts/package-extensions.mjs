import { build as viteBuild } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { build as bundle } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extension = resolve(root, 'apps/extension');
const artifacts = resolve(root, 'artifacts/extensions');
const ui = resolve(artifacts, '.ui-build');
await mkdir(artifacts, { recursive: true });
await rm(ui, { recursive: true, force: true });
await viteBuild({
  configFile: false,
  root: extension,
  base: './',
  plugins: [svelte({ preprocess: vitePreprocess() })],
  build: { outDir: ui, emptyOutDir: true, rollupOptions: { input: { setup: resolve(extension, 'setup.html'), popup: resolve(extension, 'popup.html') } } },
});
const version = JSON.parse(await readFile(resolve(extension, 'package.json'), 'utf8')).version;
for (const browser of ['chromium', 'firefox']) {
  const dir = resolve(artifacts, browser);
  const zip = resolve(artifacts, `focus-${browser}.zip`);
  await rm(dir, { recursive: true, force: true });
  await cp(ui, dir, { recursive: true });
  await cp(resolve(root, 'THIRD_PARTY_NOTICES.md'), resolve(dir, 'THIRD_PARTY_NOTICES.md'));
  const manifest = JSON.parse(await readFile(resolve(extension, `manifest.${browser}.json`), 'utf8'));
  manifest.version = version;
  if (browser === 'chromium') manifest.key = JSON.parse(await readFile(resolve(extension, 'chromium-test-key.json'), 'utf8')).key;
  await writeFile(resolve(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await bundle({ entryPoints: [resolve(extension, 'src/background.ts'), resolve(extension, 'src/content.ts')], outdir: dir, bundle: true, format: 'iife', platform: 'browser', target: ['chrome120', 'firefox140'], logLevel: 'warning' });
  await cp(resolve(extension, 'src/sites/youtube.css'), resolve(dir, 'youtube.css'));
  await rm(zip, { force: true });
  execFileSync('zip', ['-X', '-q', '-r', zip, '.'], { cwd: dir });
}
await rm(ui, { recursive: true, force: true });
