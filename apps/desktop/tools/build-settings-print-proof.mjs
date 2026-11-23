import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const load = path => readFile(resolve(root, path), 'utf8');
const inline = async path => {
  const css = await load(path);
  const urls = [...css.matchAll(/url\(['"]([^'"]+)['"]\)/g)];
  const replacements = await Promise.all(urls.map(async ([from, url]) => {
    const data = await readFile(resolve(root, dirname(path), url));
    const mime = url.endsWith('.svg') ? 'image/svg+xml' : url.endsWith('.woff2') ? 'font/woff2' : 'font/ttf';
    return [from, `url(data:${mime};base64,${data.toString('base64')})`];
  }));
  return replacements.reduce((out, [from, to]) => out.replaceAll(from, to), css);
};
const markup = (await load('apps/desktop/src/SettingsPrint.svelte')).match(/<h1[\s\S]*<\/h1>/)[0].replace(' bind:this={heading}', '');
const divider = await readFile(resolve(root, 'apps/desktop/src/assets/ink-rule.svg'));
const html = `<!doctype html>
<!-- Generated with node apps/desktop/tools/build-settings-print-proof.mjs. -->
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>focus. — Settings print proof</title>
<style>
${await inline('packages/ui/src/tokens.css')}
${await inline('apps/desktop/src/settings-print.css')}
body { margin: 0; padding: 32px; background: var(--canvas); color: var(--ink); font-family: var(--font-ui); }
header { padding-block-end: 16px; border-bottom: 1px solid var(--divider); }
@media (forced-colors: none) {
  header { position: relative; border-color: transparent; }
  header::after { content: ''; position: absolute; inset: auto 0 -1px; height: 3px; background: var(--muted); mask: url(data:image/svg+xml;base64,${divider.toString('base64')}) repeat-x left center / 223px 3px; }
}
:root[data-hidden], :root:has(#pause:checked) { --toner-play-state: paused; }
p { margin-block-start: 24px; }
</style>
<header>${markup}</header>
<p><label><input id="pause" type="checkbox"> Pause toner particles</label></p>
<script>document.addEventListener('visibilitychange', () => document.documentElement.toggleAttribute('data-hidden', document.hidden));</script>
</html>\n`;
await writeFile(resolve(root, 'docs/design/productivity/references/3f-settings-print.html'), html);
