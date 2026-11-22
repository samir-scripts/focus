import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const destination = process.argv[2];
if (!destination) throw new Error('Usage: node build.mjs OUTPUT.html');
const desktop = fileURLToPath(new URL('..', import.meta.url));
const built = await build({
  root: desktop,
  configFile: false,
  build: {
    write: false,
    assetsInlineLimit: () => true,
    modulePreload: false,
    rollupOptions: {
      input: resolve(desktop, 'typewriter-preview/index.html'),
      output: { inlineDynamicImports: true },
    },
  },
});
const { output } = Array.isArray(built) ? built[0] : built;
const entry = output.find(file => file.type === 'asset' && file.fileName.endsWith('.html'));
let html = String(entry.source);
for (const file of output) {
  if (file.type === 'chunk') {
    html = html.replace(/<script[^>]+src="[^\"]+"[^>]*><\/script>/, () =>
      `<script type="module">${file.code.replace(/<\/script/gi, '<\\/script')}</script>`);
  } else if (file.fileName.endsWith('.css')) {
    html = html.replace(/<link[^>]+rel="stylesheet"[^>]*>/, () => `<style>${file.source}</style>`);
  } else if (file !== entry) {
    throw new Error(`Unexpected non-inline output: ${file.fileName}`);
  }
}
const three = dirname(dirname(createRequire(import.meta.url).resolve('three')));
const notices = await Promise.all([
  readFile(resolve(three, 'LICENSE'), 'utf8'),
  readFile(resolve(desktop, '../../docs/design/productivity/typewriter/source/LICENSE.txt'), 'utf8'),
  readFile(resolve(desktop, '../../THIRD_PARTY_NOTICES.md'), 'utf8').then(text => text.slice(text.indexOf('## Mona Sans and Mona Sans Mono'))),
]);
html = html.replace('</body>', () => `<!-- Offline preview notices\n${notices.join('\n\n').replaceAll('-->', '—>')}\n-->\n</body>`);
await writeFile(destination, html);
console.log(`${destination}: ${Buffer.byteLength(html)} bytes`);
