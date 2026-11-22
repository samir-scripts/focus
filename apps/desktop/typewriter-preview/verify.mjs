import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { verifyFlick } from './verify-flick.mjs';
import { verifyTumble } from './verify-tumble.mjs';

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
  await page.mouse.move(x + 96, y, { steps: 8 });
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
  const touchRest = await touchCanvas.screenshot();
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
  assert.notDeepEqual(await touchCanvas.screenshot(), touchRest, 'touch capture orbits');
  assert.equal(await touchPage.getByRole('status').getAttribute('data-key'), 'KeyS', 'cancelled drag does not press');
  await touchPage.getByRole('button', { name: 'Reset view' }).click();
  assert.deepEqual(await touchCanvas.screenshot(), touchRest);
  for (const [dx, dy] of [[240, 0], [0, -240]]) {
    const finger = { x: touchBox.x + 28, y: touchBox.y + 280 };
    for (let pass = 0; pass < 4; pass++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: finger.x + dx, y: finger.y + dy }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const frame = await touchCanvas.screenshot();
      if (pass === 1) assert.notDeepEqual(frame, touchRest, 'two touch drags reach the opposite view');
      if (pass === 3) assert.deepEqual(frame, touchRest, 'four 240px touch drags complete a full turn');
    }
  }
  assert.equal(await touchPage.getByRole('status').getAttribute('data-key'), 'KeyS', 'touch drags do not actuate');
  console.log('PASS 390px, toner pause, touch tap, cancelled drag and exact touch wrap on both axes');

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
  async function expectBob(state) {
    const first = await liveCanvas.screenshot();
    for (let i = 0; i < 3; i++) {
      await livePage.waitForTimeout(220);
      if (!(await liveCanvas.screenshot()).equals(first)) return;
    }
    assert.fail(`machine must bob ${state}`);
  }
  await expectBob('on hover');
  await liveCanvas.focus();
  await livePage.mouse.move(4, 4);
  await expectBob('with keyboard focus');

  // Start at a known pose, then resume bob during the captured press.
  await livePage.emulateMedia({ reducedMotion: 'reduce' });
  const [spaceX, spaceY] = rest.Space;
  const latchX = liveBox.x + spaceX * liveBox.width;
  const latchY = liveBox.y + spaceY * liveBox.height + 2;
  const liveStatus = livePage.getByRole('status');
  await liveStatus.evaluate(el => {
    el.dataset.announcements = '0';
    new MutationObserver(records => {
      el.dataset.announcements = String(Number(el.dataset.announcements) + records.length);
    }).observe(el, { childList: true });
  });
  await livePage.mouse.move(latchX, latchY);
  await livePage.mouse.down();
  await livePage.emulateMedia({ reducedMotion: 'no-preference' });
  await expectBob('while the pointer is held still');
  await livePage.waitForTimeout(1000);
  assert.equal(await liveStatus.getAttribute('data-announcements'), '0', 'pointerdown alone does not actuate');
  await livePage.mouse.up();
  assert.equal(await liveStatus.getAttribute('data-key'), 'Space', 'release actuates the latched cap, not the current pixel');
  await livePage.mouse.click(latchX, latchY);
  assert.equal(await liveStatus.getAttribute('data-announcements'), '1', 'the old pixel no longer hits once the cap has moved');

  await livePage.mouse.move(liveBox.x + 30, liveBox.y + 100);
  await livePage.mouse.down();
  await livePage.mouse.move(liveBox.x + 90, liveBox.y + 100);
  await expectBob('during a captured drag');
  await livePage.mouse.up();
  assert.equal(await liveStatus.getAttribute('data-announcements'), '1', 'drag does not actuate a cap');
  assert.deepEqual(await livePage.screenshot({ clip: plateTop }), initialPlate, 'plate stays stationary during drag');
  console.log('PASS continuous bob on hover, keyboard focus, held pointer and drag; stationary plate; moving cap latched once');

  const orbitPage = await context.newPage();
  await orbitPage.goto(url);
  const orbitCanvas = orbitPage.getByRole('application');
  const orbitBox = await orbitCanvas.boundingBox();
  const startX = orbitBox.x + 28;
  const startY = orbitBox.y + 95;
  const opening = await orbitCanvas.screenshot();
  const views = [opening];
  for (const pass of [
    [['front', 92], [null, 320]],
    [['side', 12], ['rear', 252], [null, 320]],
    [[null, 320]],
  ]) {
    await orbitPage.mouse.move(startX, startY);
    await orbitPage.mouse.down();
    for (const [view, dx] of pass) {
      await orbitPage.mouse.move(startX + dx, startY, { steps: 8 });
      if (!view) continue;
      const image = await orbitCanvas.screenshot({ path: `${evidence}/orbit-${view}.png` });
      assert.ok(views.every(prior => !image.equals(prior)), `${view} must be a distinct rendered view`);
      views.push(image);
    }
    await orbitPage.mouse.up();
  }
  assert.deepEqual(await orbitCanvas.screenshot(), opening, 'three 320px drags make a full turn and wrap exactly');
  assert.equal(await orbitPage.getByRole('status').getAttribute('data-key'), null, 'full turn is not a click');
  await orbitCanvas.focus();
  for (let i = 0; i < 8; i++) await orbitPage.keyboard.press('ArrowLeft');
  const pastStop = await orbitCanvas.screenshot();
  for (let i = 0; i < 12; i++) await orbitPage.keyboard.press('ArrowLeft');
  assert.notDeepEqual(await orbitCanvas.screenshot(), pastStop, 'keyboard keeps turning beyond the old yaw stop');
  await orbitPage.keyboard.press('Escape');
  assert.deepEqual(await orbitCanvas.screenshot(), opening, 'reset after a full orbit restores the approved camera');
  for (let i = 0; i < 3; i++) {
    await orbitPage.mouse.move(startX + 320, startY);
    await orbitPage.mouse.down();
    await orbitPage.mouse.move(startX, startY, { steps: 6 });
    await orbitPage.mouse.up();
  }
  assert.deepEqual(await orbitCanvas.screenshot(), opening, 'horizontal turn wraps in the opposite direction too');
  console.log('PASS exact horizontal wrap in both directions; front/side/rear, reset and keyboard orbit');
  await verifyTumble(orbitPage, evidence);
  await orbitPage.close();

  const flickContext = await browser.newContext({ viewport, offline: true });
  const flickPage = await flickContext.newPage();
  await flickPage.goto(url);
  await verifyFlick(flickPage, evidence);
  await flickContext.close();

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
