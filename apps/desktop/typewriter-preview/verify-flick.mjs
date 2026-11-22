import assert from 'node:assert/strict';

export async function verifyFlick(page, evidence) {
  const canvas = page.getByRole('application');
  const reset = page.getByRole('button', { name: 'Reset view' });
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  const x = box.x + box.width / 2, y = box.y + 95;
  // Center, then pause bob independently of reduced motion so screenshots isolate yaw.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Pause toner' }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  async function drag(distance, stepDelay, hold = 0, vertical = false) {
    await reset.click();
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      if (stepDelay) await page.waitForTimeout(stepDelay);
      const offset = distance * i / 6;
      await page.mouse.move(x + (vertical ? 0 : offset), y + (vertical ? offset : 0));
    }
    if (hold) await page.waitForTimeout(hold);
  }

  async function settled(name) {
    await page.waitForTimeout(650);
    return canvas.screenshot(name && evidence ? { path: `${evidence}/flick-${name}.png` } : {});
  }

  await drag(96, 180);
  await page.mouse.up();
  const atRelease = await settled('gentle');

  await drag(96, 0);
  const early = await canvas.screenshot({ path: `${evidence}/held-early.png` });
  const caughtUp = await settled();
  await canvas.screenshot({ path: `${evidence}/held-caught-up.png` });
  assert.notDeepEqual(early, caughtUp, 'weighted drag keeps catching up while held still');
  assert.deepEqual(caughtUp, atRelease, 'held fast drag reaches the same target as a gentle drag');
  await page.mouse.up();
  assert.deepEqual(await settled(), caughtUp, 'held release adds no momentum');

  await drag(96, 0);
  await page.mouse.up();
  const fast = await settled('quick');
  assert.ok(!fast.equals(atRelease), 'same-distance flick must coast farther than gentle drag');
  await page.waitForTimeout(200);
  assert.deepEqual(await canvas.screenshot(), fast, 'flick settles within 600ms');

  // Compare actual pixels against deliberate drags in and against release direction.
  const references = [];
  for (const distance of [32, 96, 128, 152, 172, 208]) {
    await drag(distance, 0, 290);
    references.push((await canvas.screenshot()).toString('base64'));
    await page.mouse.up();
  }
  const nearest = await page.evaluate(async ({ actual, references }) => {
    async function pixels(png) {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const image = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      image.drawImage(bitmap, 0, 0);
      bitmap.close();
      return image.getImageData(0, 0, image.canvas.width, image.canvas.height).data;
    }
    const target = await pixels(actual);
    let best = Infinity, nearest = -1;
    for (const [index, png] of references.entries()) {
      const reference = await pixels(png);
      let error = 0;
      for (let i = 0; i < target.length; i++) error += Math.abs(target[i] - reference[i]);
      if (error < best) { best = error; nearest = index; }
    }
    return nearest;
  }, { actual: fast.toString('base64'), references });
  assert.ok(nearest >= 2 && nearest <= 4, `flick continues in drag direction without exceeding its cap (reference ${nearest})`);

  await drag(96, 180, 0, true);
  await page.mouse.up();
  const verticalGentle = await settled();
  await drag(96, 0, 0, true);
  await page.mouse.up();
  assert.notDeepEqual(await settled('vertical'), verticalGentle, 'vertical flick also coasts');

  await drag(96, 0);
  await page.mouse.up();
  await page.mouse.down();
  const regrabbed = await canvas.screenshot();
  assert.deepEqual(await settled(), regrabbed, 'new grab interrupts coast');
  await page.mouse.up();

  await drag(96, 0);
  await page.mouse.up();
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  const keyed = await canvas.screenshot();
  assert.deepEqual(await settled(), keyed, 'keyboard orbit interrupts coast');

  await drag(96, 0);
  await page.mouse.up();
  await reset.click();
  const opening = await canvas.screenshot();
  assert.deepEqual(await settled(), opening, 'reset interrupts coast');

  await drag(96, 0);
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const interrupted = await canvas.screenshot();
  assert.deepEqual(await settled(), interrupted, 'reduced motion interrupts coast');
  await drag(96, 0);
  await page.mouse.up();
  assert.deepEqual(await settled(), atRelease, 'reduced motion allows direct drag but no coast');
  assert.equal(await page.getByRole('status').getAttribute('data-key'), null, 'drags never actuate caps');
  console.log('PASS held chase and catch-up, same-distance slow/fast release, vertical coast, direction/cap, settling and interruption');
}
