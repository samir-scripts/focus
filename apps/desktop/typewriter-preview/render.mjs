import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const [origin, evidence] = process.argv.slice(2);
if (!origin || !evidence) throw new Error('Usage: node render.mjs VITE_ORIGIN EVIDENCE_DIR');
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // An empty, same-origin render surface: all pixels come from the shared scene.
  await page.route(`${origin}/__typewriter_render__`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }));
  await page.goto(`${origin}/__typewriter_render__`);
  const assets = await page.evaluate(async () => {
    const { createRenderer, loadMachine, setView } = await import('/src/typewriter/scene.ts');
    const { keys } = await import('/src/typewriter/keyboard.json?import');
    const machine = await loadMachine();
    const canvas = document.createElement('canvas');
    const renderer = createRenderer(canvas);
    function points() {
      return Object.fromEntries(keys.map(({ id }) => {
        const { x, y } = machine.caps.get(id).position.clone().project(machine.camera);
        return [id, [(x + 1) / 2, (1 - y) / 2]];
      }));
    }
    function render(plate = true) {
      machine.draw(renderer, plate);
      const gl = renderer.getContext();
      const corner = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, corner);
      if (plate && corner[3] !== 0) throw new Error('The first resting frame must leave the stock transparent');
      return canvas.toDataURL('image/png').split(',')[1];
    }
    const still = render();
    const rest = points();
    setView(machine.camera, -Math.PI / 5, 0); // 96 CSS px horizontal drag at 0.375° per pixel.
    const orbited = points();
    // Front-on and enlarged only for proof; use the same cap meshes, UVs and ink.
    setView(machine.camera, -.60, .69);
    machine.camera.zoom = 1.72;
    machine.camera.updateProjectionMatrix();
    renderer.setSize(1248, 1152, false);
    const proof = render(false);
    machine.dispose();
    renderer.dispose();
    return { still, proof, targets: { rest, orbited } };
  });
  assert.deepEqual(errors, []);
  const assetsDir = fileURLToPath(new URL('../src/typewriter/assets/', import.meta.url));
  await Promise.all([
    writeFile(resolve(assetsDir, 'rest.png'), Buffer.from(assets.still, 'base64')),
    writeFile(resolve(evidence, 'keyboard-front.png'), Buffer.from(assets.proof, 'base64')),
    writeFile(resolve(evidence, 'targets.json'), JSON.stringify(assets.targets, null, 2) + '\n'),
  ]);
  console.log(`Rendered still, front-on keyboard and projected hit fixtures in Chrome ${browser.version()}`);
} finally {
  await browser.close();
}
