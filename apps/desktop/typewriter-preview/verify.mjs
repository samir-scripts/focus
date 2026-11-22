import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [artifact, evidence, origin] = process.argv.slice(2);
if (!artifact || !evidence || !origin) throw new Error('Usage: node verify.mjs HTML EVIDENCE_DIR VITE_ORIGIN');
const { rest, orbited } = JSON.parse(await readFile(`${evidence}/targets.json`, 'utf8'));
const expectedIds = ('Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal ' +
  'KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote ' +
  'ShiftLeft KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash ShiftRight Space').split(' ');
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const launch = args => chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args,
});
const url = pathToFileURL(artifact).href;
const viewport = { width: 960, height: 640 };
const browser = await launch(args);
const broken = await launch(['--disable-webgl']);
console.log(browser.version(), new Date().toISOString());

try {
  const context = await browser.newContext({ viewport, offline: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const requests = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.goto(url);
  const canvas = page.getByRole('application', { name: 'Cobalt typewriter' });
  const reset = page.getByRole('button', { name: 'Reset view' });
  const status = page.getByRole('status');
  await canvas.waitFor();
  await page.screenshot({ path: `${evidence}/rest-960x640.png` });
  const original = await canvas.screenshot();
  await page.waitForTimeout(350);
  assert.deepEqual(await canvas.screenshot(), original, 'reduced motion stays at the resting pose');
  const box = await canvas.boundingBox();
  const point = ([u, v]) => [box.x + box.width * u, box.y + box.height * v];
  const checkPress = async (id, input) => {
    // Count live announcements, including repeated hits of the same physical key.
    await status.evaluate(el => {
      el.dataset.announced = '0';
      const observer = new MutationObserver(() => { el.dataset.announced = '1'; observer.disconnect(); });
      observer.observe(el, { childList: true });
    });
    await input();
    await page.waitForFunction(() => document.querySelector('output')?.dataset.announced === '1');
    assert.equal(await status.getAttribute('data-key'), id);
  };
  assert.deepEqual(Object.keys(rest), expectedIds);
  for (const id of expectedIds) {
    await checkPress(id, () => page.mouse.click(...point(rest[id])));
    await canvas.focus();
    const key = id.startsWith('Key') ? id.slice(3) : id.startsWith('Digit') ? id.slice(5) : ({
      Minus: '-', Equal: '=', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
      ShiftLeft: 'ShiftLeft', ShiftRight: 'ShiftRight', Space: 'Space',
    })[id];
    await checkPress(id, () => page.keyboard.press(key));
    console.log(`PASS ${id} pointer + physical code`);
  }
  await canvas.focus();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(180);
  const before = await canvas.screenshot();
  const last = await status.getAttribute('data-key');
  const [x, y] = point(rest.KeyA);
  await page.mouse.move(x, y);
  await page.mouse.down();
  assert.deepEqual(await canvas.screenshot(), before, 'pointerdown alone must not press a cap');
  await page.mouse.move(x + 90, y, { steps: 8 });
  const rotated = await canvas.screenshot();
  assert.notDeepEqual(rotated, before, 'drag must orbit');
  await page.mouse.up();
  assert.equal(await status.getAttribute('data-key'), last, 'drag from a cap must not press it');
  for (const id of ['KeyA', 'KeyS']) await checkPress(id, () => page.mouse.click(...point(orbited[id])));
  await reset.click();
  await canvas.focus();
  assert.deepEqual(await canvas.screenshot(), before, 'exact reset');
  await page.keyboard.press('ArrowRight');
  assert.notDeepEqual(await canvas.screenshot(), before, 'keyboard orbit');
  await page.keyboard.press('Tab');
  assert.equal(await reset.evaluate(el => el === document.activeElement), true, 'Tab leaves viewer');
  const previous = await status.getAttribute('data-key');
  await page.keyboard.press('a');
  assert.equal(await status.getAttribute('data-key'), previous, 'keys are not handled outside viewer');

  // Unavailable and lost WebGL show the exact rest image, without live UI.
  const fallbackContext = await broken.newContext({ viewport, offline: true });
  const fallback = await fallbackContext.newPage();
  await fallback.goto(url);
  const still = fallback.getByRole('img', { name: 'Blue typewriter floating over a pink disc' });
  await still.waitFor();
  assert.equal(await fallback.getByRole('application').count(), 0);
  assert.equal(await fallback.getByRole('button').count(), 0);
  assert.deepEqual(await still.screenshot(), original, 'WebGL-disabled composition is pixel-identical');
  await fallback.screenshot({ path: `${evidence}/webgl-unavailable.png` });
  await canvas.evaluate(el => el.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.getByRole('img').waitFor();
  assert.equal(await reset.count(), 0);
  await page.emulateMedia({ forcedColors: 'active' });
  assert.equal(await page.getByRole('img').count(), 0);
  assert.deepEqual(requests, []);
  assert.deepEqual(errors.filter(message => !message.includes('CONTEXT_LOST_WEBGL')), []);
  console.log('PASS offline file, reduced motion, drag/click after orbit, reset, focus scope, WebGL fallback/context loss, forced colors');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true, offline: true });
  const touchPage = await mobile.newPage();
  await touchPage.goto(url);
  const touchCanvas = touchPage.getByRole('application');
  await touchCanvas.waitFor();
  await touchPage.getByRole('button', { name: 'Pause toner' }).click();
  const stillFrame = await touchCanvas.screenshot();
  await touchPage.waitForTimeout(350);
  assert.deepEqual(await touchCanvas.screenshot(), stillFrame);
  await touchPage.emulateMedia({ reducedMotion: 'reduce' });
  await touchPage.screenshot({ path: `${evidence}/mobile-390.png` });
  assert.equal(await touchPage.evaluate(() => document.documentElement.scrollWidth), 390);
  const touchBox = await touchCanvas.boundingBox();
  const touchPoint = ([u,v]) => [touchBox.x + touchBox.width * u, touchBox.y + touchBox.height * v];
  await touchPage.touchscreen.tap(...touchPoint(rest.KeyS));
  assert.equal(await touchPage.getByRole('status').getAttribute('data-key'), 'KeyS');
  const cdp = await mobile.newCDPSession(touchPage);
  const [tx, ty] = touchPoint(rest.KeyS);
  for (const [type, touchPoints] of [['touchStart', [{ x: tx, y: ty }]],
    ['touchMove', [{ x: tx + 70, y: ty }]], ['touchCancel', []]]) {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  }
  await touchPage.waitForTimeout(180);
  assert.notDeepEqual(await touchCanvas.screenshot(), stillFrame, 'touch capture orbits');
  assert.equal(await touchPage.getByRole('status').getAttribute('data-key'), 'KeyS', 'cancelled drag does not press');
  console.log('PASS 390px, toner pause, touch tap, captured touch orbit and cancellation');

  const live = await browser.newContext({ viewport });
  await live.route('**/*', route => new URL(route.request().url()).origin === new URL(origin).origin
    ? route.continue() : route.abort());
  const livePage = await live.newPage();
  await livePage.goto(`${origin}/typewriter-preview/`);
  await livePage.getByRole('application').waitFor();
  const liveCanvas = livePage.getByRole('application');
  const liveBox = await liveCanvas.boundingBox();
  const plateTop = { x: liveBox.x, y: liveBox.y + 22, width: liveBox.width, height: 24 };
  const initialPlate = await livePage.screenshot({ clip: plateTop });
  const initialArt = await liveCanvas.screenshot();
  await livePage.waitForTimeout(420);
  assert.notDeepEqual(await liveCanvas.screenshot(), initialArt, 'unpaused machine floats');
  assert.deepEqual(await livePage.screenshot({ clip: plateTop }), initialPlate, 'plate stays stationary');
  await livePage.mouse.move(liveBox.x + liveBox.width / 2, liveBox.y + liveBox.height / 2);
  const hovered = await liveCanvas.screenshot();
  await livePage.waitForTimeout(280);
  assert.deepEqual(await liveCanvas.screenshot(), hovered, 'hover freezes displayed frame');
  await liveCanvas.focus();
  await livePage.mouse.move(4, 4);
  await livePage.waitForTimeout(280);
  assert.deepEqual(await liveCanvas.screenshot(), hovered, 'keyboard focus outlasts the hover pause');
  await livePage.keyboard.press('Tab');
  await livePage.waitForTimeout(380);
  assert.notDeepEqual(await liveCanvas.screenshot(), hovered, 'float resumes only after engagement clears');
  console.log('PASS ambient float, stationary plate, hover and keyboard pause overlap');

  const teardown = `${origin}/__typewriter_teardown__`;
  await live.route(teardown, route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><canvas role=\"application\" tabindex=\"0\"></canvas><button>Unmount</button>' }));
  await livePage.goto(teardown);
  await livePage.evaluate(async () => {
    const { mountTypewriter } = await import('/src/typewriter/viewer.ts');
    const canvas = document.querySelector('canvas');
    const viewer = mountTypewriter(canvas, {
      onMode(mode) { canvas.dataset.mode = mode; },
      onPress(id) { canvas.dataset.pressed = id; },
    });
    document.querySelector('button').addEventListener('click', viewer.destroy, { once: true });
  });
  const testCanvas = livePage.locator('canvas[data-mode=\"live\"]');
  await testCanvas.waitFor();
  await testCanvas.focus();
  await livePage.keyboard.down('a');
  assert.equal(await testCanvas.getAttribute('data-pressed'), 'KeyA');
  await livePage.getByRole('button', { name: 'Unmount' }).click();
  await livePage.keyboard.up('a');
  await livePage.waitForFunction(() => document.querySelector('canvas').getContext('webgl2').isContextLost());
  await testCanvas.focus();
  await livePage.keyboard.press('s');
  assert.equal(await testCanvas.getAttribute('data-pressed'), 'KeyA', 'unmount removes input handlers');
  console.log('PASS destroy releases WebGL and focused input');
  console.log('PASS loopback Vite with external traffic blocked');
} finally {
  await Promise.all([browser.close(), broken.close()]);
}
